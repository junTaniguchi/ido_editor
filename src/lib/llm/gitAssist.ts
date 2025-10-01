import type { GitAssistApiResponse, GitAssistIntent, GitAssistRequestPayload } from '@/types/git';

const VALID_INTENTS: GitAssistIntent[] = ['commit-summary', 'review-comments'];

function normalizeIntent(value: unknown, fallback: GitAssistIntent): GitAssistIntent {
  if (typeof value === 'string') {
    const trimmed = value.trim() as GitAssistIntent;
    if (VALID_INTENTS.includes(trimmed)) {
      return trimmed;
    }
  }
  return fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item): item is string => item.length > 0);
  return normalized.length > 0 ? normalized : undefined;
}

export async function requestGitAssist(payload: GitAssistRequestPayload): Promise<GitAssistApiResponse> {
  const response = await fetch('/api/llm/git-assist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Gitアシストの呼び出しに失敗しました。（${response.status}）`;
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  const intent = normalizeIntent(data?.intent, payload.intent);
  const commitMessage = normalizeOptionalString(data?.commitMessage);
  const summary = normalizeStringArray(data?.summary);
  const reviewComments = normalizeStringArray(data?.reviewComments);
  const warnings = normalizeStringArray(data?.warnings);

  const result: GitAssistApiResponse = {
    intent,
  };

  if (commitMessage) {
    result.commitMessage = commitMessage;
  }
  if (summary) {
    result.summary = summary;
  }
  if (reviewComments) {
    result.reviewComments = reviewComments;
  }
  if (warnings) {
    result.warnings = warnings;
  }

  return result;
}
