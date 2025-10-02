export type OpenAiQuotaIssueReason =
  | 'insufficient_quota'
  | 'invalid_key'
  | 'network_error'
  | 'unexpected_response';

export interface OpenAiQuotaCheckResult {
  ok: boolean;
  reason?: OpenAiQuotaIssueReason;
  message?: string;
  detail?: string;
}

const QUOTA_ERROR_KEYWORDS = ['you exceeded your current quota', 'insufficient_quota'];

const QUOTA_WARNING_MESSAGE =
  'OpenAIの利用枠（クォータ）が不足しています。OpenAIのダッシュボードで請求設定や利用状況を確認してください。';

const INVALID_KEY_MESSAGE = 'OpenAI APIキーが無効か、アクセスが許可されていません。';

const NETWORK_ERROR_MESSAGE = 'OpenAI APIキーの検証中にエラーが発生しました。時間をおいて再度お試しください。';

const REQUEST_TIMEOUT_MS = 10_000;

async function readErrorPayload(response: Response): Promise<any | null> {
  const contentType = response.headers.get('content-type');
  if (!contentType || !contentType.includes('application/json')) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isQuotaErrorMessage(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  const normalized = message.toLowerCase();
  return QUOTA_ERROR_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export async function checkOpenAiQuota(apiKey: string): Promise<OpenAiQuotaCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });

    if (response.ok) {
      return { ok: true };
    }

    const errorPayload = await readErrorPayload(response);
    const errorMessage = errorPayload?.error?.message;

    if (response.status === 429 || isQuotaErrorMessage(errorMessage)) {
      return {
        ok: false,
        reason: 'insufficient_quota',
        message: QUOTA_WARNING_MESSAGE,
        detail: typeof errorMessage === 'string' ? errorMessage : undefined,
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: 'invalid_key',
        message: INVALID_KEY_MESSAGE,
        detail: typeof errorMessage === 'string' ? errorMessage : undefined,
      };
    }

    return {
      ok: false,
      reason: 'unexpected_response',
      message: NETWORK_ERROR_MESSAGE,
      detail: typeof errorMessage === 'string' ? errorMessage : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : undefined;
    return {
      ok: false,
      reason: 'network_error',
      message: NETWORK_ERROR_MESSAGE,
      detail: message,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
