import type { Config } from './config.js';
import type { Bus } from './bus.js';
import type { IdentityEngine } from './identity.js';
import { TOOL_DEFS, toAnthropicTools, type ToolDef } from './tools.js';

export type ToolExecutor = (name: string, args: Record<string, any>) => Promise<string>;

const BRAIN_RULES = `
You are OPC Brain, the central coordinator. Follow the AGENTS.md protocol and Handoff Protocols above.

Execution rules:
- Chat queries: answer directly, no tools.
- Action requests: call dispatch_task with correct msg_type, then execute_role_task.
- Pick the most relevant role per AGENTS.md Decision Rules.
- When dispatching, always set msg_type per Decision Rules and include depends_on/artifacts per Handoff Protocols.
- For compound tasks, decompose and dispatch in dependency order, passing artifact paths downstream.
- PM tasks run interactively (deepthink). Other roles run in background.
- Use run_bash for shell commands. Always include a description. User approves first.
- Installed skills (skill_*) are available. Use when relevant.
- Approval gates: call ask_user at mandatory gates (PRD review, tech decision, design review, launch readiness, budget/scope change). Wait for user approval before proceeding.
- Agents learn from recent task history automatically.
- Contract excerpting: when dispatching a task, read the project PRD and design_system.md first, then paste ONLY the sections relevant to that task into the dispatch content field. Never inject the full document — excerpt the minimum context the agent needs (acceptance criteria, related component specs, token values). Mark excerpts with [PRD excerpt] or [Design System excerpt] headers so agents know the source.
- Project discovery: before creating a project, always call list_projects first. If any existing project's name or keywords overlap with the user's request (e.g. "贪吃蛇2.0" matches project with keyword "贪吃蛇"), call ask_user with options: 1) Place as sibling folder alongside existing project (pass parent=existing_project_name to create_project), 2) Create as independent new project. If no related project found, proceed with normal location choice.
- Project creation: call create_project with title and keywords (2-5 terms from user request). Use ask_user with options to let user choose code location (workspace or desktop) unless parent is set. All subsequent agent file writes go to the project code directory.
- Be concise.`;

interface Message {
  role: string;
  content: any;
  tool_calls?: any[];
  tool_call_id?: string;
}

export class Brain {
  private config: Config;
  private bus: Bus;
  private workspace: string;
  private identity: IdentityEngine | null;
  tools: ToolDef[];
  private messages: Message[] = [];
  private client: any = null;
  private systemPromptCache: string | null = null;

  constructor(
    config: Config,
    bus: Bus,
    workspace: string,
    identity: IdentityEngine | null = null,
    tools?: ToolDef[]
  ) {
    this.config = config;
    this.bus = bus;
    this.workspace = workspace;
    this.identity = identity;
    this.tools = tools ?? TOOL_DEFS;
  }

  get systemPrompt(): string {
    if (this.systemPromptCache === null) {
      const parts: string[] = [];
      if (this.identity) {
        const agentsMd = this.identity.loadAgentsMd();
        if (agentsMd) parts.push(agentsMd);
        const handoff = this.identity.loadHandoff();
        if (handoff) parts.push(handoff);
        const approvalRules = this.identity.loadBossIdentity();
        if (approvalRules) parts.push(approvalRules);
      }
      parts.push(BRAIN_RULES);
      this.systemPromptCache = parts.join('\n');
    }
    return this.systemPromptCache;
  }

  private async getClient(): Promise<any> {
    if (this.client !== null) return this.client;
    if (this.config.provider === 'anthropic') {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.client = new Anthropic({ apiKey: this.config.apiKey });
    } else {
      const { default: OpenAI } = await import('openai');
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
      });
    }
    return this.client;
  }

  async chat(userInput: string, toolExecutor?: ToolExecutor): Promise<string> {
    this.messages.push({ role: 'user', content: userInput });
    if (this.config.provider === 'anthropic') {
      return this.chatAnthropic(toolExecutor);
    }
    return this.chatOpenAI(toolExecutor);
  }

  private async chatOpenAI(toolExecutor?: ToolExecutor): Promise<string> {
    const client = await this.getClient();
    while (true) {
      const resp = await client.chat.completions.create({
        model: this.config.defaultModel,
        messages: [{ role: 'system', content: this.systemPrompt }, ...this.messages],
        tools: this.tools,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      const msg = resp.choices[0].message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        const text = msg.content ?? '';
        this.messages.push({ role: 'assistant', content: text });
        return text;
      }

      this.messages.push({ ...msg });

      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = toolExecutor
          ? await toolExecutor(tc.function.name, args)
          : '{}';
        this.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      }
    }
  }

  private async chatAnthropic(toolExecutor?: ToolExecutor): Promise<string> {
    const client = await this.getClient();
    const tools = toAnthropicTools(this.tools);

    const apiMessages: any[] = [];
    for (const m of this.messages) {
      if (m.role === 'user' || m.role === 'assistant') {
        apiMessages.push(m);
      }
    }

    while (true) {
      const resp = await client.messages.create({
        model: this.config.defaultModel,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system: this.systemPrompt,
        messages: apiMessages,
        tools,
      });

      const hasToolUse = resp.content.some((b: any) => b.type === 'tool_use');
      if (!hasToolUse) {
        const text = resp.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('');
        this.messages.push({ role: 'assistant', content: text });
        return text;
      }

      const assistantContent: any[] = [];
      const toolResults: any[] = [];

      for (const block of resp.content) {
        if (block.type === 'text') {
          assistantContent.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use') {
          assistantContent.push({
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input,
          });
          const result = toolExecutor
            ? await toolExecutor(block.name, block.input)
            : '{}';
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        }
      }

      apiMessages.push({ role: 'assistant', content: assistantContent });
      apiMessages.push({ role: 'user', content: toolResults });
    }
  }

  reset() {
    this.messages = [];
    this.client = null;
  }
}
