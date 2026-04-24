/**
 * 测试 PM 的 ask_user 多轮交互能力
 *
 * Mock LLM 返回 5 轮 ask_user tool_calls（自由输入 + 选项选择混合），
 * 验证 agent-runner tool loop 能正确处理多轮追问。
 * 最终 LLM 返回纯文本（PRD），结束循环。
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { Bus } from '../src/bus.js';
import { IdentityEngine } from '../src/identity.js';
import { AgentRunner, ROLE_TOOLS, SYNC_TOOLS } from '../src/agent-runner.js';
import type { Config } from '../src/config.js';
import * as ui from '../src/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(PROJECT_ROOT, '.demo-pm');

// ── Setup ────────────────────────────────────────────────────
function setup() {
  fs.removeSync(DEMO_DIR);
  fs.ensureDirSync(DEMO_DIR);
  const scaffoldSrc = path.join(PROJECT_ROOT, 'scaffold');
  for (const f of getAllFiles(scaffoldSrc)) {
    const rel = path.relative(scaffoldSrc, f);
    if (path.basename(rel).startsWith('.')) continue;
    const dst = path.join(DEMO_DIR, rel);
    fs.ensureDirSync(path.dirname(dst));
    fs.copyFileSync(f, dst);
  }
  for (const role of ['pm', 'dev', 'ui', 'tester', 'admin']) {
    fs.ensureDirSync(path.join(DEMO_DIR, 'communication', 'bus', role, 'inbox'));
    fs.ensureDirSync(path.join(DEMO_DIR, 'communication', 'bus', role, 'active'));
  }
  fs.ensureDirSync(path.join(DEMO_DIR, 'workspace'));
  fs.ensureDirSync(path.join(DEMO_DIR, 'memory_center', 'archive'));
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllFiles(full));
    else results.push(full);
  }
  return results;
}

// ── Mock LLM Responses ──────────────────────────────────────
// Simulates 5 rounds of ask_user, then a final text response.
// Each round: LLM returns a tool_call, gets the user answer back, decides next step.

let callCount = 0;
let collectedAnswers: string[] = [];

function mockLlmResponse(messages: any[]): any {
  callCount++;

  // Check last tool result to track collected answers
  const lastMsg = messages[messages.length - 1];
  if (lastMsg?.role === 'tool') {
    collectedAnswers.push(lastMsg.content);
  }

  const tcId = `tc_${callCount}`;

  switch (callCount) {
    case 1:
      // Round 1: 自由文本 — 项目类型
      return toolCallResponse(tcId, 'ask_user', {
        question: '请问这个贪吃蛇游戏的目标平台是什么？（如：移动端H5、桌面网页、微信小程序）',
      });

    case 2:
      // Round 2: 选项 — 游戏风格
      return toolCallResponse(tcId, 'ask_user', {
        question: '游戏视觉风格偏好？',
        options: [
          { label: '像素复古风', value: 'pixel' },
          { label: '科技霓虹风', value: 'neon' },
          { label: '简约扁平风', value: 'flat' },
          { label: '可爱卡通风', value: 'cute' },
        ],
      });

    case 3:
      // Round 3: 选项 — 操控方式
      return toolCallResponse(tcId, 'ask_user', {
        question: '操控方式需要支持哪些？（选择主要方式）',
        options: [
          { label: '键盘方向键', value: 'keyboard' },
          { label: '触屏滑动', value: 'touch' },
          { label: '键盘 + 触屏都要', value: 'both' },
        ],
      });

    case 4:
      // Round 4: 自由文本 — 特殊需求
      return toolCallResponse(tcId, 'ask_user', {
        question: '有没有特别想要的功能？（如：排行榜、音效、多人模式、关卡系统等，没有就说"无"）',
      });

    case 5:
      // Round 5: 选项 — 确认 PRD
      return toolCallResponse(tcId, 'ask_user', {
        question: `我整理一下需求确认：\n`
          + `• 平台: ${collectedAnswers[0] || '?'}\n`
          + `• 风格: ${collectedAnswers[1] || '?'}\n`
          + `• 操控: ${collectedAnswers[2] || '?'}\n`
          + `• 额外: ${collectedAnswers[3] || '?'}\n`
          + `\n以上信息是否正确？`,
        options: [
          { label: '确认，开始写PRD', value: 'confirm' },
          { label: '需要修改', value: 'revise' },
        ],
      });

    case 6:
      // Final: 返回 PRD 文本（无 tool_calls，结束循环）
      return textResponse(
        `# PRD: 贪吃蛇H5小游戏\n\n`
        + `## 项目信息\n`
        + `- 平台: ${collectedAnswers[0] || '移动端H5'}\n`
        + `- 视觉风格: ${collectedAnswers[1] || '科技霓虹风'}\n`
        + `- 操控方式: ${collectedAnswers[2] || '键盘+触屏'}\n`
        + `- 额外需求: ${collectedAnswers[3] || '无'}\n\n`
        + `## 用户故事\n`
        + `1. 作为玩家，我可以通过${collectedAnswers[2] === 'keyboard' ? '键盘方向键' : collectedAnswers[2] === 'touch' ? '触屏滑动' : '键盘/触屏'}控制蛇的方向\n`
        + `2. 作为玩家，蛇吃到食物后变长，分数增加\n`
        + `3. 作为玩家，碰到墙壁或自身时游戏结束\n`
        + `4. 作为玩家，游戏结束后可查看得分并重新开始\n`
        + `5. 作为玩家，游戏具有${collectedAnswers[1] === 'pixel' ? '像素复古' : collectedAnswers[1] === 'neon' ? '科技霓虹' : collectedAnswers[1] === 'flat' ? '简约扁平' : '可爱卡通'}的视觉风格\n\n`
        + `## 验收标准\n`
        + `- [ ] Canvas 渲染流畅\n`
        + `- [ ] ${collectedAnswers[2] === 'both' ? '键盘+触屏双控制' : collectedAnswers[2] === 'keyboard' ? '键盘方向键控制' : '触屏滑动控制'}\n`
        + `- [ ] 食物随机生成\n`
        + `- [ ] 碰撞检测正确\n`
        + `- [ ] 分数实时显示\n`
        + `- [ ] Game Over + 重新开始\n`
        + `- [ ] 响应式布局\n`
        + (collectedAnswers[3] && collectedAnswers[3] !== '无' ? `- [ ] ${collectedAnswers[3]}\n` : '')
      );

    default:
      return textResponse('(unexpected call)');
  }
}

function toolCallResponse(id: string, fnName: string, args: any) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id,
          type: 'function',
          function: { name: fnName, arguments: JSON.stringify(args) },
        }],
      },
    }],
  };
}

function textResponse(text: string) {
  return {
    choices: [{
      message: {
        role: 'assistant',
        content: text,
        tool_calls: undefined,
      },
    }],
  };
}

// ── Mock User Answers ────────────────────────────────────────
const USER_ANSWERS = [
  '移动端H5，要能在手机浏览器直接玩',  // Round 1: 平台
  'neon',                                // Round 2: 科技霓虹风
  'both',                                // Round 3: 键盘+触屏
  '加个最高分排行榜，用localStorage存',    // Round 4: 特殊需求
  'confirm',                             // Round 5: 确认
];
let answerIndex = 0;

// ── Main ─────────────────────────────────────────────────────
async function main() {
  setup();

  const bus = new Bus(DEMO_DIR);
  const identity = new IdentityEngine(DEMO_DIR);
  const workspace = path.join(DEMO_DIR, 'workspace');

  const config: Config = {
    provider: 'openai',
    apiKey: 'mock',
    baseUrl: 'http://localhost:0',
    defaultModel: 'mock',
    teamRoot: DEMO_DIR,
    maxTokens: 8192,
    temperature: 0.7,
  };

  const runner = new AgentRunner(config, bus, identity, workspace);

  // Patch handleTool to mock user input (can't patch ESM ui exports directly)
  const origHandleTool = (runner as any).handleTool.bind(runner);
  (runner as any).handleTool = async function (name: string, args: Record<string, any>, role: string): Promise<string> {
    if (name === 'ask_user') {
      const question = args.question ?? '';
      const options = args.options;
      ui.printDeepthinkQuestion(role, question);
      if (options && Array.isArray(options)) {
        const answer = USER_ANSWERS[answerIndex++] ?? options[0]?.value ?? '';
        const selected = options.find((o: any) => o.value === answer);
        console.log(`  ${chalk.green('→')} User selected: ${chalk.white(selected?.label ?? answer)}`);
        return answer;
      }
      const answer = USER_ANSWERS[answerIndex++] ?? '(no answer)';
      console.log(`  ${chalk.green('→')} User: ${chalk.white(answer)}`);
      return answer;
    }
    return origHandleTool(name, args, role);
  };

  // Patch runWithTools to use mock LLM
  (runner as any).runWithTools = async function (
    system: string,
    userMsg: string,
    role: string,
    toolNames: string[],
  ): Promise<{ text: string; files: string[] }> {
    const messages: any[] = [
      { role: 'system', content: system },
      { role: 'user', content: userMsg },
    ];
    const writtenFiles: string[] = [];

    while (true) {
      const resp = mockLlmResponse(messages);
      const msg = resp.choices[0].message;

      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return { text: msg.content ?? '', files: writtenFiles };
      }

      messages.push({ ...msg });
      for (const tc of msg.tool_calls) {
        const args = JSON.parse(tc.function.arguments);
        const result = await (runner as any).handleTool(tc.function.name, args, role);
        if (tc.function.name === 'write_file') writtenFiles.push(args.path ?? '');
        messages.push({ role: 'tool', tool_call_id: tc.id, content: result });
      }
    }
  };

  // ── Run the test ──
  console.log(chalk.bold('\n🧪 PM ask_user 多轮交互测试\n'));
  console.log(chalk.dim('模拟 PM 对 "做一个网页贪吃蛇小游戏" 进行 5 轮需求追问\n'));
  console.log(chalk.dim('═'.repeat(60)));

  // Dispatch task
  const task = bus.dispatch('pm', '需求分析：网页贪吃蛇小游戏',
    '用户说"做一个网页贪吃蛇小游戏"，请进行需求调研，详细追问用户意图后产出PRD。',
    { msgType: 'NEW_FEATURE' });
  console.log(`\n  ${chalk.green('▶')} 📋 PM task dispatched: [${task.id}]\n`);

  // Show PM identity
  const pmIdentity = identity.loadIdentity('pm');
  console.log(chalk.dim(`  PM identity loaded (${pmIdentity.length} chars)`));
  const systemPrompt = identity.buildSystemPrompt('pm');
  console.log(chalk.dim(`  System prompt assembled (${systemPrompt.length} chars)`));
  console.log(chalk.dim('─'.repeat(60)));

  // Execute — this calls our patched runWithTools → mockLlmResponse → real handleTool → patched ui
  console.log(`\n  ${chalk.bold('PM 开始执行任务...')}\n`);
  const summary = await runner.run('pm', task.id);

  console.log(chalk.dim('\n' + '═'.repeat(60)));

  // ── Results ──
  console.log(chalk.bold('\n📊 执行结果\n'));

  // Check the tool loop ran correct number of rounds
  console.log(`  LLM 调用次数: ${chalk.cyan(String(callCount))}`);
  console.log(`  ask_user 轮数: ${chalk.cyan(String(callCount - 1))} (最后一次返回PRD文本)`);
  console.log(`  收集到的用户回答: ${chalk.cyan(String(collectedAnswers.length))}`);

  for (let i = 0; i < collectedAnswers.length; i++) {
    console.log(`    ${i + 1}. ${chalk.dim(collectedAnswers[i].slice(0, 60))}`);
  }

  // Check artifact
  const artifactDir = path.join(workspace, 'artifacts');
  const artifactFile = path.join(artifactDir, `${task.id}_pm.md`);
  const hasArtifact = fs.existsSync(artifactFile);
  console.log(`\n  产出物: ${hasArtifact ? chalk.green('✅') : chalk.red('❌')} ${hasArtifact ? artifactFile : 'not found'}`);

  if (hasArtifact) {
    const content = fs.readFileSync(artifactFile, 'utf-8');
    console.log(`  PRD 长度: ${chalk.cyan(String(content.length))} 字符`);
    console.log(`\n${chalk.bold('📋 PM 产出的 PRD:')}\n`);
    console.log(chalk.dim('┌' + '─'.repeat(58) + '┐'));
    for (const line of content.split('\n')) {
      console.log(chalk.dim('│ ') + line);
    }
    console.log(chalk.dim('└' + '─'.repeat(58) + '┘'));
  }

  // Check task completed
  const status = bus.getAllStatus();
  console.log(`\n  PM 状态: ${status.pm.state === 'idle' ? chalk.green('idle (任务已完成)') : chalk.red(status.pm.state)}`);

  // Check archive
  const today = new Date().toISOString().slice(0, 10);
  const archived = fs.existsSync(path.join(DEMO_DIR, 'memory_center', 'archive', today, `${task.id}.json`));
  console.log(`  任务归档: ${archived ? chalk.green('✅ 已归档') : chalk.red('❌ 未归档')}`);

  // Summary
  console.log(chalk.dim('\n' + '─'.repeat(60)));
  const checks = [
    { ok: callCount === 6, msg: `LLM 调用 6 次 (5轮ask + 1次PRD)` },
    { ok: collectedAnswers.length === 5, msg: `收集 5 个用户回答` },
    { ok: hasArtifact, msg: `PRD artifact 已生成` },
    { ok: status.pm.state === 'idle', msg: `PM 回到 idle 状态` },
    { ok: archived, msg: `任务已归档到 memory_center` },
    { ok: summary.includes('PRD'), msg: `返回摘要包含 PRD 内容` },
  ];

  let passed = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? chalk.green('✅') : chalk.red('❌')} ${c.msg}`);
    if (c.ok) passed++;
  }
  console.log(`\n${chalk.bold('Results:')} ${passed}/${checks.length} passed`);
  if (passed === checks.length) {
    console.log(chalk.green('🎉 PM 多轮 ask_user 全流程通过！\n'));
  }

  fs.removeSync(DEMO_DIR);
}

main().catch(console.error);
