import type { LlmProvider, LlmProviderStatus, LlmQuotaStatus, LlmSettingsStatus } from '@/types/llm';

type ProviderKey = 'openai' | 'gemini';

function parseQuotaStatus(payload: any): LlmQuotaStatus | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const ok = typeof payload.ok === 'boolean' ? payload.ok : undefined;
  if (ok === undefined) {
    return undefined;
  }

  const reason =
    payload.reason === 'insufficient_quota' ||
    payload.reason === 'invalid_key' ||
    payload.reason === 'network_error' ||
    payload.reason === 'unexpected_response'
      ? payload.reason
      : undefined;

  return {
    ok,
    reason,
    message: typeof payload.message === 'string' ? payload.message : undefined,
    detail: typeof payload.detail === 'string' ? payload.detail : undefined,
  };
}

function parseProviderStatus(provider: ProviderKey, payload: any): LlmProviderStatus {
  const source = payload?.source === 'env' || payload?.source === 'stored' ? payload.source : 'none';
  const hasStoredKey = Boolean(payload?.hasStoredKey);
  const hasKey = typeof payload?.hasKey === 'boolean' ? payload.hasKey : source !== 'none';

  return {
    provider,
    hasKey,
    hasStoredKey,
    source,
    quota: parseQuotaStatus(payload?.quota),
  };
}

function parseSettings(payload: any): LlmSettingsStatus {
  if (!payload || typeof payload !== 'object') {
    throw new Error('AI設定の取得に失敗しました。');
  }

  const openai = parseProviderStatus('openai', (payload as any).openai ?? {});
  const gemini = parseProviderStatus('gemini', (payload as any).gemini ?? {});

  const activeProvider: LlmProvider =
    (payload as any).activeProvider === 'openai' ||
    (payload as any).activeProvider === 'gemini' ||
    (payload as any).activeProvider === 'none'
      ? (payload as any).activeProvider
      : 'none';

  return { openai, gemini, activeProvider };
}

async function handleResponse(response: Response): Promise<LlmSettingsStatus> {
  if (!response.ok) {
    let message = 'AI設定の更新に失敗しました。';
    try {
      const payload = await response.json();
      if (payload && typeof payload.error === 'string') {
        message = payload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  return parseSettings(data?.settings ?? data);
}

export async function fetchLlmSettings(): Promise<LlmSettingsStatus> {
  const response = await fetch('/api/llm/settings', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('AI設定の取得に失敗しました。');
  }

  const payload = await response.json();
  return parseSettings(payload?.settings ?? payload);
}

export async function saveLlmApiKey(provider: ProviderKey, apiKey: string): Promise<LlmSettingsStatus> {
  const response = await fetch(`/api/llm/${provider}-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });

  return handleResponse(response);
}

export async function deleteLlmApiKey(provider: ProviderKey): Promise<LlmSettingsStatus> {
  const response = await fetch(`/api/llm/${provider}-key`, {
    method: 'DELETE',
  });

  return handleResponse(response);
}

export async function updateActiveLlmProvider(provider: LlmProvider): Promise<LlmSettingsStatus> {
  const response = await fetch('/api/llm/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activeProvider: provider }),
  });

  return handleResponse(response);
}
