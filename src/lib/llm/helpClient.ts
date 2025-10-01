import type { HelpMessageRole } from '@/types';

export interface HelpApiMessage {
  role: HelpMessageRole;
  content: string;
}

export interface HelpApiRequest {
  query: string;
  documentId: string;
  knowledgeBaseUrl: string;
  context?: string | null;
  history?: HelpApiMessage[];
  maskedFiles?: { path: string; reason: string }[];
}

export interface HelpApiUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface HelpApiResponse {
  answer: string;
  documentId: string;
  knowledgeBaseUrl: string;
  usage?: HelpApiUsage | null;
}

export async function requestHelp(payload: HelpApiRequest): Promise<HelpApiResponse> {
  const response = await fetch('/api/llm/help', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `ヘルプへの問い合わせに失敗しました。（${response.status}）`;
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore parsing errors
    }
    throw new Error(message);
  }

  const data = await response.json();

  return {
    answer: typeof data?.answer === 'string' ? data.answer : '',
    documentId: typeof data?.documentId === 'string' ? data.documentId : payload.documentId,
    knowledgeBaseUrl:
      typeof data?.knowledgeBaseUrl === 'string' ? data.knowledgeBaseUrl : payload.knowledgeBaseUrl,
    usage: data?.usage ?? null,
  };
}
