export type LlmKeySource = 'env' | 'stored' | 'none';

export interface LlmKeyStatus {
  hasKey: boolean;
  hasStoredKey: boolean;
  source: LlmKeySource;
}

function parseStatus(payload: any): LlmKeyStatus {
  const source = payload?.source;
  const normalizedSource: LlmKeySource = source === 'env' || source === 'stored' ? source : 'none';
  const hasStoredKey = Boolean(payload?.hasStoredKey);
  const hasKey = typeof payload?.hasKey === 'boolean' ? payload.hasKey : normalizedSource !== 'none';

  return {
    hasKey,
    hasStoredKey,
    source: normalizedSource,
  };
}

export async function fetchLlmKeyStatus(): Promise<LlmKeyStatus> {
  const response = await fetch('/api/llm/openai-key', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('OpenAI APIキーの状態取得に失敗しました。');
  }

  const data = await response.json();
  return parseStatus(data);
}

export async function saveLlmKey(apiKey: string): Promise<LlmKeyStatus> {
  const response = await fetch('/api/llm/openai-key', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ apiKey }),
  });

  if (!response.ok) {
    let message = 'OpenAI APIキーの保存に失敗しました。';
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('OpenAI APIキーの状態を取得できませんでした。');
  }

  return parseStatus(data.status ?? data);
}

export async function deleteLlmKey(): Promise<LlmKeyStatus> {
  const response = await fetch('/api/llm/openai-key', {
    method: 'DELETE',
  });

  if (!response.ok) {
    let message = 'OpenAI APIキーの削除に失敗しました。';
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('OpenAI APIキーの状態を取得できませんでした。');
  }

  return parseStatus(data.status ?? data);
}
