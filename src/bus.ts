import fs from 'fs-extra';
import path from 'path';
import { randomUUID } from 'crypto';

export const ROLES = ['pm', 'dev', 'ui', 'tester', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export interface Task {
  id: string;
  from: string;
  to: string;
  type: string;
  title: string;
  content: string;
  context: Record<string, any>;
  status: string;
  ts: string;
  result?: string;
  completed_at?: string;
}

export interface RoleStatus {
  state: 'idle' | 'working' | 'queued';
  inbox: number;
  active: number;
}

export class Bus {
  private root: string;
  private archive: string;

  constructor(teamRoot: string) {
    this.root = path.join(teamRoot, 'communication', 'bus');
    this.archive = path.join(teamRoot, 'memory_center', 'archive');
    this.ensureDirs();
  }

  private ensureDirs() {
    for (const role of ROLES) {
      fs.ensureDirSync(path.join(this.root, role, 'inbox'));
      fs.ensureDirSync(path.join(this.root, role, 'active'));
    }
    fs.ensureDirSync(this.archive);
  }

  dispatch(
    toRole: string,
    title: string,
    content: string,
    opts?: { fromRole?: string; msgType?: string; context?: Record<string, any> }
  ): Task {
    const task: Task = {
      id: randomUUID().slice(0, 8),
      from: opts?.fromRole ?? 'boss',
      to: toRole,
      type: opts?.msgType ?? '',
      title,
      content,
      context: opts?.context ?? {},
      status: 'pending',
      ts: new Date().toISOString(),
    };
    const filePath = path.join(this.root, toRole, 'inbox', `${task.id}.json`);
    fs.writeJsonSync(filePath, task, { spaces: 2 });
    return task;
  }

  claim(role: string, taskId: string): Task | null {
    const src = path.join(this.root, role, 'inbox', `${taskId}.json`);
    if (!fs.existsSync(src)) return null;
    const dst = path.join(this.root, role, 'active', `${taskId}.json`);
    fs.moveSync(src, dst, { overwrite: true });
    const task: Task = fs.readJsonSync(dst);
    task.status = 'active';
    fs.writeJsonSync(dst, task, { spaces: 2 });
    return task;
  }

  complete(role: string, taskId: string, resultSummary = ''): Task | null {
    const src = path.join(this.root, role, 'active', `${taskId}.json`);
    if (!fs.existsSync(src)) return null;
    const task: Task = fs.readJsonSync(src);
    task.status = 'completed';
    task.result = resultSummary;
    task.completed_at = new Date().toISOString();
    const dateStr = new Date().toISOString().slice(0, 10);
    const dateDir = path.join(this.archive, dateStr);
    fs.ensureDirSync(dateDir);
    fs.writeJsonSync(path.join(dateDir, `${taskId}.json`), task, { spaces: 2 });
    fs.removeSync(src);
    return task;
  }

  listInbox(role: string): Task[] {
    return this.listDir(path.join(this.root, role, 'inbox'));
  }

  listActive(role: string): Task[] {
    return this.listDir(path.join(this.root, role, 'active'));
  }

  getAllStatus(): Record<string, RoleStatus> {
    const status: Record<string, RoleStatus> = {};
    for (const role of ROLES) {
      const inbox = this.listInbox(role);
      const active = this.listActive(role);
      let state: RoleStatus['state'] = 'idle';
      if (active.length > 0) state = 'working';
      else if (inbox.length > 0) state = 'queued';
      status[role] = { state, inbox: inbox.length, active: active.length };
    }
    return status;
  }

  private listDir(dir: string): Task[] {
    if (!fs.existsSync(dir)) return [];
    const tasks: Task[] = [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
    for (const f of files) {
      try {
        tasks.push(fs.readJsonSync(path.join(dir, f)));
      } catch {}
    }
    return tasks;
  }
}
