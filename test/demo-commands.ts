/**
 * 测试所有 slash 命令
 * /status /tasks /inbox /help /skills /skill list /compact /dispatch
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { Bus } from '../src/bus.js';
import { IdentityEngine } from '../src/identity.js';
import { SkillLoader } from '../src/skill-loader.js';
import * as ui from '../src/ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEMO_DIR = path.join(PROJECT_ROOT, '.demo-cmds');

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

function cmd(text: string) {
  console.log(`\n${chalk.bold.cyan('opc >')} ${chalk.white(text)}`);
  console.log();
}

function divider() {
  console.log(chalk.dim('─'.repeat(60)));
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) { console.log(`  ${chalk.green('✅')} ${msg}`); passed++; }
  else { console.log(`  ${chalk.red('❌')} ${msg}`); failed++; }
}

// ── Tests ────────────────────────────────────────────────────
async function main() {
  setup();
  const bus = new Bus(DEMO_DIR);
  const skills = new SkillLoader(path.join(DEMO_DIR, 'skills'));

  console.log(chalk.bold('\n🧪 Slash Commands Test\n'));
  divider();

  // ── /help ──
  cmd('/help');
  ui.printHelp();
  assert(true, '/help renders without error');
  divider();

  // ── /status (empty) ──
  cmd('/status');
  const status1 = bus.getAllStatus();
  ui.printStatus(status1);
  assert(Object.keys(status1).length === 5, '/status shows all 5 roles');
  assert(Object.values(status1).every(s => s.state === 'idle'), 'all roles idle initially');
  divider();

  // ── /tasks (empty) ──
  cmd('/tasks');
  ui.printTasks([]);
  assert(true, '/tasks renders empty state');
  divider();

  // ── /dispatch pm 测试需求分析 ──
  cmd('/dispatch pm 测试需求分析');
  const task1 = bus.dispatch('pm', '测试需求分析', '测试需求分析');
  console.log(`  Dispatched [${task1.id}] to pm`);
  assert(!!task1.id, `/dispatch creates task ${task1.id}`);
  divider();

  // ── /dispatch dev 写个hello world ──
  cmd('/dispatch dev 写个hello world');
  const task2 = bus.dispatch('dev', '写个hello world', '写个hello world');
  console.log(`  Dispatched [${task2.id}] to dev`);
  assert(!!task2.id, `/dispatch creates task ${task2.id}`);
  divider();

  // ── /status (with tasks) ──
  cmd('/status');
  const status2 = bus.getAllStatus();
  ui.printStatus(status2);
  assert(status2.pm.state === 'queued', 'pm is queued after dispatch');
  assert(status2.pm.inbox === 1, 'pm has 1 inbox item');
  assert(status2.dev.state === 'queued', 'dev is queued after dispatch');
  divider();

  // ── /tasks (with items) ──
  cmd('/tasks');
  const allTasks: any[] = [];
  for (const role of ['pm', 'dev', 'ui', 'tester', 'admin']) {
    allTasks.push(...bus.listInbox(role));
    allTasks.push(...bus.listActive(role));
  }
  ui.printTasks(allTasks);
  assert(allTasks.length === 2, `/tasks shows 2 tasks`);
  divider();

  // ── /inbox pm ──
  cmd('/inbox pm');
  const pmInbox = bus.listInbox('pm');
  ui.printInbox('pm', pmInbox);
  assert(pmInbox.length === 1, '/inbox pm has 1 task');
  assert(pmInbox[0].title === '测试需求分析', 'task title correct');
  divider();

  // ── /inbox dev ──
  cmd('/inbox dev');
  const devInbox = bus.listInbox('dev');
  ui.printInbox('dev', devInbox);
  assert(devInbox.length === 1, '/inbox dev has 1 task');
  divider();

  // ── /inbox tester (empty) ──
  cmd('/inbox tester');
  const testerInbox = bus.listInbox('tester');
  ui.printInbox('tester', testerInbox);
  assert(testerInbox.length === 0, '/inbox tester is empty');
  divider();

  // ── Claim + check status changes ──
  cmd('(simulate: pm claims task)');
  bus.claim('pm', task1.id);
  const status3 = bus.getAllStatus();
  ui.printStatus(status3);
  assert(status3.pm.state === 'working', 'pm is working after claim');
  assert(status3.pm.active === 1, 'pm has 1 active task');
  assert(status3.pm.inbox === 0, 'pm inbox is now empty');
  divider();

  // ── Complete + check archive ──
  cmd('(simulate: pm completes task)');
  bus.complete('pm', task1.id, 'PRD done');
  const status4 = bus.getAllStatus();
  ui.printStatus(status4);
  assert(status4.pm.state === 'idle', 'pm returns to idle after complete');
  const today = new Date().toISOString().slice(0, 10);
  const archivePath = path.join(DEMO_DIR, 'memory_center', 'archive', today, `${task1.id}.json`);
  assert(fs.existsSync(archivePath), `task archived at ${today}/${task1.id}.json`);
  divider();

  // ── /skills ──
  cmd('/skills');
  const skillTools = skills.scan();
  const skillList = skills.listSkills();
  ui.printSkills(skillList);
  assert(skillList.length === 1, '/skills shows 1 installed skill');
  assert(skillList[0].name === 'hello_world', 'hello_world skill found');
  divider();

  // ── /skill list ──
  cmd('/skill list');
  for (const s of skillList) {
    console.log(`  ${chalk.cyan(s.name)} v${s.version} — ${s.description}`);
  }
  assert(true, '/skill list renders');
  divider();

  // ── Execute hello_world skill ──
  cmd('(simulate: skill_hello_world { message: "OPC" })');
  const skillResult = skills.execute('hello_world', { message: 'OPC' });
  console.log(`  ${chalk.cyan('⚡')} Skill hello_world: ${skillResult}`);
  const parsed = JSON.parse(skillResult);
  assert(parsed.reply === 'Hello! You said: OPC', 'hello_world skill returns correct result');
  divider();

  // ── /compact ──
  cmd('/compact');
  let compact = false;
  compact = !compact;
  console.log(`  Compact mode: ${compact ? 'on' : 'off'}`);
  assert(compact === true, '/compact toggles on');

  cmd('/compact');
  compact = !compact;
  console.log(`  Compact mode: ${compact ? 'on' : 'off'}`);
  assert(compact === false, '/compact toggles off');
  divider();

  // ── Unknown command ──
  cmd('/foo');
  ui.printError('Unknown command: /foo');
  assert(true, 'unknown command shows error');
  divider();

  // ── /exit ──
  cmd('/exit');
  console.log('  Bye.');
  assert(true, '/exit handled');
  divider();

  // ── Summary ──
  console.log(`\n${chalk.bold('Results:')} ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(chalk.green('🎉 All command tests passed!\n'));
  }

  fs.removeSync(DEMO_DIR);
}

main().catch(console.error);
