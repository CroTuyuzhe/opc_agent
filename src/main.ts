import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import readline from 'readline';
import chalk from 'chalk';

import { loadConfig, teamRootPath, validateConfig, type Config } from './config.js';
import { Bus, ROLES } from './bus.js';
import { IdentityEngine } from './identity.js';
import { Brain } from './brain.js';
import { AgentRunner, ROLE_TOOLS, SYNC_TOOLS } from './agent-runner.js';
import { SkillLoader } from './skill-loader.js';
import { TOOL_DEFS, mergeSkillTools } from './tools.js';
import { initProject } from './init.js';
import * as ui from './ui.js';

interface DoneTask {
  role: string;
  taskId: string;
  title: string;
  summary: string;
  artifact: string;
}

let _mainRl: readline.Interface | null = null;
let _replIdle = false;

class OPCApp {
  config!: Config;
  bus!: Bus;
  identity!: IdentityEngine;
  brain!: Brain;
  runner!: AgentRunner;
  skills!: SkillLoader;
  compact = false;
  private bgPromises: Map<string, Promise<DoneTask>> = new Map();
  private doneQueue: DoneTask[] = [];

  init() {
    this.config = loadConfig();
    const root = teamRootPath(this.config);

    this.bus = new Bus(root);
    this.identity = new IdentityEngine(root);

    const workspace = path.join(root, 'workspace');
    fs.ensureDirSync(workspace);

    this.skills = new SkillLoader(path.join(root, 'skills'));
    const skillTools = this.skills.scan();
    const allTools = mergeSkillTools(TOOL_DEFS, skillTools);

    this.brain = new Brain(this.config, this.bus, workspace, this.identity, allTools);
    this.runner = new AgentRunner(this.config, this.bus, this.identity, workspace);

    const errors = validateConfig(this.config);
    const configOk = errors.length === 0;
    ui.printWelcome(configOk, this.config.provider, this.config.defaultModel, root, this.config.maxTokens, this.config.temperature);
    for (const e of errors) {
      ui.printError(`  ⚠ ${e}`);
    }

    if (!fs.existsSync(path.join(root, 'AGENTS.md'))) {
      ui.printError("  ⚠ Team directory not initialized. Run 'opc init' first.");
    }
  }

  private checkIntervention(): string {
    return this.identity.readIntervention();
  }

  async executeTool(name: string, args: Record<string, any>): Promise<string> {
    const root = teamRootPath(this.config);

    if (name === 'dispatch_task') {
      const state = this.checkIntervention();
      if (state === 'STOP') {
        ui.printInterventionBlock('STOP');
        return 'BLOCKED: Intervention state is STOP. All dispatches halted.';
      }
      if (state === 'PAUSE') {
        ui.printInterventionBlock('PAUSE');
        ui.printDeepthinkQuestion('brain', `Dispatch to ${args.role}: ${args.title} — approve? (y/n)`);
        const answer = await ui.promptUserAnswer();
        if (!['y', 'yes', 'ok', 'approve'].includes(answer.toLowerCase())) {
          return `BLOCKED: User did not approve dispatch. Response: ${answer}`;
        }
      }

      const ctx: Record<string, any> = {};
      if (args.depends_on) ctx.depends_on = args.depends_on;
      if (args.artifacts) ctx.artifacts = args.artifacts;

      const task = this.bus.dispatch(args.role, args.title, args.content, {
        msgType: args.msg_type ?? '',
        context: Object.keys(ctx).length > 0 ? ctx : undefined,
      });
      ui.printAgentWorking(args.role, args.title);
      return JSON.stringify(task);
    }

    if (name === 'read_workspace_file') {
      const ws = path.join(root, 'workspace');
      const fp = path.join(ws, args.path);
      if (fs.existsSync(fp)) return fs.readFileSync(fp, 'utf-8');
      return `File not found: ${args.path}`;
    }

    if (name === 'write_workspace_file') {
      const ws = path.join(root, 'workspace');
      const fp = path.join(ws, args.path);
      fs.ensureDirSync(path.dirname(fp));
      fs.writeFileSync(fp, args.content);
      return `Written to ${args.path}`;
    }

    if (name === 'get_project_status') {
      const status = this.bus.getAllStatus();
      ui.printStatus(status);
      return JSON.stringify(status);
    }

    if (name === 'execute_role_task') {
      const { role, task_id } = args;
      const toolNames = ROLE_TOOLS[role] ?? [];
      const hasSync = toolNames.some(t => SYNC_TOOLS.has(t));
      if (hasSync) {
        const summary = await this.runner.run(role, task_id);
        ui.printAgentDone(role, summary);
        return summary;
      } else {
        this.runInBackground(role, task_id);
        return `Task ${task_id} started in background for ${role}. You'll be notified when done.`;
      }
    }

    if (name === 'list_projects') {
      const registry = this.loadRegistry();
      if (registry.length === 0) return 'No existing projects.';
      return JSON.stringify(registry);
    }

    if (name === 'create_project') {
      const projName = args.name ?? 'project';
      const location = args.location ?? 'workspace';
      const parent = args.parent;
      const title = args.title ?? projName;
      const keywords = args.keywords ?? [];
      const ws = path.join(root, 'workspace');

      let codeRoot: string;
      if (parent) {
        const registry = this.loadRegistry();
        const parentEntry = registry.find(p => p.name === parent);
        if (parentEntry) {
          codeRoot = path.join(path.dirname(parentEntry.code_path), projName);
        } else {
          codeRoot = location === 'desktop'
            ? path.join(process.env.HOME ?? '~', 'Desktop', projName)
            : path.join(ws, projName, 'code');
        }
      } else {
        codeRoot = location === 'desktop'
          ? path.join(process.env.HOME ?? '~', 'Desktop', projName)
          : path.join(ws, projName, 'code');
      }

      const projectDir = path.join(ws, projName);
      fs.ensureDirSync(projectDir);
      fs.ensureDirSync(path.join(projectDir, 'artifacts'));
      fs.ensureDirSync(codeRoot);

      this.runner.projectId = projName;
      this.runner.codeRoot = codeRoot;

      this.saveToRegistry({
        name: projName,
        title,
        code_path: codeRoot,
        artifacts_path: path.join(projectDir, 'artifacts'),
        created_at: new Date().toISOString(),
        keywords,
      });

      console.log(`  ${chalk.green('📁')} Project ${chalk.bold(projName)} created`);
      console.log(`      Artifacts: ${path.join(projectDir, 'artifacts')}`);
      console.log(`      Code:      ${codeRoot}`);
      if (parent) console.log(`      Sibling of: ${parent}`);

      return JSON.stringify({
        project: projName,
        artifacts_path: path.join(projectDir, 'artifacts'),
        code_path: codeRoot,
      });
    }

    if (name === 'ask_user') {
      const question = args.question ?? '';
      const options = args.options;
      ui.printDeepthinkQuestion('brain', question);
      if (options && Array.isArray(options)) {
        return ui.promptUserSelect(options);
      }
      return ui.promptUserAnswer();
    }

    if (name === 'run_bash') {
      return this.executeBash(args.command ?? '', args.description ?? '');
    }

    if (name.startsWith('skill_')) {
      const skillName = name.slice('skill_'.length);
      const result = this.skills.execute(skillName, args);
      console.log(`  ${chalk.cyan('⚡')} Skill ${skillName}: ${String(result).slice(0, 120)}`);
      return String(result);
    }

    return `Unknown tool: ${name}`;
  }

  private runInBackground(role: string, taskId: string) {
    const promise = (async (): Promise<DoneTask> => {
      try {
        const summary = await this.runner.run(role, taskId);
        const root = teamRootPath(this.config);
        const artifactPath = path.join(root, 'workspace', 'artifacts', `${taskId}_${role}.md`);
        const taskInfo = this.bus.listActive(role);
        const title = taskInfo.find(t => t.id === taskId)?.title ?? taskId;
        return { role, taskId, title, summary, artifact: artifactPath };
      } catch (e: any) {
        return { role, taskId, title: taskId, summary: `ERROR: ${e.message}`, artifact: '' };
      }
    })();

    promise.then(done => {
      this.doneQueue.push(done);
      this.bgPromises.delete(taskId);
      if (_replIdle && _mainRl) {
        this.drainNotifications();
        _mainRl.prompt();
      }
    });

    this.bgPromises.set(taskId, promise);
    ui.printAgentWorking(role, `${taskId} (background)`);
  }

  drainNotifications() {
    while (this.doneQueue.length > 0) {
      const done = this.doneQueue.shift()!;
      ui.printTaskNotification(done.role, done.title, done.summary, done.artifact);
    }
  }

  private loadRegistry(): any[] {
    const root = teamRootPath(this.config);
    const regPath = path.join(root, 'workspace', 'project_registry.json');
    if (fs.existsSync(regPath)) {
      return fs.readJsonSync(regPath);
    }
    return [];
  }

  private saveToRegistry(entry: Record<string, any>) {
    const root = teamRootPath(this.config);
    let registry = this.loadRegistry();
    registry = registry.filter(p => p.name !== entry.name);
    registry.push(entry);
    const regPath = path.join(root, 'workspace', 'project_registry.json');
    fs.writeJsonSync(regPath, registry, { spaces: 2 });
  }

  private async executeBash(command: string, description: string): Promise<string> {
    const approved = await ui.promptBashApproval(command, description);
    if (!approved) return 'User denied execution.';

    try {
      const result = execSync(command, {
        encoding: 'utf-8',
        timeout: 120_000,
        cwd: teamRootPath(this.config),
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      ui.printBashOutput(result, '', 0);
      return result.trim() || '(no output)';
    } catch (e: any) {
      if (e.killed) {
        ui.printError('Command timed out (120s)');
        return 'Command timed out (120s)';
      }
      const stdout = e.stdout ?? '';
      const stderr = e.stderr ?? '';
      const code = e.status ?? 1;
      ui.printBashOutput(stdout, stderr, code);
      let output = stdout;
      if (stderr) output += `\nSTDERR:\n${stderr}`;
      output += `\nExit code: ${code}`;
      return output.trim() || '(no output)';
    }
  }

  handleSlash(cmd: string): boolean {
    const parts = cmd.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    if (command === '/exit') return true;

    if (command === '/status') {
      const status = this.bus.getAllStatus();
      ui.printStatus(status);
    } else if (command === '/tasks') {
      const allTasks: any[] = [];
      for (const role of ROLES) {
        allTasks.push(...this.bus.listInbox(role));
        allTasks.push(...this.bus.listActive(role));
      }
      ui.printTasks(allTasks);
    } else if (command === '/inbox') {
      if (!arg) {
        ui.printError('Usage: /inbox <role>');
      } else {
        const tasks = this.bus.listInbox(arg);
        ui.printInbox(arg, tasks);
      }
    } else if (command === '/skills') {
      ui.printSkills(this.skills.listSkills());
    } else if (command === '/help') {
      ui.printHelp();
    } else if (command === '/compact') {
      this.compact = !this.compact;
      console.log(`Compact mode: ${this.compact ? 'on' : 'off'}`);
    } else if (command === '/dispatch') {
      if (!arg) {
        ui.printError('Usage: /dispatch <role> <task description>');
      } else {
        const dp = arg.split(/\s+/);
        if (dp.length < 2) {
          ui.printError('Usage: /dispatch <role> <task description>');
        } else {
          const role = dp[0];
          const desc = dp.slice(1).join(' ');
          const task = this.bus.dispatch(role, desc, desc);
          console.log(`Dispatched [${task.id}] to ${role}`);
        }
      }
    } else if (command === '/skill') {
      this.handleSkillCmd(arg);
    } else if (command === '/uninstall') {
      this.uninstall();
      return true;
    } else {
      ui.printError(`Unknown command: ${command}`);
    }

    return false;
  }

  private handleSkillCmd(arg: string) {
    const parts = arg.split(/\s+/);
    const sub = parts[0] || 'list';
    const subArg = parts.slice(1).join(' ').trim();

    if (sub === 'list') {
      const skills = this.skills.listSkills();
      if (skills.length === 0) {
        console.log(chalk.dim('No skills installed'));
      } else {
        for (const s of skills) {
          console.log(`  ${chalk.cyan(s.name)} v${s.version} — ${s.description}`);
        }
      }
    } else if (sub === 'install') {
      if (!subArg) {
        ui.printError('Usage: /skill install <github_url>');
      } else {
        console.log(`Installing from ${subArg}...`);
        const result = this.skills.install(subArg);
        console.log(result);
        this.reloadSkills();
      }
    } else if (sub === 'remove') {
      if (!subArg) {
        ui.printError('Usage: /skill remove <name>');
      } else {
        const result = this.skills.remove(subArg);
        console.log(result);
        this.reloadSkills();
      }
    } else {
      ui.printError('Usage: /skill [list|install|remove]');
    }
  }

  private reloadSkills() {
    const skillTools = this.skills.scan();
    this.brain.tools = mergeSkillTools(TOOL_DEFS, skillTools);
  }

  private async uninstall() {
    console.log(chalk.bold.red('⚠ Uninstall OPC'));
    console.log('This will:');
    console.log('  1. npm uninstall -g opc-agent');
    console.log('  2. Remove ~/.opc/ config directory');

    const answer = await ui.promptUserAnswer();
    if (answer.trim().toLowerCase() !== 'y') {
      console.log('Cancelled.');
      return;
    }
    try {
      execSync('npm uninstall -g opc-agent', { stdio: 'inherit' });
    } catch {}
    const opcHome = path.join(process.env.HOME ?? '~', '.opc');
    if (fs.existsSync(opcHome)) {
      fs.removeSync(opcHome);
      console.log(`Removed ${opcHome}`);
    }
    console.log(chalk.green('OPC uninstalled.'));
  }

  async chat(userInput: string) {
    if (!this.config.apiKey) {
      ui.printError('No api_key configured. Edit opc.json or set OPC_API_KEY.');
      return;
    }
    try {
      const response = await this.brain.chat(
        userInput,
        (name, args) => this.executeTool(name, args)
      );
      console.log(response);
    } catch (e: any) {
      ui.printError(`Error: ${e.message}`);
    }
  }
}

async function main() {
  if (process.argv[2] === 'init') {
    initProject(process.cwd());
    return;
  }

  const app = new OPCApp();
  app.init();

  const historyDir = path.join(process.env.HOME ?? '~', '.opc');
  fs.ensureDirSync(historyDir);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'opc > ',
  });

  _mainRl = rl;
  ui.setReadline(rl);

  const askQuestion = (): void => {
    app.drainNotifications();
    _replIdle = true;
    rl.question('opc > ', async (input) => {
      _replIdle = false;
      const trimmed = input.trim();
      if (!trimmed) {
        askQuestion();
        return;
      }

      if (trimmed.startsWith('/')) {
        const shouldExit = app.handleSlash(trimmed);
        if (shouldExit) {
          rl.close();
          return;
        }
      } else {
        await app.chat(trimmed);
      }

      askQuestion();
    });
  };

  rl.on('close', () => {
    console.log('\nBye.');
    process.exit(0);
  });

  askQuestion();
}

main().catch(console.error);
