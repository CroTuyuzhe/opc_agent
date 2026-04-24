import fs from 'fs-extra';
import path from 'path';
import type { Config } from './config.js';
import type { IdentityEngine } from './identity.js';
import type { Bus } from './bus.js';
import * as ui from './ui.js';

interface AgentToolDef {
  name: string;
  description: string;
  properties: Record<string, any>;
  required: string[];
}

const AGENT_TOOL_DEFS: Record<string, AgentToolDef> = {
  ask_user: {
    name: 'ask_user',
    description: 'Ask the user a question. Provide options for common choices.',
    properties: {
      question: { type: 'string', description: 'Your question' },
      options: {
        type: 'array',
        description: 'Selectable choices. Each: {label, value}. Omit for free-text.',
        items: {
          type: 'object',
          properties: { label: { type: 'string' }, value: { type: 'string' } },
        },
      },
    },
    required: ['question'],
  },
  write_file: {
    name: 'write_file',
    description: 'Write a file to the project workspace (code, config, assets).',
    properties: {
      path: { type: 'string', description: 'Relative path' },
      content: { type: 'string', description: 'Full file content' },
    },
    required: ['path', 'content'],
  },
};

export const ROLE_TOOLS: Record<string, string[]> = {
  pm: ['ask_user'],
  dev: ['write_file'],
  ui: ['write_file'],
  tester: [],
  admin: [],
};

export const SYNC_TOOLS = new Set(['ask_user']);

function toOpenAITools(toolNames: string[]) {
  return toolNames.map(name => {
    const defn = AGENT_TOOL_DEFS[name];
    return {
      type: 'function' as const,
      function: {
        name: defn.name,
        description: defn.description,
        parameters: {
          type: 'object',
          properties: defn.properties,
          required: defn.required,
        },
      },
    };
  });
}

function toAnthropicAgentTools(toolNames: string[]) {
  return toolNames.map(name => {
    const defn = AGENT_TOOL_DEFS[name];
    return {
      name: defn.name,
      description: defn.description,
      input_schema: {
        type: 'object' as const,
        properties: defn.properties,
        required: defn.required,
      },
    };
  });
}

export class AgentRunner {
  private config: Config;
  private bus: Bus;
  private identity: IdentityEngine;
  private workspace: string;
  projectId: string | null = null;
  codeRoot: string | null = null;

  constructor(config: Config, bus: Bus, identity: IdentityEngine, workspace: string) {
    this.config = config;
    this.bus = bus;
    this.identity = identity;
    this.workspace = workspace;
  }

  async run(role: string, taskId: string): Promise<string> {
    const task = this.bus.claim(role, taskId);
    if (!task) return `No task ${taskId} in ${role} inbox`;

    const system = this.identity.buildSystemPrompt(role);
    const userMsg = `Task: ${task.title}\n\n${task.content}`;

    let resultText: string;
    let writtenFiles: string[] = [];

    try {
      const toolNames = ROLE_TOOLS[role] ?? [];
      if (toolNames.length > 0) {
        const result = await this.runWithTools(system, userMsg, role, toolNames);
        resultText = result.text;
        writtenFiles = result.files;
      } else {
        resultText = await this.callLlm(system, userMsg);
      }
    } catch (e: any) {
      const errorText = `ERROR: ${e.message}`;
      this.bus.complete(role, taskId, errorText);
      this.writeReflection(role, taskId, task, errorText);
      return `Agent ${role} failed: ${e.message}`;
    }

    const projectDir = this.projectId
      ? path.join(this.workspace, this.projectId)
      : this.workspace;
    const artifactDir = path.join(projectDir, 'artifacts');
    fs.ensureDirSync(artifactDir);
    const artifactPath = path.join(artifactDir, `${taskId}_${role}.md`);

    let artifactContent = resultText;
    if (writtenFiles.length > 0) {
      const fileList = writtenFiles.map(f => `- ${f}`).join('\n');
      artifactContent += `\n\n## Files Written\n${fileList}`;
    }
    fs.writeFileSync(artifactPath, artifactContent);

    const summary = resultText.length > 200
      ? resultText.slice(0, 200) + '...'
      : resultText;
    this.bus.complete(role, taskId, summary);
    if (resultText.slice(0, 50).startsWith('ERROR')) {
      this.writeReflection(role, taskId, task, resultText);
    }
    return summary;
  }

  private async handleTool(name: string, args: Record<string, any>, role: string): Promise<string> {
    if (name === 'write_file') {
      const relPath = args.path ?? '';
      const content = args.content ?? '';
      let fullPath: string;
      if (this.codeRoot) {
        fullPath = path.join(this.codeRoot, relPath);
      } else {
        const projectDir = this.projectId
          ? path.join(this.workspace, this.projectId)
          : this.workspace;
        fullPath = path.join(projectDir, 'code', relPath);
      }
      fs.ensureDirSync(path.dirname(fullPath));
      fs.writeFileSync(fullPath, content);
      ui.printFileWritten(role, relPath);
      return `Written: ${relPath} (${content.length} bytes)`;
    }

    if (name === 'ask_user') {
      const question = args.question ?? '';
      const options = args.options;
      ui.printDeepthinkQuestion(role, question);
      if (options && Array.isArray(options)) {
        return ui.promptUserSelect(options);
      }
      return ui.promptUserAnswer();
    }

    return `Unknown tool: ${name}`;
  }

  private async runWithTools(
    system: string,
    userMsg: string,
    role: string,
    toolNames: string[]
  ): Promise<{ text: string; files: string[] }> {
    if (this.config.provider === 'anthropic') {
      return this.toolsAnthropic(system, userMsg, role, toolNames);
    }
    return this.toolsOpenAI(system, userMsg, role, toolNames);
  }

  private async toolsOpenAI(
    system: string,
    userMsg: string,
    role: string,
    toolNames: string[]
  ): Promise<{ text: string; files: string[] }> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
    const tools = toOpenAITools(toolNames);
    const messages: any[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ];
    const writtenFiles: string[] = [];

    while (true) {
      const resp = await client.chat.completions.create({
        model: this.config.defaultModel,
        messages,
        tools,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      });
      const msg = resp.choices[0].message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { text: msg.content ?? '', files: writtenFiles };
      }

      messages.push({ ...msg });
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await this.handleTool(tc.function.name, args, role);
        if (tc.function.name === 'write_file') {
          writtenFiles.push(args.path ?? '');
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }
  }

  private async toolsAnthropic(
    system: string,
    userMsg: string,
    role: string,
    toolNames: string[]
  ): Promise<{ text: string; files: string[] }> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.config.apiKey });
    const tools = toAnthropicAgentTools(toolNames);
    const messages: any[] = [{ role: 'user', content: userMsg }];
    const writtenFiles: string[] = [];

    while (true) {
      const resp = await client.messages.create({
        model: this.config.defaultModel,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        system,
        messages,
        tools,
      });

      const hasToolUse = resp.content.some((b: any) => b.type === 'tool_use');
      if (!hasToolUse) {
        const text = resp.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('');
        return { text, files: writtenFiles };
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
          const result = await this.handleTool(block.name, block.input as Record<string, any>, role);
          if (block.name === 'write_file') {
            writtenFiles.push((block.input as any).path ?? '');
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      messages.push({ role: 'assistant', content: assistantContent });
      messages.push({ role: 'user', content: toolResults });
    }
  }

  private async callLlm(system: string, userMsg: string): Promise<string> {
    if (this.config.provider === 'anthropic') {
      return this.callAnthropic(system, userMsg);
    }
    return this.callOpenAI(system, userMsg);
  }

  private async callOpenAI(system: string, userMsg: string): Promise<string> {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: this.config.apiKey, baseURL: this.config.baseUrl });
    const resp = await client.chat.completions.create({
      model: this.config.defaultModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
    });
    return resp.choices[0].message.content ?? '';
  }

  private async callAnthropic(system: string, userMsg: string): Promise<string> {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: this.config.apiKey });
    const resp = await client.messages.create({
      model: this.config.defaultModel,
      max_tokens: this.config.maxTokens,
      temperature: this.config.temperature,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
    return resp.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');
  }

  private writeReflection(role: string, taskId: string, task: any, resultText: string) {
    const reflection = {
      task_id: taskId,
      role,
      title: task.title ?? '',
      type: task.type ?? '',
      success: false,
      summary: resultText.slice(0, 150),
      ts: new Date().toISOString(),
    };
    const dateStr = new Date().toISOString().slice(0, 10);
    const archiveDir = path.join(
      path.dirname(this.workspace),
      'memory_center',
      'archive',
      dateStr
    );
    fs.ensureDirSync(archiveDir);
    const filePath = path.join(archiveDir, `${taskId}_${role}_reflection.json`);
    fs.writeJsonSync(filePath, reflection, { spaces: 2 });
  }
}
