import fs from 'fs';
import path from 'path';

export interface Config {
  provider: 'openai' | 'anthropic';
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  teamRoot: string;
  maxTokens: number;
  temperature: number;
}

const DEFAULTS: Config = {
  provider: 'openai',
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o',
  teamRoot: '.',
  maxTokens: 8192,
  temperature: 0.7,
};

const ENV_MAP: Record<string, keyof Config> = {
  OPC_API_KEY: 'apiKey',
  OPC_BASE_URL: 'baseUrl',
  OPC_MODEL: 'defaultModel',
  OPC_PROVIDER: 'provider',
  OPC_TEAM_ROOT: 'teamRoot',
  OPC_MAX_TOKENS: 'maxTokens',
  OPC_TEMPERATURE: 'temperature',
};

function loadJson(filePath: string): Partial<Config> {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const mapped: Partial<Config> = {};
      if (raw.provider) mapped.provider = raw.provider;
      if (raw.api_key) mapped.apiKey = raw.api_key;
      if (raw.base_url) mapped.baseUrl = raw.base_url;
      if (raw.default_model) mapped.defaultModel = raw.default_model;
      if (raw.team_root) mapped.teamRoot = raw.team_root;
      if (raw.max_tokens != null) mapped.maxTokens = Number(raw.max_tokens);
      if (raw.temperature != null) mapped.temperature = Number(raw.temperature);
      return mapped;
    }
  } catch {}
  return {};
}

const NUMERIC_FIELDS = new Set<keyof Config>(['maxTokens', 'temperature']);

function envOverrides(): Partial<Config> {
  const out: Partial<Config> = {};
  for (const [envKey, field] of Object.entries(ENV_MAP)) {
    const val = process.env[envKey];
    if (val) {
      (out as any)[field] = NUMERIC_FIELDS.has(field) ? Number(val) : val;
    }
  }
  return out;
}

export function loadConfig(): Config {
  const globalCfg = loadJson(path.join(process.env.HOME || '~', '.opc', 'opc.json'));
  const localCfg = loadJson(path.join(process.cwd(), 'opc.json'));
  const env = envOverrides();

  return { ...DEFAULTS, ...globalCfg, ...localCfg, ...env };
}

export function teamRootPath(config: Config): string {
  return path.resolve(config.teamRoot);
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  if (!config.apiKey) errors.push('api_key is required');
  if (!['openai', 'anthropic'].includes(config.provider)) {
    errors.push(`unknown provider: ${config.provider}`);
  }
  if (!fs.existsSync(teamRootPath(config))) {
    errors.push(`team_root not found: ${config.teamRoot}`);
  }
  return errors;
}
