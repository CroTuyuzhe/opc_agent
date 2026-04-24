export interface ToolDef {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export const TOOL_DEFS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'dispatch_task',
      description: 'Send a task to a role\'s inbox per handoff protocol',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['pm', 'dev', 'ui', 'tester', 'admin'] },
          msg_type: { type: 'string', description: 'Message type from Decision Rules' },
          title: { type: 'string' },
          content: { type: 'string', description: 'Task description. Include [PRD excerpt] and/or [Design System excerpt] with relevant contract sections.' },
          depends_on: { type: 'array', items: { type: 'string' }, description: 'Upstream task IDs' },
          artifacts: { type: 'array', items: { type: 'string' }, description: 'Referenced artifact file paths' },
        },
        required: ['role', 'msg_type', 'title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_workspace_file',
      description: 'Read a file from the workspace directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_workspace_file',
      description: 'Write content to a file in the workspace directory',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_status',
      description: 'Get current status of all agents and tasks',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_role_task',
      description: 'Have a role agent pick up and execute its next inbox task',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['pm', 'dev', 'ui', 'tester', 'admin'] },
          task_id: { type: 'string' },
        },
        required: ['role', 'task_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_bash',
      description: 'Run a shell command. User will be asked to approve before execution.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to run' },
          description: { type: 'string', description: 'Brief explanation of what this command does' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'List all existing projects in workspace. Call before create_project to check for related/duplicate projects.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Create a new project. Call list_projects first to check for related projects.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Project name (directory name, lowercase, no spaces)' },
          location: { type: 'string', enum: ['workspace', 'desktop'], description: 'Where to create code directory' },
          parent: { type: 'string', description: 'Name of existing parent project for sibling placement' },
          title: { type: 'string', description: 'Human-readable project title' },
          keywords: { type: 'array', items: { type: 'string' }, description: 'Keywords for future project matching' },
        },
        required: ['name', 'location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ask_user',
      description: 'Ask the user a question or request approval. Provide options for common choices.',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'Question or approval request' },
          options: {
            type: 'array',
            description: 'Selectable choices. Each: {label, value}. Omit for free-text.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string' },
              },
            },
          },
        },
        required: ['question'],
      },
    },
  },
];

export function toAnthropicTools(openaiTools: ToolDef[]): AnthropicTool[] {
  return openaiTools.map(t => ({
    name: t.function.name,
    description: t.function.description ?? '',
    input_schema: {
      type: 'object' as const,
      ...(t.function.parameters ?? { properties: {} }),
    },
  }));
}

export function mergeSkillTools(base: ToolDef[], skillTools: ToolDef[]): ToolDef[] {
  return [...base, ...skillTools];
}
