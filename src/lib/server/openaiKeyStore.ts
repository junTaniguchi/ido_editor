import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR_NAME = '.dataloom';
const CONFIG_FILE_NAME = 'settings.json';
const CONFIG_KEY = 'openAiApiKey';

export type OpenAiKeySource = 'env' | 'stored' | 'none';

export interface OpenAiKeyStatus {
  hasKey: boolean;
  hasStoredKey: boolean;
  source: OpenAiKeySource;
}

let cachedStoredKey: string | null | undefined;

function getConfigDirectory(): string {
  if (process.env.DATALOOM_CONFIG_DIR) {
    return process.env.DATALOOM_CONFIG_DIR;
  }
  return path.join(os.homedir(), CONFIG_DIR_NAME);
}

function getConfigFilePath(): string {
  return path.join(getConfigDirectory(), CONFIG_FILE_NAME);
}

async function ensureConfigDirectory(): Promise<void> {
  const dir = getConfigDirectory();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EEXIST') {
      return;
    }
    throw error;
  });
}

async function readConfigFile(): Promise<Record<string, unknown>> {
  const filePath = getConfigFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return {};
    }
    return data as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeConfigFile(payload: Record<string, unknown>): Promise<void> {
  await ensureConfigDirectory();
  const filePath = getConfigFilePath();
  const serialized = JSON.stringify(payload, null, 2);
  await fs.writeFile(filePath, serialized, { mode: 0o600 });
}

function normalizeKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function getStoredOpenAiApiKey(): Promise<string | null> {
  if (cachedStoredKey !== undefined) {
    return cachedStoredKey;
  }

  const config = await readConfigFile();
  const key = normalizeKey(config[CONFIG_KEY]);
  cachedStoredKey = key;
  return cachedStoredKey;
}

export async function setStoredOpenAiApiKey(apiKey: string): Promise<void> {
  const normalized = normalizeKey(apiKey);
  if (!normalized) {
    await deleteStoredOpenAiApiKey();
    return;
  }

  const config = await readConfigFile();
  const nextConfig = { ...config, [CONFIG_KEY]: normalized };
  await writeConfigFile(nextConfig);
  cachedStoredKey = normalized;
}

export async function deleteStoredOpenAiApiKey(): Promise<void> {
  const config = await readConfigFile();
  if (config[CONFIG_KEY] === undefined) {
    cachedStoredKey = null;
    return;
  }

  const { [CONFIG_KEY]: _removed, ...rest } = config;
  await writeConfigFile(rest);
  cachedStoredKey = null;
}

export async function getEffectiveOpenAiApiKey(): Promise<string | null> {
  const envValue = normalizeKey(process.env.OPENAI_API_KEY);
  if (envValue) {
    return envValue;
  }
  return getStoredOpenAiApiKey();
}

export async function hasOpenAiApiKeyConfigured(): Promise<boolean> {
  if (normalizeKey(process.env.OPENAI_API_KEY)) {
    return true;
  }
  const stored = await getStoredOpenAiApiKey();
  return !!stored;
}

export async function getOpenAiApiKeyStatus(): Promise<OpenAiKeyStatus> {
  const envValue = normalizeKey(process.env.OPENAI_API_KEY);
  const stored = await getStoredOpenAiApiKey();
  const hasStoredKey = !!stored;

  let source: OpenAiKeySource = 'none';

  if (envValue) {
    source = 'env';
  } else if (hasStoredKey) {
    source = 'stored';
  }

  return {
    hasKey: source !== 'none',
    hasStoredKey,
    source,
  };
}
