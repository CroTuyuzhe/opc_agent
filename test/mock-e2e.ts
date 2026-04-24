/**
 * Mock E2E test — verifies the full task flow without real LLM calls.
 *
 * Simulates: user request → Brain dispatches PM/Dev/Tester →
 *   PM produces PRD → Dev writes code → Tester produces report →
 *   artifacts written → tasks archived
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_DIR = path.join(PROJECT_ROOT, '.test-e2e');

// ── helpers ──────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

function assertFileExists(fp: string, label?: string) {
  assert(fs.existsSync(fp), label ?? `file exists: ${path.relative(TEST_DIR, fp)}`);
}

function assertFileContains(fp: string, needle: string, label?: string) {
  const content = fs.existsSync(fp) ? fs.readFileSync(fp, 'utf-8') : '';
  assert(content.includes(needle), label ?? `"${path.relative(TEST_DIR, fp)}" contains "${needle.slice(0, 40)}"`);
}

// ── setup ────────────────────────────────────────────────────────
async function setup() {
  fs.removeSync(TEST_DIR);
  fs.ensureDirSync(TEST_DIR);

  // Run opc init to scaffold the test directory
  const { initProject } = await import('../src/init.js');
  // Temporarily redirect scaffold root — init reads from dist/../scaffold
  // So we run it via the compiled init or just copy scaffold manually
  const scaffoldSrc = path.join(PROJECT_ROOT, 'scaffold');
  const allFiles = getAllFiles(scaffoldSrc);
  for (const srcFile of allFiles) {
    const rel = path.relative(scaffoldSrc, srcFile);
    if (path.basename(rel).startsWith('.')) continue;
    const dst = path.join(TEST_DIR, rel);
    fs.ensureDirSync(path.dirname(dst));
    fs.copyFileSync(srcFile, dst);
  }

  // Create runtime dirs
  const roles = ['pm', 'dev', 'ui', 'tester', 'admin'];
  for (const role of roles) {
    fs.ensureDirSync(path.join(TEST_DIR, 'communication', 'bus', role, 'inbox'));
    fs.ensureDirSync(path.join(TEST_DIR, 'communication', 'bus', role, 'active'));
  }
  fs.ensureDirSync(path.join(TEST_DIR, 'workspace'));
  fs.ensureDirSync(path.join(TEST_DIR, 'memory_center', 'archive'));
  fs.ensureDirSync(path.join(TEST_DIR, 'memory_center', 'project_history'));

  // Write a minimal opc.json
  fs.writeJsonSync(path.join(TEST_DIR, 'opc.json'), {
    provider: 'openai',
    api_key: 'mock-key',
    base_url: 'http://localhost:0',
    default_model: 'mock-model',
    team_root: '.',
    max_tokens: 8192,
    temperature: 0.7,
  });
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

// ── Phase 1: Bus lifecycle ────────────────────────────────────
async function testBusLifecycle() {
  console.log('\n📦 Phase 1: Bus lifecycle');

  const { Bus } = await import('../src/bus.js');
  const bus = new Bus(TEST_DIR);

  // dispatch
  const task1 = bus.dispatch('pm', 'Write PRD for snake game', 'Create a detailed PRD for HTML5 snake game', { msgType: 'NEW_FEATURE' });
  assert(!!task1.id, `dispatch returns task with id: ${task1.id}`);
  assert(task1.status === 'pending', 'task status is pending');
  assertFileExists(path.join(TEST_DIR, 'communication', 'bus', 'pm', 'inbox', `${task1.id}.json`), 'task file in pm/inbox');

  // list inbox
  const inbox = bus.listInbox('pm');
  assert(inbox.length === 1, `pm inbox has 1 task`);
  assert(inbox[0].title === 'Write PRD for snake game', 'task title matches');

  // status
  const status = bus.getAllStatus();
  assert(status.pm.state === 'queued', 'pm state is queued');
  assert(status.dev.state === 'idle', 'dev state is idle');

  // claim
  const claimed = bus.claim('pm', task1.id);
  assert(claimed !== null, 'claim returns task');
  assert(claimed!.status === 'active', 'claimed task status is active');
  assert(!fs.existsSync(path.join(TEST_DIR, 'communication', 'bus', 'pm', 'inbox', `${task1.id}.json`)), 'task removed from inbox');
  assertFileExists(path.join(TEST_DIR, 'communication', 'bus', 'pm', 'active', `${task1.id}.json`), 'task in pm/active');

  const statusAfter = bus.getAllStatus();
  assert(statusAfter.pm.state === 'working', 'pm state is working after claim');

  // complete
  const completed = bus.complete('pm', task1.id, 'PRD completed with 5 user stories');
  assert(completed !== null, 'complete returns task');
  assert(completed!.status === 'completed', 'completed task status');
  assert(!fs.existsSync(path.join(TEST_DIR, 'communication', 'bus', 'pm', 'active', `${task1.id}.json`)), 'task removed from active');

  // archive
  const today = new Date().toISOString().slice(0, 10);
  assertFileExists(path.join(TEST_DIR, 'memory_center', 'archive', today, `${task1.id}.json`), 'task archived');

  const archived = fs.readJsonSync(path.join(TEST_DIR, 'memory_center', 'archive', today, `${task1.id}.json`));
  assert(archived.result === 'PRD completed with 5 user stories', 'archive has result summary');

  return bus;
}

// ── Phase 2: Identity engine ──────────────────────────────────
async function testIdentity() {
  console.log('\n🪪 Phase 2: Identity engine');

  const { IdentityEngine } = await import('../src/identity.js');
  const identity = new IdentityEngine(TEST_DIR);

  // AGENTS.md
  const agentsMd = identity.loadAgentsMd();
  assert(agentsMd.length > 100, `AGENTS.md loaded (${agentsMd.length} chars)`);

  // Handoff
  const handoff = identity.loadHandoff();
  assert(handoff.length > 50, `handoff_protocols.md loaded (${handoff.length} chars)`);

  // Boss identity
  const boss = identity.loadBossIdentity();
  assert(boss.length > 50, `boss identity loaded (${boss.length} chars)`);

  // Role identities
  for (const role of ['pm', 'dev', 'ui', 'tester', 'admin']) {
    const id = identity.loadIdentity(role);
    assert(id.length > 50, `${role} identity loaded (${id.length} chars)`);
  }

  // Intervention
  const intervention = identity.readIntervention();
  assert(intervention === 'RUNNING', `intervention state: ${intervention}`);

  // Knowledge
  const knowledge = identity.loadKnowledge();
  assert(knowledge.length > 10, `knowledge loaded (${knowledge.length} chars)`);

  // System prompt assembly
  const sysPrompt = identity.buildSystemPrompt('dev');
  assert(sysPrompt.includes('dev'), 'dev system prompt assembled');
  assert(sysPrompt.length > 200, `system prompt length: ${sysPrompt.length}`);

  return identity;
}

// ── Phase 3: Multi-role task chain (mock) ─────────────────────
async function testTaskChain() {
  console.log('\n🔗 Phase 3: Multi-role task chain simulation');

  const { Bus } = await import('../src/bus.js');
  const bus = new Bus(TEST_DIR);
  const workspace = path.join(TEST_DIR, 'workspace');

  // Simulate Brain dispatching tasks for "做一个贪吃蛇H5小游戏"
  console.log('\n  Step 1: Brain dispatches PM task');
  const pmTask = bus.dispatch('pm', '需求分析：贪吃蛇H5小游戏', '用户想要一个HTML5贪吃蛇游戏，请详细分析需求并产出PRD', {
    msgType: 'NEW_FEATURE',
    context: { user_request: '做一个贪吃蛇H5小游戏' },
  });
  assert(!!pmTask.id, `PM task dispatched: ${pmTask.id}`);

  // PM claims and produces PRD
  const pmClaimed = bus.claim('pm', pmTask.id);
  assert(pmClaimed !== null, 'PM claimed task');

  const prdContent = `# PRD: 贪吃蛇H5小游戏

## 背景
用户需要一个可在移动端浏览器运行的贪吃蛇小游戏。

## 目标
- 流畅的触屏/键盘操控
- 计分系统
- 游戏结束/重新开始

## 用户故事
1. 作为玩家，我可以用方向键/滑动控制蛇的方向
2. 作为玩家，我可以看到实时分数
3. 作为玩家，蛇吃到食物后会变长
4. 作为玩家，撞墙或撞自己游戏结束
5. 作为玩家，可以点击重新开始

## 验收标准
- [x] Canvas 渲染，60fps
- [x] 支持键盘方向键和触屏滑动
- [x] 分数实时显示
- [x] 碰撞检测正确
- [x] 重新开始功能`;

  // Write PM artifact
  fs.ensureDirSync(path.join(workspace, 'artifacts'));
  fs.writeFileSync(path.join(workspace, 'artifacts', `${pmTask.id}_pm.md`), prdContent);
  bus.complete('pm', pmTask.id, 'PRD completed: 5 user stories, 5 acceptance criteria');
  assertFileExists(path.join(workspace, 'artifacts', `${pmTask.id}_pm.md`), 'PM artifact written');

  // Step 2: Brain dispatches Dev task with PRD reference
  console.log('  Step 2: Brain dispatches Dev task');
  const devTask = bus.dispatch('dev', '实现贪吃蛇游戏', `根据PRD实现HTML5贪吃蛇游戏。\n\n[PRD excerpt]\n${prdContent}`, {
    msgType: 'CODE_IMPL',
    context: { depends_on: pmTask.id, artifacts: [`${pmTask.id}_pm.md`] },
  });
  assert(!!devTask.id, `Dev task dispatched: ${devTask.id}`);

  const devClaimed = bus.claim('dev', devTask.id);
  assert(devClaimed !== null, 'Dev claimed task');

  // Dev writes code files
  const codeDir = path.join(workspace, 'snake-game', 'code');
  fs.ensureDirSync(codeDir);

  const htmlCode = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>贪吃蛇</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">
    <canvas id="game" width="400" height="400"></canvas>
    <div id="score">分数: 0</div>
    <button id="restart" style="display:none">重新开始</button>
  </div>
  <script src="game.js"></script>
</body>
</html>`;

  const jsCode = `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const GRID = 20;
const COLS = canvas.width / GRID;
const ROWS = canvas.height / GRID;

let snake = [{x: 10, y: 10}];
let food = spawnFood();
let dir = {x: 1, y: 0};
let score = 0;
let gameOver = false;

function spawnFood() {
  return {
    x: Math.floor(Math.random() * COLS),
    y: Math.floor(Math.random() * ROWS),
  };
}

function update() {
  if (gameOver) return;
  const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};

  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
      snake.some(s => s.x === head.x && s.y === head.y)) {
    gameOver = true;
    document.getElementById('restart').style.display = 'block';
    return;
  }

  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) {
    score += 10;
    document.getElementById('score').textContent = '分数: ' + score;
    food = spawnFood();
  } else {
    snake.pop();
  }
}

function draw() {
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#e94560';
  ctx.fillRect(food.x * GRID, food.y * GRID, GRID - 1, GRID - 1);

  ctx.fillStyle = '#0f3460';
  snake.forEach((s, i) => {
    ctx.fillStyle = i === 0 ? '#16213e' : '#0f3460';
    ctx.fillRect(s.x * GRID, s.y * GRID, GRID - 1, GRID - 1);
  });

  if (gameOver) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width/2, canvas.height/2);
  }
}

function loop() {
  update();
  draw();
  if (!gameOver) setTimeout(loop, 120);
}

document.addEventListener('keydown', e => {
  const map = {ArrowUp: {x:0,y:-1}, ArrowDown: {x:0,y:1}, ArrowLeft: {x:-1,y:0}, ArrowRight: {x:1,y:0}};
  if (map[e.key]) dir = map[e.key];
});

document.getElementById('restart').addEventListener('click', () => {
  snake = [{x: 10, y: 10}];
  food = spawnFood();
  dir = {x: 1, y: 0};
  score = 0;
  gameOver = false;
  document.getElementById('score').textContent = '分数: 0';
  document.getElementById('restart').style.display = 'none';
  loop();
});

loop();`;

  const cssCode = `* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: #0a0a23; display: flex; justify-content: center; align-items: center; min-height: 100vh; font-family: sans-serif; }
#app { text-align: center; }
canvas { border: 2px solid #16213e; border-radius: 8px; }
#score { color: #e94560; font-size: 20px; margin-top: 12px; }
button { margin-top: 12px; padding: 8px 24px; font-size: 16px; background: #e94560; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
button:hover { background: #c73e54; }`;

  fs.writeFileSync(path.join(codeDir, 'index.html'), htmlCode);
  fs.writeFileSync(path.join(codeDir, 'game.js'), jsCode);
  fs.writeFileSync(path.join(codeDir, 'style.css'), cssCode);

  const devResult = `Implemented snake game with 3 files: index.html, game.js, style.css.
- Canvas rendering at ~8fps (setTimeout 120ms)
- Keyboard controls (arrow keys)
- Score tracking
- Collision detection (walls + self)
- Restart button on game over`;

  const devArtifact = `${devResult}\n\n## Files Written\n- index.html\n- game.js\n- style.css`;
  fs.writeFileSync(path.join(workspace, 'artifacts', `${devTask.id}_dev.md`), devArtifact);
  bus.complete('dev', devTask.id, devResult.slice(0, 200));

  assertFileExists(path.join(codeDir, 'index.html'), 'Dev wrote index.html');
  assertFileExists(path.join(codeDir, 'game.js'), 'Dev wrote game.js');
  assertFileExists(path.join(codeDir, 'style.css'), 'Dev wrote style.css');
  assertFileExists(path.join(workspace, 'artifacts', `${devTask.id}_dev.md`), 'Dev artifact written');

  // Step 3: Brain dispatches Tester
  console.log('  Step 3: Brain dispatches Tester task');
  const testTask = bus.dispatch('tester', '测试贪吃蛇游戏', `测试贪吃蛇H5游戏的所有功能。代码路径: ${codeDir}`, {
    msgType: 'TEST_REQUEST',
    context: { depends_on: devTask.id, artifacts: [`${devTask.id}_dev.md`] },
  });
  assert(!!testTask.id, `Tester task dispatched: ${testTask.id}`);

  const testerClaimed = bus.claim('tester', testTask.id);
  assert(testerClaimed !== null, 'Tester claimed task');

  const testReport = `# 测试报告：贪吃蛇H5小游戏

## 测试概要
- 测试日期: ${new Date().toISOString().slice(0, 10)}
- 测试范围: 全部5项验收标准
- 测试结果: 4/5 PASS, 1/5 待优化

## 测试用例

| TC | 标题 | 结果 |
|----|------|------|
| TC-01 | Canvas渲染正常 | ✅ PASS |
| TC-02 | 键盘方向键控制 | ✅ PASS |
| TC-03 | 分数实时显示 | ✅ PASS |
| TC-04 | 碰撞检测(墙壁+自身) | ✅ PASS |
| TC-05 | 触屏滑动控制 | ⚠️ 未实现 |

## BUG Report
BUG-01: 缺少触屏滑动支持
- Severity: Major
- PRD要求支持触屏滑动，当前仅支持键盘
- 建议: 添加 touchstart/touchmove 事件监听

## 总结
核心功能完整，建议补充触屏支持后上线。
Verdict: CONDITIONAL PASS`;

  fs.writeFileSync(path.join(workspace, 'artifacts', `${testTask.id}_tester.md`), testReport);
  bus.complete('tester', testTask.id, testReport.slice(0, 200));
  assertFileExists(path.join(workspace, 'artifacts', `${testTask.id}_tester.md`), 'Tester artifact written');

  // Step 4: Admin summary
  console.log('  Step 4: Brain dispatches Admin task');
  const adminTask = bus.dispatch('admin', '项目总结：贪吃蛇H5小游戏', '汇总项目进度，输出项目报告', {
    msgType: 'ADMIN_SUMMARY',
    context: {
      depends_on: testTask.id,
      artifacts: [`${pmTask.id}_pm.md`, `${devTask.id}_dev.md`, `${testTask.id}_tester.md`],
    },
  });

  const adminClaimed = bus.claim('admin', adminTask.id);
  assert(adminClaimed !== null, 'Admin claimed task');

  const adminReport = `# 项目报告：贪吃蛇H5小游戏

## 状态: 待补充触屏功能

### 里程碑
| 阶段 | 状态 |
|------|------|
| 需求分析(PM) | ✅ 完成 |
| 代码实现(Dev) | ✅ 完成 |
| 测试(Tester) | ⚠️ 条件通过 |

### 遗留问题
1. BUG-01: 触屏滑动未实现 (Major)

### 下一步
- Dev 补充 touch 事件支持
- Tester 回归测试 TC-05`;

  fs.writeFileSync(path.join(workspace, 'artifacts', `${adminTask.id}_admin.md`), adminReport);
  bus.complete('admin', adminTask.id, adminReport.slice(0, 200));
  assertFileExists(path.join(workspace, 'artifacts', `${adminTask.id}_admin.md`), 'Admin artifact written');

  // Verify all tasks archived
  console.log('\n  Verifying archive:');
  const today = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(TEST_DIR, 'memory_center', 'archive', today);
  assertFileExists(path.join(archiveDir, `${pmTask.id}.json`), 'PM task archived');
  assertFileExists(path.join(archiveDir, `${devTask.id}.json`), 'Dev task archived');
  assertFileExists(path.join(archiveDir, `${testTask.id}.json`), 'Tester task archived');
  assertFileExists(path.join(archiveDir, `${adminTask.id}.json`), 'Admin task archived');

  // Verify full status is idle after all done
  const finalStatus = bus.getAllStatus();
  for (const role of ['pm', 'dev', 'tester', 'admin']) {
    assert(finalStatus[role].state === 'idle', `${role} is idle after completion`);
  }

  return { pmTask, devTask, testTask, adminTask, codeDir };
}

// ── Phase 4: Artifact content validation ──────────────────────
async function testArtifactContent(ids: { pmTask: any; devTask: any; testTask: any; adminTask: any; codeDir: string }) {
  console.log('\n📋 Phase 4: Artifact content validation');

  const workspace = path.join(TEST_DIR, 'workspace');

  // PRD artifact
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.pmTask.id}_pm.md`),
    '用户故事',
    'PRD contains user stories section'
  );
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.pmTask.id}_pm.md`),
    '验收标准',
    'PRD contains acceptance criteria'
  );

  // Dev artifact
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.devTask.id}_dev.md`),
    'Files Written',
    'Dev artifact lists written files'
  );

  // Code files
  assertFileContains(path.join(ids.codeDir, 'index.html'), '<canvas', 'HTML has canvas element');
  assertFileContains(path.join(ids.codeDir, 'game.js'), 'spawnFood', 'JS has game logic');
  assertFileContains(path.join(ids.codeDir, 'style.css'), 'canvas', 'CSS styles canvas');

  // Test report
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.testTask.id}_tester.md`),
    'BUG-01',
    'Test report has bug report'
  );
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.testTask.id}_tester.md`),
    'Verdict',
    'Test report has verdict'
  );

  // Admin report
  assertFileContains(
    path.join(workspace, 'artifacts', `${ids.adminTask.id}_admin.md`),
    '遗留问题',
    'Admin report has remaining issues'
  );

  // Archive task has dependency info
  const today = new Date().toISOString().slice(0, 10);
  const devArchived = fs.readJsonSync(
    path.join(TEST_DIR, 'memory_center', 'archive', today, `${ids.devTask.id}.json`)
  );
  assert(
    devArchived.context?.depends_on === ids.pmTask.id,
    `Dev task archive has depends_on → PM task ${ids.pmTask.id}`
  );
}

// ── Phase 5: Reflection (error path) ─────────────────────────
async function testReflection() {
  console.log('\n💭 Phase 5: Reflection on error');

  const { Bus } = await import('../src/bus.js');
  const bus = new Bus(TEST_DIR);

  // Dispatch a task that will "fail"
  const failTask = bus.dispatch('dev', 'Broken task', 'This will error');
  bus.claim('dev', failTask.id);
  bus.complete('dev', failTask.id, 'ERROR: timeout');

  // Simulate writeReflection (as AgentRunner would)
  const reflection = {
    task_id: failTask.id,
    role: 'dev',
    title: 'Broken task',
    type: 'CODE_IMPL',
    success: false,
    summary: 'ERROR: timeout',
    ts: new Date().toISOString(),
  };
  const dateStr = new Date().toISOString().slice(0, 10);
  const archiveDir = path.join(TEST_DIR, 'memory_center', 'archive', dateStr);
  fs.ensureDirSync(archiveDir);
  fs.writeJsonSync(path.join(archiveDir, `${failTask.id}_dev_reflection.json`), reflection, { spaces: 2 });

  assertFileExists(
    path.join(archiveDir, `${failTask.id}_dev_reflection.json`),
    'Reflection file written for failed task'
  );

  // Now test that identity engine picks it up
  const { IdentityEngine } = await import('../src/identity.js');
  const identity = new IdentityEngine(TEST_DIR);
  const reflections = identity.loadRecentReflections('dev');
  assert(reflections.includes('FAIL'), 'Recent reflections include failure entry');
  assert(reflections.includes('Broken task'), 'Recent reflections include task title');
}

// ── Run ──────────────────────────────────────────────────────
async function main() {
  console.log('🚀 OPC Mock E2E Test\n');
  console.log(`Test dir: ${TEST_DIR}`);

  await setup();
  console.log('✅ Setup complete');

  await testBusLifecycle();
  await testIdentity();
  const ids = await testTaskChain();
  await testArtifactContent(ids);
  await testReflection();

  // Print artifact tree
  console.log('\n📁 Artifact tree:');
  const artDir = path.join(TEST_DIR, 'workspace', 'artifacts');
  if (fs.existsSync(artDir)) {
    for (const f of fs.readdirSync(artDir).sort()) {
      const size = fs.statSync(path.join(artDir, f)).size;
      console.log(`  ${f} (${size} bytes)`);
    }
  }

  const codeDir = ids.codeDir;
  console.log('\n📁 Code output:');
  if (fs.existsSync(codeDir)) {
    for (const f of fs.readdirSync(codeDir).sort()) {
      const size = fs.statSync(path.join(codeDir, f)).size;
      console.log(`  ${f} (${size} bytes)`);
    }
  }

  console.log('\n📁 Archive:');
  const today = new Date().toISOString().slice(0, 10);
  const archDir = path.join(TEST_DIR, 'memory_center', 'archive', today);
  if (fs.existsSync(archDir)) {
    for (const f of fs.readdirSync(archDir).sort()) {
      console.log(`  ${f}`);
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
  }

  // Cleanup
  fs.removeSync(TEST_DIR);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
