/**
 * Mock 会话流程演示
 * 模拟: "做一个网页贪吃蛇小游戏" 的完整任务流转
 *
 * Brain → dispatch PM → PM 产出 PRD → dispatch Dev → Dev 写代码 →
 * dispatch UI → UI 出设计规范 → dispatch Tester → Tester 测试报告 →
 * dispatch Admin → Admin 项目总结
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import { fileURLToPath } from 'url';
import { Bus } from '../src/bus.js';
import { IdentityEngine } from '../src/identity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(PROJECT_ROOT, '.demo-flow');

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

// ── Pretty Print Helpers ─────────────────────────────────────
const ROLE_LABEL: Record<string, string> = {
  pm: 'PM', dev: 'Dev', ui: 'UI', tester: 'Tester', admin: 'Admin', brain: 'Brain',
};
const ROLE_ICON: Record<string, string> = {
  pm: '📋', dev: '💻', ui: '🎨', tester: '🧪', admin: '📊', brain: '🧠',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function printUserInput(text: string) {
  console.log(`\n${chalk.bold.cyan('opc >')} ${text}\n`);
}

function printBrainThinking(text: string) {
  console.log(`  ${chalk.dim('🧠 Brain thinking:')} ${chalk.dim(text)}`);
}

function printToolCall(name: string, summary: string) {
  console.log(`  ${chalk.yellow('⚡')} ${chalk.bold('tool_call')}: ${chalk.cyan(name)} → ${summary}`);
}

function printDispatch(role: string, taskId: string, title: string) {
  const icon = ROLE_ICON[role] ?? '📌';
  const label = ROLE_LABEL[role] ?? role;
  console.log(`  ${chalk.green('▶')} ${icon} Dispatched to ${chalk.bold(label)} [${chalk.dim(taskId)}]: ${title}`);
}

function printAgentStart(role: string, taskId: string) {
  const icon = ROLE_ICON[role] ?? '📌';
  const label = ROLE_LABEL[role] ?? role;
  console.log(`  ${icon} ${chalk.bold(label)} ${chalk.green('working')} on [${chalk.dim(taskId)}]...`);
}

function printAgentDone(role: string, summary: string) {
  const icon = ROLE_ICON[role] ?? '📌';
  const label = ROLE_LABEL[role] ?? role;
  console.log(`  ${icon} ${chalk.bold(label)} ${chalk.green('✓ done')}: ${summary.slice(0, 100)}`);
}

function printFileWrite(role: string, filePath: string, size: number) {
  const label = ROLE_LABEL[role] ?? role;
  console.log(`    ${chalk.cyan('📄')} ${label} wrote: ${chalk.cyan(filePath)} (${size} bytes)`);
}

function printArtifact(role: string, artifactPath: string) {
  const label = ROLE_LABEL[role] ?? role;
  console.log(`    ${chalk.dim('📎 Artifact:')} ${chalk.dim(path.basename(artifactPath))}`);
}

function printStatus(bus: Bus) {
  const status = bus.getAllStatus();
  const STATE_ICON: Record<string, string> = { working: chalk.green('●'), queued: chalk.yellow('●'), idle: chalk.dim('○') };
  const parts = Object.entries(status).map(([role, info]) => {
    const icon = STATE_ICON[info.state] ?? '○';
    const label = ROLE_LABEL[role] ?? role;
    return `${icon} ${label}`;
  });
  console.log(`\n  ${chalk.dim('Status:')} ${parts.join(' │ ')}`);
}

function printSectionHeader(text: string) {
  console.log(`\n${chalk.dim('─'.repeat(60))}`);
  console.log(`  ${chalk.bold.yellow(text)}`);
  console.log(chalk.dim('─'.repeat(60)));
}

function printBrainResponse(text: string) {
  console.log(`\n  ${chalk.white(text)}\n`);
}

// ── Mock Artifacts ───────────────────────────────────────────
const PRD_CONTENT = `# PRD: 网页贪吃蛇小游戏

## 背景
用户需要一个基于 HTML5 Canvas 的贪吃蛇网页游戏，可在桌面和移动端浏览器运行。

## 核心目标
- 流畅的游戏体验（60fps 渲染）
- 支持键盘方向键 + 触屏滑动双操控
- 完整的游戏循环（开始 → 游戏中 → 结束 → 重来）

## 用户故事
1. 作为玩家，我可以用方向键或滑动控制蛇的移动方向
2. 作为玩家，我可以看到实时分数显示
3. 作为玩家，蛇吃到食物后身体变长，分数增加
4. 作为玩家，碰到墙壁或自身时游戏结束
5. 作为玩家，游戏结束后可以查看最终得分并重新开始

## 验收标准
- [ ] Canvas 渲染，帧率稳定
- [ ] 键盘方向键控制
- [ ] 触屏滑动控制
- [ ] 食物随机生成
- [ ] 碰撞检测（墙壁 + 自身）
- [ ] 分数实时更新
- [ ] 游戏结束弹窗 + 重新开始按钮
- [ ] 响应式布局，移动端适配

## 技术建议
- 纯 HTML5 + CSS3 + Vanilla JS，无框架依赖
- Canvas API 绘图
- requestAnimationFrame 驱动游戏循环`;

const HTML_CODE = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>贪吃蛇</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <h1>🐍 贪吃蛇</h1>
    <div id="score-bar">分数: <span id="score">0</span></div>
    <canvas id="game" width="400" height="400"></canvas>
    <div id="overlay" style="display:none">
      <p>Game Over!</p>
      <p>得分: <span id="final-score">0</span></p>
      <button id="restart">再来一局</button>
    </div>
  </div>
  <script src="game.js"></script>
</body>
</html>`;

const JS_CODE = `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const GRID = 20;
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;

let snake, food, dir, score, gameOver, lastTime, speed;

function init() {
  snake = [{ x: 10, y: 10 }];
  food = spawnFood();
  dir = { x: 1, y: 0 };
  score = 0;
  gameOver = false;
  speed = 120;
  lastTime = 0;
  document.getElementById('score').textContent = '0';
  document.getElementById('overlay').style.display = 'none';
}

function spawnFood() {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

function update() {
  const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
      snake.some(s => s.x === head.x && s.y === head.y)) {
    gameOver = true;
    document.getElementById('final-score').textContent = score;
    document.getElementById('overlay').style.display = 'flex';
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    document.getElementById('score').textContent = score;
    food = spawnFood();
    if (speed > 60) speed -= 2;
  } else {
    snake.pop();
  }
}

function draw() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      ctx.strokeRect(x * GRID, y * GRID, GRID, GRID);
    }
  }

  // Food
  ctx.fillStyle = '#e94560';
  ctx.beginPath();
  ctx.arc(food.x * GRID + GRID / 2, food.y * GRID + GRID / 2, GRID / 2 - 2, 0, Math.PI * 2);
  ctx.fill();

  // Snake
  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#00d2ff' : '#0f3460';
    const r = i === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(s.x * GRID + 1, s.y * GRID + 1, GRID - 2, GRID - 2, r);
    ctx.fill();
  });
}

function loop(timestamp) {
  if (gameOver) return;
  if (timestamp - lastTime >= speed) {
    lastTime = timestamp;
    update();
  }
  draw();
  requestAnimationFrame(loop);
}

// Keyboard
document.addEventListener('keydown', e => {
  const map = {
    ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
  };
  const d = map[e.key];
  if (d && (d.x + dir.x !== 0 || d.y + dir.y !== 0)) dir = d;
});

// Touch
let touchStart = null;
canvas.addEventListener('touchstart', e => {
  touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
});
canvas.addEventListener('touchmove', e => { e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', e => {
  if (!touchStart) return;
  const dx = e.changedTouches[0].clientX - touchStart.x;
  const dy = e.changedTouches[0].clientY - touchStart.y;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
  let d;
  if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
  else d = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
  if (d.x + dir.x !== 0 || d.y + dir.y !== 0) dir = d;
  touchStart = null;
});

document.getElementById('restart').addEventListener('click', () => {
  init();
  requestAnimationFrame(loop);
});

init();
requestAnimationFrame(loop);`;

const CSS_CODE = `* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  background: #0a0a23;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  font-family: -apple-system, sans-serif;
  color: #fff;
  overflow: hidden;
}
#app { text-align: center; position: relative; }
h1 { font-size: 24px; margin-bottom: 8px; }
#score-bar { font-size: 18px; color: #e94560; margin-bottom: 12px; }
canvas {
  border: 2px solid #16213e;
  border-radius: 8px;
  display: block;
  margin: 0 auto;
  touch-action: none;
}
#overlay {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.75);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
}
#overlay p { font-size: 22px; }
button {
  padding: 10px 32px;
  font-size: 16px;
  background: #e94560;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}
button:hover { background: #c73e54; }
@media (max-width: 420px) {
  canvas { width: 100vw; height: 100vw; }
}`;

const DESIGN_SYSTEM = `# Design System: 贪吃蛇

## Color Tokens
| Token | Value | Usage |
|-------|-------|-------|
| color-bg | #0a0a23 | 全局背景 |
| color-surface | #1a1a2e | 游戏画布背景 |
| color-brand | #e94560 | 食物、按钮、强调色 |
| color-snake-head | #00d2ff | 蛇头 |
| color-snake-body | #0f3460 | 蛇身 |
| color-border | #16213e | 画布边框 |
| color-text | #ffffff | 文字 |
| color-overlay | rgba(0,0,0,0.75) | 结束遮罩 |

## Typography
- 标题: 24px, -apple-system, bold
- 分数: 18px, color-brand
- 按钮: 16px, white

## Spacing
- 画布: 400x400px (mobile: 100vw)
- 按钮: padding 10px 32px, radius 8px
- 组件间距: 8-12px

## Motion
- 按钮 hover: background 0.2s ease
- 游戏速度: 120ms → 逐步加速到 60ms`;

const TEST_REPORT = `# 测试报告: 贪吃蛇H5小游戏

## 测试概要
- 测试日期: ${new Date().toISOString().slice(0, 10)}
- 测试范围: 全部 8 项验收标准
- 测试结果: **7/8 PASS, 1 待确认**

## 测试用例

| TC | 标题 | 预期 | 结果 |
|----|------|------|------|
| TC-01 | Canvas 渲染 | 画面流畅无闪烁 | ✅ PASS |
| TC-02 | 键盘方向键 | 上下左右控制方向 | ✅ PASS |
| TC-03 | 触屏滑动 | 滑动控制方向 | ✅ PASS |
| TC-04 | 食物随机生成 | 不与蛇身重叠 | ✅ PASS |
| TC-05 | 墙壁碰撞 | 碰墙游戏结束 | ✅ PASS |
| TC-06 | 自身碰撞 | 碰自己游戏结束 | ✅ PASS |
| TC-07 | 分数更新 | 吃食物+10分 | ✅ PASS |
| TC-08 | 响应式布局 | 移动端适配 | ⚠️ 需真机验证 |

## BUG Report
无严重 BUG。

## 优化建议
- BUG-COSMETIC-01: 建议增加开始界面，当前直接进入游戏
- OPT-01: 可增加最高分本地存储 (localStorage)
- OPT-02: 可增加音效反馈

## Verdict: ✅ PASS — 可上线`;

const ADMIN_REPORT = `# 项目报告: 贪吃蛇H5小游戏

## 项目状态: ✅ 已完成

### 里程碑追踪
| 阶段 | 负责人 | 状态 | 产出 |
|------|--------|------|------|
| 需求分析 | PM | ✅ 完成 | PRD (8项验收标准) |
| 视觉设计 | UI | ✅ 完成 | Design System |
| 代码开发 | Dev | ✅ 完成 | 3个文件 (HTML+JS+CSS) |
| 功能测试 | Tester | ✅ 完成 | 7/8 PASS |

### 关键决策记录
1. 技术选型: 纯 HTML5 Canvas，无框架依赖
2. 操控方式: 键盘 + 触屏双支持
3. 游戏加速: 吃食物后速度递增 (120ms → 60ms)

### 交付物清单
- PRD 文档
- Design System
- 源代码 (index.html, game.js, style.css)
- 测试报告

### 遗留事项
- 响应式布局需真机验证
- 可选优化: 开始界面、最高分存储、音效

### 结论
项目按需求完成，核心功能全部通过测试，建议上线。`;

// ── Main Flow ────────────────────────────────────────────────
async function main() {
  setup();

  const bus = new Bus(DEMO_DIR);
  const identity = new IdentityEngine(DEMO_DIR);
  const workspace = path.join(DEMO_DIR, 'workspace');
  const codeDir = path.join(workspace, 'snake-game', 'code');
  const artifactDir = path.join(workspace, 'artifacts');
  fs.ensureDirSync(artifactDir);

  // ── Welcome ──
  const welcomeLines = [
    chalk.bold('OPC Team Agent') + ' v0.1',
    '',
    `  Provider   : ${chalk.cyan('openai')}`,
    `  Model      : ${chalk.cyan('gpt-4o')}`,
    `  Max Tokens : ${chalk.cyan('8192')}`,
    `  Temperature: ${chalk.cyan('0.7')}`,
    `  Team Root  : ${chalk.cyan(DEMO_DIR)}`,
    `  Config     : ${chalk.green('OK')}`,
    '',
    chalk.dim('  /help for commands, /exit to quit'),
  ];
  console.log(boxen(welcomeLines.join('\n'), { padding: 1, borderColor: 'blue', borderStyle: 'round' }));

  await sleep(500);

  // ── User Input ──
  printUserInput('做一个网页贪吃蛇小游戏');

  await sleep(300);
  printBrainThinking('分析意图 → 这是一个项目开发请求，需要拆解为多角色任务');
  await sleep(200);
  printBrainThinking('任务拆解: PM(需求) → Dev(实现) + UI(设计) → Tester(测试) → Admin(归档)');

  // ══════════════════════════════════════════════════════════
  // Phase 1: PM
  // ══════════════════════════════════════════════════════════
  printSectionHeader('Phase 1: PM — 需求分析');
  await sleep(200);

  printToolCall('dispatch_task', 'role=pm, msg_type=NEW_FEATURE, title="需求分析：贪吃蛇H5小游戏"');
  const pmTask = bus.dispatch('pm', '需求分析：贪吃蛇H5小游戏',
    '用户需要一个HTML5网页贪吃蛇游戏，请进行需求分析并产出PRD文档。',
    { msgType: 'NEW_FEATURE' });
  printDispatch('pm', pmTask.id, '需求分析：贪吃蛇H5小游戏');
  printStatus(bus);

  await sleep(300);
  printToolCall('execute_role_task', `role=pm, task_id=${pmTask.id}`);
  printAgentStart('pm', pmTask.id);

  await sleep(200);
  console.log(`\n    ${chalk.yellow('?')} ${chalk.bold('PM asks:')} 请确认以下需求理解是否正确？`);
  console.log(chalk.dim('    1. HTML5 Canvas 贪吃蛇'));
  console.log(chalk.dim('    2. 键盘+触屏双控制'));
  console.log(chalk.dim('    3. 计分 + 游戏结束 + 重来'));
  console.log(`    ${chalk.green('→')} User: ${chalk.white('确认，就这些需求')}`);

  await sleep(200);
  bus.claim('pm', pmTask.id);
  printStatus(bus);

  await sleep(300);
  fs.writeFileSync(path.join(artifactDir, `${pmTask.id}_pm.md`), PRD_CONTENT);
  bus.complete('pm', pmTask.id, 'PRD completed: 5 user stories, 8 acceptance criteria');
  printAgentDone('pm', 'PRD completed: 5 user stories, 8 acceptance criteria');
  printArtifact('pm', `${pmTask.id}_pm.md`);
  printStatus(bus);

  // ══════════════════════════════════════════════════════════
  // Phase 2: Dev + UI (parallel)
  // ══════════════════════════════════════════════════════════
  printSectionHeader('Phase 2: Dev + UI — 并行开发');
  await sleep(200);

  printBrainThinking('Dev 和 UI 可以并行，分别 dispatch');

  // Dispatch Dev
  printToolCall('dispatch_task', 'role=dev, msg_type=CODE_IMPL, title="实现贪吃蛇游戏代码"');
  const devTask = bus.dispatch('dev', '实现贪吃蛇游戏代码',
    `根据PRD实现HTML5贪吃蛇游戏。\n\n[PRD excerpt]\n技术建议：纯 HTML5 + CSS3 + Vanilla JS\n验收标准：Canvas渲染、键盘+触屏控制、碰撞检测、计分、重新开始`,
    { msgType: 'CODE_IMPL', context: { depends_on: pmTask.id, artifacts: [`${pmTask.id}_pm.md`] } });
  printDispatch('dev', devTask.id, '实现贪吃蛇游戏代码');

  // Dispatch UI
  printToolCall('dispatch_task', 'role=ui, msg_type=DESIGN_SPEC, title="贪吃蛇视觉设计规范"');
  const uiTask = bus.dispatch('ui', '贪吃蛇视觉设计规范',
    `根据PRD制定贪吃蛇游戏的视觉设计规范（Design System）。\n\n[PRD excerpt]\n游戏风格：深色科技感，Canvas游戏`,
    { msgType: 'DESIGN_SPEC', context: { depends_on: pmTask.id, artifacts: [`${pmTask.id}_pm.md`] } });
  printDispatch('ui', uiTask.id, '贪吃蛇视觉设计规范');
  printStatus(bus);

  await sleep(300);

  // Execute Dev
  printToolCall('execute_role_task', `role=dev, task_id=${devTask.id}`);
  printAgentStart('dev', devTask.id);
  bus.claim('dev', devTask.id);

  // Execute UI
  printToolCall('execute_role_task', `role=ui, task_id=${uiTask.id}`);
  printAgentStart('ui', uiTask.id);
  bus.claim('ui', uiTask.id);
  printStatus(bus);

  await sleep(400);

  // Dev writes files
  fs.ensureDirSync(codeDir);
  fs.writeFileSync(path.join(codeDir, 'index.html'), HTML_CODE);
  printFileWrite('dev', 'index.html', HTML_CODE.length);
  await sleep(150);

  fs.writeFileSync(path.join(codeDir, 'game.js'), JS_CODE);
  printFileWrite('dev', 'game.js', JS_CODE.length);
  await sleep(150);

  fs.writeFileSync(path.join(codeDir, 'style.css'), CSS_CODE);
  printFileWrite('dev', 'style.css', CSS_CODE.length);

  const devArtifactContent = `实现了贪吃蛇 HTML5 游戏，包含以下功能：
- Canvas 渲染 + requestAnimationFrame 驱动
- 键盘方向键 + 触屏滑动控制
- 碰撞检测（墙壁 + 自身）
- 计分系统 + 速度递增
- Game Over 弹窗 + 重新开始
- 响应式布局（移动端适配）

## Files Written
- index.html
- game.js
- style.css`;
  fs.writeFileSync(path.join(artifactDir, `${devTask.id}_dev.md`), devArtifactContent);
  bus.complete('dev', devTask.id, 'Implemented snake game: 3 files, canvas + touch + keyboard');
  printAgentDone('dev', '3 files written: index.html, game.js, style.css');
  printArtifact('dev', `${devTask.id}_dev.md`);

  await sleep(200);

  // UI completes
  fs.writeFileSync(path.join(artifactDir, `${uiTask.id}_ui.md`), DESIGN_SYSTEM);
  bus.complete('ui', uiTask.id, 'Design System: 8 color tokens, typography, spacing, motion');
  printAgentDone('ui', 'Design System: 8 color tokens, typography, spacing, motion');
  printArtifact('ui', `${uiTask.id}_ui.md`);
  printStatus(bus);

  // ══════════════════════════════════════════════════════════
  // Phase 3: Tester
  // ══════════════════════════════════════════════════════════
  printSectionHeader('Phase 3: Tester — 功能测试');
  await sleep(200);

  printToolCall('dispatch_task', 'role=tester, msg_type=TEST_REQUEST, title="测试贪吃蛇游戏"');
  const testTask = bus.dispatch('tester', '测试贪吃蛇游戏',
    `测试贪吃蛇H5游戏的全部验收标准。\n代码路径: ${codeDir}\n\n[PRD excerpt]\n验收标准: Canvas渲染、键盘控制、触屏控制、食物生成、碰撞检测、分数更新、Game Over、响应式`,
    { msgType: 'TEST_REQUEST', context: { depends_on: devTask.id, artifacts: [`${devTask.id}_dev.md`] } });
  printDispatch('tester', testTask.id, '测试贪吃蛇游戏');

  await sleep(200);
  printToolCall('execute_role_task', `role=tester, task_id=${testTask.id}`);
  printAgentStart('tester', testTask.id);
  bus.claim('tester', testTask.id);
  printStatus(bus);

  await sleep(400);
  fs.writeFileSync(path.join(artifactDir, `${testTask.id}_tester.md`), TEST_REPORT);
  bus.complete('tester', testTask.id, '7/8 PASS — 可上线');
  printAgentDone('tester', '7/8 PASS, 0 BUG, verdict: PASS — 可上线');
  printArtifact('tester', `${testTask.id}_tester.md`);
  printStatus(bus);

  // ══════════════════════════════════════════════════════════
  // Phase 4: Admin
  // ══════════════════════════════════════════════════════════
  printSectionHeader('Phase 4: Admin — 项目归档');
  await sleep(200);

  printToolCall('dispatch_task', 'role=admin, msg_type=ADMIN_SUMMARY, title="贪吃蛇项目总结"');
  const adminTask = bus.dispatch('admin', '贪吃蛇项目总结', '汇总项目全部产出，输出项目报告。', {
    msgType: 'ADMIN_SUMMARY',
    context: { depends_on: testTask.id, artifacts: [`${pmTask.id}_pm.md`, `${devTask.id}_dev.md`, `${uiTask.id}_ui.md`, `${testTask.id}_tester.md`] },
  });
  printDispatch('admin', adminTask.id, '贪吃蛇项目总结');

  await sleep(200);
  printToolCall('execute_role_task', `role=admin, task_id=${adminTask.id}`);
  printAgentStart('admin', adminTask.id);
  bus.claim('admin', adminTask.id);

  await sleep(300);
  fs.writeFileSync(path.join(artifactDir, `${adminTask.id}_admin.md`), ADMIN_REPORT);
  bus.complete('admin', adminTask.id, '项目报告: 已完成, 7/8 PASS');
  printAgentDone('admin', '项目报告: 已完成, 7/8 PASS, 建议上线');
  printArtifact('admin', `${adminTask.id}_admin.md`);
  printStatus(bus);

  // ══════════════════════════════════════════════════════════
  // Brain final response
  // ══════════════════════════════════════════════════════════
  printSectionHeader('Brain 汇总回复');

  printBrainResponse(`贪吃蛇H5小游戏已完成！以下是交付情况：

  📋 PRD: 5个用户故事，8项验收标准
  🎨 Design System: 深色科技风，8个色彩 token
  💻 代码: 3个文件 (index.html + game.js + style.css)
     - Canvas 渲染 + requestAnimationFrame
     - 键盘方向键 + 触屏滑动双控制
     - 碰撞检测 + 计分 + 速度递增 + 重新开始
  🧪 测试: 7/8 PASS，无严重 BUG
  📊 项目状态: ✅ 可上线

  代码路径: ${chalk.cyan(codeDir)}`);

  // ══════════════════════════════════════════════════════════
  // Summary
  // ══════════════════════════════════════════════════════════
  console.log(chalk.dim('═'.repeat(60)));
  console.log(chalk.bold('\n📁 产出物一览:'));

  const artifacts = fs.readdirSync(artifactDir).sort();
  for (const f of artifacts) {
    const size = fs.statSync(path.join(artifactDir, f)).size;
    const role = f.split('_').pop()?.replace('.md', '') ?? '';
    const icon = ROLE_ICON[role] ?? '📎';
    console.log(`  ${icon} ${chalk.cyan(f)} ${chalk.dim(`(${size} bytes)`)}`);
  }

  console.log(chalk.bold('\n📁 代码文件:'));
  for (const f of fs.readdirSync(codeDir).sort()) {
    const size = fs.statSync(path.join(codeDir, f)).size;
    console.log(`  💻 ${chalk.cyan(f)} ${chalk.dim(`(${size} bytes)`)}`);
  }

  console.log(chalk.bold('\n📁 任务归档:'));
  const today = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(DEMO_DIR, 'memory_center', 'archive', today);
  if (fs.existsSync(archiveDir)) {
    for (const f of fs.readdirSync(archiveDir).sort()) {
      const task = fs.readJsonSync(path.join(archiveDir, f));
      const icon = ROLE_ICON[task.to] ?? '📌';
      console.log(`  ${icon} ${chalk.dim(f)} → ${task.to}: ${task.title?.slice(0, 40)}`);
    }
  }

  console.log(chalk.bold('\n📊 任务依赖链:'));
  console.log(`  PM [${pmTask.id}]`);
  console.log(`  ├── Dev [${devTask.id}] ${chalk.dim(`depends_on: ${pmTask.id}`)}`);
  console.log(`  ├── UI  [${uiTask.id}] ${chalk.dim(`depends_on: ${pmTask.id}`)}`);
  console.log(`  ├── Tester [${testTask.id}] ${chalk.dim(`depends_on: ${devTask.id}`)}`);
  console.log(`  └── Admin [${adminTask.id}] ${chalk.dim(`depends_on: ${testTask.id}`)}`);

  console.log(`\n${chalk.green('✅ Demo 完成。')} 清理测试目录...\n`);
  fs.removeSync(DEMO_DIR);
}

main().catch(console.error);
