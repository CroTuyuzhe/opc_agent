import fs from 'fs-extra';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import type { ToolDef } from './tools.js';

interface SkillManifest {
  name: string;
  description: string;
  version: string;
  type?: string;
  entry?: string;
  parameters?: Record<string, any>;
}

interface SkillInfo {
  manifest: SkillManifest;
  path: string;
}

export class SkillLoader {
  private dir: string;
  private cache: Map<string, SkillInfo> = new Map();

  constructor(skillsDir: string) {
    this.dir = skillsDir;
    fs.ensureDirSync(this.dir);
  }

  scan(): ToolDef[] {
    this.cache.clear();
    const toolDefs: ToolDef[] = [];
    if (!fs.existsSync(this.dir)) return toolDefs;

    const entries = fs.readdirSync(this.dir);
    for (const entry of entries) {
      const manifestPath = path.join(this.dir, entry, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      try {
        const m: SkillManifest = fs.readJsonSync(manifestPath);
        const name = m.name ?? entry;
        this.cache.set(name, { manifest: m, path: path.join(this.dir, entry) });
        toolDefs.push({
          type: 'function',
          function: {
            name: `skill_${name}`,
            description: m.description ?? name,
            parameters: m.parameters ?? { type: 'object', properties: {} },
          },
        });
      } catch {}
    }
    return toolDefs;
  }

  execute(skillName: string, args: Record<string, any>): string {
    const info = this.cache.get(skillName);
    if (!info) return `Skill not found: ${skillName}`;

    const entryFile = path.join(info.path, info.manifest.entry ?? 'run.js');
    if (!fs.existsSync(entryFile)) return `Entry not found: ${entryFile}`;

    const type = info.manifest.type ?? 'node';
    const cmd = type === 'python' ? 'python3' : type === 'node' ? 'node' : 'bash';

    try {
      const result = execFileSync(cmd, [entryFile], {
        input: JSON.stringify(args),
        timeout: 60_000,
        cwd: info.path,
        encoding: 'utf-8',
      });
      return result.trim();
    } catch (e: any) {
      if (e.killed) return 'Skill timeout (60s)';
      if (e.stderr) return `Skill error: ${e.stderr.trim()}`;
      return `Skill failed: ${e.message}`;
    }
  }

  install(githubUrl: string): string {
    const name = githubUrl.replace(/\/$/, '').split('/').pop()?.replace(/\.git$/, '') ?? 'unknown';
    const dest = path.join(this.dir, name);
    if (fs.existsSync(dest)) return `Skill '${name}' already exists. Remove first.`;

    try {
      execSync(`git clone --depth 1 ${githubUrl} ${dest}`, {
        timeout: 120_000,
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    } catch (e: any) {
      return `Clone failed: ${e.stderr?.trim() ?? e.message}`;
    }

    if (!fs.existsSync(path.join(dest, 'manifest.json'))) {
      fs.removeSync(dest);
      return 'Invalid skill: no manifest.json found. Removed.';
    }

    const req = path.join(dest, 'requirements.txt');
    if (fs.existsSync(req)) {
      try {
        execSync(`python3 -m pip install -r ${req}`, { timeout: 120_000, stdio: 'pipe' });
      } catch {}
    }

    const pkg = path.join(dest, 'package.json');
    if (fs.existsSync(pkg)) {
      try {
        execSync('npm install --production', { timeout: 120_000, stdio: 'pipe', cwd: dest });
      } catch {}
    }

    this.scan();
    return `Installed skill '${name}'.`;
  }

  remove(skillName: string): string {
    const target = path.join(this.dir, skillName);
    if (!fs.existsSync(target)) return `Skill '${skillName}' not found.`;
    fs.removeSync(target);
    this.cache.delete(skillName);
    return `Removed skill '${skillName}'.`;
  }

  listSkills(): Array<{ name: string; description: string; version: string }> {
    if (this.cache.size === 0) this.scan();
    return Array.from(this.cache.entries()).map(([name, info]) => ({
      name,
      description: info.manifest.description ?? '',
      version: info.manifest.version ?? '',
    }));
  }
}
