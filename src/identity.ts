import fs from 'fs';
import path from 'path';

const ROLE_DIR: Record<string, string> = {
  boss: 'boss_decide',
  pm: 'pm_office',
  dev: 'dev_forge',
  ui: 'ui_ux_studio',
  tester: 'tester',
  admin: 'admin_bp',
};

const ROLE_IDENTITY_FILE: Record<string, string> = {
  boss: 'identity.md',
  pm: 'pm_identity.md',
  dev: 'dev_identity.md',
  ui: 'ui_identity.md',
  tester: 'tester_identity.md',
  admin: 'bp_identity.md',
};

export class IdentityEngine {
  private teamRoot: string;
  private staffDir: string;
  private boundaryFile: string;
  private agentsFile: string;
  private handoffFile: string;
  private boundaryCache: string | null = null;
  private agentsCache: string | null = null;
  private handoffCache: string | null = null;

  constructor(teamRoot: string) {
    this.teamRoot = teamRoot;
    this.staffDir = path.join(teamRoot, 'staff');
    this.boundaryFile = path.join(teamRoot, 'boundary.md');
    this.agentsFile = path.join(teamRoot, 'AGENTS.md');
    this.handoffFile = path.join(teamRoot, 'communication', 'handoff_protocols.md');
  }

  loadAgentsMd(): string {
    if (this.agentsCache === null) {
      this.agentsCache = this.readFileOrEmpty(this.agentsFile);
    }
    return this.agentsCache;
  }

  loadHandoff(): string {
    if (this.handoffCache === null) {
      this.handoffCache = this.readFileOrEmpty(this.handoffFile);
    }
    return this.handoffCache;
  }

  private boundary(): string {
    if (this.boundaryCache === null) {
      this.boundaryCache = this.readFileOrEmpty(this.boundaryFile);
    }
    return this.boundaryCache;
  }

  loadKnowledge(): string {
    const kbDir = path.join(this.teamRoot, 'knowledge_base');
    if (!fs.existsSync(kbDir)) return '';
    return this.readMdRecursive(kbDir);
  }

  private readMdRecursive(dir: string): string {
    if (!fs.existsSync(dir)) return '';
    const parts: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = this.readMdRecursive(full);
        if (sub) parts.push(sub);
      } else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf-8').trim();
        if (text) parts.push(text);
      }
    }
    return parts.join('\n\n');
  }

  loadIdentity(role: string): string {
    const dir = ROLE_DIR[role] ?? role;
    const file = ROLE_IDENTITY_FILE[role] ?? `${role}_identity.md`;
    const filePath = path.join(this.staffDir, dir, file);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
    return `You are the ${role} agent.`;
  }

  loadBossIdentity(): string {
    const filePath = path.join(this.staffDir, 'boss_decide', 'identity.md');
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim();
    }
    return '';
  }

  readIntervention(): string {
    const filePath = path.join(this.staffDir, 'boss_decide', 'intervention.md');
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8').trim().toUpperCase();
    }
    return 'RUNNING';
  }

  loadRecentReflections(role: string, maxCount = 3): string {
    const archiveDir = path.join(this.teamRoot, 'memory_center', 'archive');
    if (!fs.existsSync(archiveDir)) return '';
    const dateDirs = fs.readdirSync(archiveDir).sort().reverse();
    const entries: string[] = [];
    for (const d of dateDirs) {
      const dirPath = path.join(archiveDir, d);
      if (!fs.statSync(dirPath).isDirectory() || d.startsWith('.')) continue;
      const reflFiles = fs.readdirSync(dirPath)
        .filter(f => f.includes(`_${role}_reflection.json`))
        .sort()
        .reverse();
      for (const f of reflFiles) {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(dirPath, f), 'utf-8'));
          const tag = r.success ? 'OK' : 'FAIL';
          entries.push(`- [${r.type ?? '?'}] "${r.title ?? ''}" → ${tag}: ${(r.summary ?? '').slice(0, 80)}`);
        } catch {}
        if (entries.length >= maxCount) break;
      }
      if (entries.length >= maxCount) break;
    }
    if (entries.length === 0) return '';
    return '## Recent Experience\n' + entries.join('\n');
  }

  buildSystemPrompt(role: string): string {
    const agentsMd = this.loadAgentsMd();
    const identity = this.loadIdentity(role);
    const boundaryText = this.boundary();
    const knowledge = this.loadKnowledge();
    const reflections = this.loadRecentReflections(role);
    const parts: string[] = [];
    if (agentsMd) {
      parts.push(agentsMd);
      parts.push('\n---\n');
    }
    parts.push(identity);
    if (knowledge) parts.push(`\n---\n${knowledge}`);
    if (reflections) parts.push(`\n${reflections}`);
    if (boundaryText) parts.push(`\n---\n${boundaryText}`);
    return parts.join('\n');
  }

  private readFileOrEmpty(filePath: string): string {
    try {
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf-8').trim();
      }
    } catch {}
    return '';
  }
}
