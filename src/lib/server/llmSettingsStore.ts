import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import type { LlmKeySource, LlmProvider, LlmProviderStatus, LlmSettingsStatus } from '@/types/llm';

const CONFIG_DIR_NAME = '.dataloom';
const CONFIG_FILE_NAME = 'settings.json';
const OPENAI_CONFIG_KEY = 'openAiApiKey';
const GEMINI_CONFIG_KEY = 'geminiApiKey';
const ACTIVE_PROVIDER_KEY = 'activeLlmProvider';

type ProviderKey = 'openai' | 'gemini';

interface RawConfig {
  openAiApiKey?: unknown;
  geminiApiKey?: unknown;
  activeLlmProvider?: unknown;
  [key: string]: unknown;
}

const ENV_KEY_MAP: Record<ProviderKey, string> = {
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

const CONFIG_KEY_MAP: Record<ProviderKey, string> = {
  openai: OPENAI_CONFIG_KEY,
  gemini: GEMINI_CONFIG_KEY,
};

let cachedStoredKeys: Partial<Record<ProviderKey, string | null>> = {};

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

async function readConfigFile(): Promise<RawConfig> {
  const filePath = getConfigFilePath();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return {};
    }
    return data as RawConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

async function writeConfigFile(payload: RawConfig): Promise<void> {
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

function normalizeProvider(value: unknown): LlmProvider | null {
  if (value === 'openai' || value === 'gemini' || value === 'none') {
    return value;
  }
  return null;
}

function getEnvKey(provider: ProviderKey): string | null {
  const envName = ENV_KEY_MAP[provider];
  const value = process.env[envName];
  return normalizeKey(value ?? null);
}

async function getStoredApiKey(provider: ProviderKey): Promise<string | null> {
  if (cachedStoredKeys[provider] !== undefined) {
    return cachedStoredKeys[provider] ?? null;
  }

  const config = await readConfigFile();
  const key = normalizeKey(config[CONFIG_KEY_MAP[provider]]);
  cachedStoredKeys[provider] = key;
  return key;
}

async function persistStoredApiKey(provider: ProviderKey, apiKey: string | null): Promise<void> {
  const config = await readConfigFile();
  const normalized = apiKey ? normalizeKey(apiKey) : null;
  if (!normalized) {
    if (config[CONFIG_KEY_MAP[provider]] !== undefined) {
      const { [CONFIG_KEY_MAP[provider]]: _removed, ...rest } = config;
      await writeConfigFile(rest);
    } else {
      await writeConfigFile(config);
    }
    cachedStoredKeys[provider] = null;
    return;
  }

  const nextConfig: RawConfig = { ...config, [CONFIG_KEY_MAP[provider]]: normalized };
  await writeConfigFile(nextConfig);
  cachedStoredKeys[provider] = normalized;
}

export async function getStoredOpenAiApiKey(): Promise<string | null> {
  return getStoredApiKey('openai');
}

export async function setStoredOpenAiApiKey(apiKey: string): Promise<void> {
  await persistStoredApiKey('openai', apiKey);
}

export async function deleteStoredOpenAiApiKey(): Promise<void> {
  await persistStoredApiKey('openai', null);
}

export async function getStoredGeminiApiKey(): Promise<string | null> {
  return getStoredApiKey('gemini');
}

export async function setStoredGeminiApiKey(apiKey: string): Promise<void> {
  await persistStoredApiKey('gemini', apiKey);
}

export async function deleteStoredGeminiApiKey(): Promise<void> {
  await persistStoredApiKey('gemini', null);
}

export async function getEffectiveApiKey(provider: ProviderKey): Promise<string | null> {
  const envValue = getEnvKey(provider);
  if (envValue) {
    return envValue;
  }
  return getStoredApiKey(provider);
}

export async function getEffectiveOpenAiApiKey(): Promise<string | null> {
  return getEffectiveApiKey('openai');
}

export async function getEffectiveGeminiApiKey(): Promise<string | null> {
  return getEffectiveApiKey('gemini');
}

export async function hasOpenAiApiKeyConfigured(): Promise<boolean> {
  if (getEnvKey('openai')) {
    return true;
  }
  const stored = await getStoredOpenAiApiKey();
  return !!stored;
}

export async function hasGeminiApiKeyConfigured(): Promise<boolean> {
  if (getEnvKey('gemini')) {
    return true;
  }
  const stored = await getStoredGeminiApiKey();
  return !!stored;
}

function toProviderStatus(provider: ProviderKey, source: LlmKeySource, hasStoredKey: boolean): LlmProviderStatus {
  return {
    provider,
    hasKey: source !== 'none',
    hasStoredKey,
    source,
  };
}

async function buildProviderStatus(provider: ProviderKey): Promise<LlmProviderStatus> {
  const envValue = getEnvKey(provider);
  if (envValue) {
    const stored = await getStoredApiKey(provider);
    return toProviderStatus(provider, 'env', Boolean(stored));
  }

  const stored = await getStoredApiKey(provider);
  if (stored) {
    return toProviderStatus(provider, 'stored', true);
  }

  return toProviderStatus(provider, 'none', false);
}

export async function getOpenAiProviderStatus(): Promise<LlmProviderStatus> {
  return buildProviderStatus('openai');
}

export async function getGeminiProviderStatus(): Promise<LlmProviderStatus> {
  return buildProviderStatus('gemini');
}

async function resolveDefaultProvider(): Promise<LlmProvider> {
  if (await hasOpenAiApiKeyConfigured()) {
    return 'openai';
  }
  if (await hasGeminiApiKeyConfigured()) {
    return 'gemini';
  }
  return 'none';
}

export async function getActiveLlmProvider(): Promise<LlmProvider> {
  const config = await readConfigFile();
  const configured = normalizeProvider(config[ACTIVE_PROVIDER_KEY]);
  if (configured) {
    return configured;
  }
  return resolveDefaultProvider();
}

export async function setActiveLlmProvider(provider: LlmProvider): Promise<void> {
  const config = await readConfigFile();
  const nextConfig: RawConfig = { ...config };
  if (provider === 'openai' || provider === 'gemini' || provider === 'none') {
    nextConfig[ACTIVE_PROVIDER_KEY] = provider;
  } else {
    delete nextConfig[ACTIVE_PROVIDER_KEY];
  }
  await writeConfigFile(nextConfig);
}

export async function getActiveProviderApiKey(): Promise<{ provider: Exclude<LlmProvider, 'none'>; apiKey: string } | null> {
  const active = await getActiveLlmProvider();
  if (active === 'none') {
    return null;
  }

  const apiKey = await getEffectiveApiKey(active);
  if (!apiKey) {
    return null;
  }

  return { provider: active, apiKey };
}

export async function getLlmSettingsStatus(): Promise<LlmSettingsStatus> {
  const [openai, gemini, activeProvider] = await Promise.all([
    getOpenAiProviderStatus(),
    getGeminiProviderStatus(),
    getActiveLlmProvider(),
  ]);

  return {
    openai,
    gemini,
    activeProvider,
  };
}

export async function refreshActiveProviderFallback(): Promise<void> {
  const active = await getActiveLlmProvider();

  if (active === 'openai') {
    const key = await getEffectiveOpenAiApiKey();
    if (key) {
      return;
    }
  } else if (active === 'gemini') {
    const key = await getEffectiveGeminiApiKey();
    if (key) {
      return;
    }
  }

  const fallback = await resolveDefaultProvider();
  await setActiveLlmProvider(fallback);
}

export async function clearCachedLlmKeys(): Promise<void> {
  cachedStoredKeys = {};
}
