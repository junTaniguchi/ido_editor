import { NextResponse } from 'next/server';
import type { HelpMessageRole } from '@/types';
import { getEffectiveOpenAiApiKey } from '@/lib/server/openaiKeyStore';

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_HELP_MODEL = process.env.OPENAI_HELP_MODEL || 'gpt-4o-mini';
const HELP_TEMPERATURE = 0.2;

type ChatCompletionMessage = { role: 'system' | 'user' | 'assistant'; content: string };

type NormalizedHistoryItem = { role: HelpMessageRole; content: string };

interface HelpRequestBody {
  query?: unknown;
  documentId?: unknown;
  knowledgeBaseUrl?: unknown;
  context?: unknown;
  history?: unknown;
  maskedFiles?: unknown;
}

function normalizeString(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeHistory(value: unknown): NormalizedHistoryItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const role = (item as { role?: unknown }).role;
      const content = (item as { content?: unknown }).content;
      if ((role === 'user' || role === 'assistant') && typeof content === 'string' && content.trim().length > 0) {
        return { role, content: content.trim() } as NormalizedHistoryItem;
      }
      return null;
    })
    .filter((item): item is NormalizedHistoryItem => Boolean(item));
}

function buildMessages(params: {
  query: string;
  documentId: string;
  knowledgeBaseUrl: string;
  context?: string | null;
  history: NormalizedHistoryItem[];
  maskedFiles?: { path?: unknown; reason?: unknown }[];
}): ChatCompletionMessage[] {
  const { query, documentId, knowledgeBaseUrl, context, history, maskedFiles } = params;

  const maskedSummary = Array.isArray(maskedFiles)
    ? maskedFiles
        .map((item) => {
          const path = typeof item?.path === 'string' ? item.path : 'unknown';
          const reason = typeof item?.reason === 'string' ? item.reason : 'マスク済み';
          return `- ${path}: ${reason}`;
        })
        .join('\n')
    : '';

  const userSegments = [
    '次の質問にMyGPTナレッジベースを参照して回答してください。',
    `質問: ${query}`,
    `ドキュメントID: ${documentId}`,
    `ナレッジベースURL: ${knowledgeBaseUrl}`,
  ];

  if (context && context.trim().length > 0) {
    userSegments.push('---');
    userSegments.push('追加コンテキスト:');
    userSegments.push(context.trim());
  }

  if (maskedSummary) {
    userSegments.push('---');
    userSegments.push('マスクされたファイル:');
    userSegments.push(maskedSummary);
  }

  const messages: ChatCompletionMessage[] = [
    {
      role: 'system',
      content: [
        'あなたはDataLoom StudioのAIサポートアシスタントです。',
        '提供されたMyGPTナレッジベースの情報と補足コンテキストを活用して、実務的で簡潔な回答を日本語で作成してください。',
        '根拠となるドキュメントIDやURLが分かる場合は回答中に言及してください。',
        '不明な点があれば推測せず、その旨を伝えてください。',
      ].join('\n'),
    },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userSegments.join('\n') },
  ];

  return messages;
}

export async function POST(request: Request) {
  try {
    const apiKey = await getEffectiveOpenAiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const body: HelpRequestBody = await request.json();
    const query = normalizeString(body.query);
    const documentId = normalizeString(body.documentId);
    const knowledgeBaseUrl = normalizeString(body.knowledgeBaseUrl);
    const context = typeof body.context === 'string' ? body.context : null;
    const history = normalizeHistory(body.history);
    const maskedFiles = Array.isArray(body.maskedFiles) ? body.maskedFiles : undefined;

    if (!query) {
      return NextResponse.json({ error: '問い合わせ内容を入力してください。' }, { status: 400 });
    }
    if (!documentId) {
      return NextResponse.json({ error: 'ドキュメントIDを指定してください。' }, { status: 400 });
    }
    if (!knowledgeBaseUrl) {
      return NextResponse.json({ error: 'ナレッジベースのURLを指定してください。' }, { status: 400 });
    }

    const messages = buildMessages({
      query,
      documentId,
      knowledgeBaseUrl,
      context,
      history,
      maskedFiles,
    });

    const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEFAULT_HELP_MODEL,
        temperature: HELP_TEMPERATURE,
        messages,
      }),
    });

    if (!response.ok) {
      let message = 'ヘルプ応答の生成に失敗しました。';
      try {
        const errorPayload = await response.json();
        message = errorPayload?.error?.message || message;
      } catch {
        // ignore parse error
      }
      return NextResponse.json({ error: message }, { status: response.status });
    }

    const data = await response.json();
    const answer: string | undefined = data?.choices?.[0]?.message?.content;
    const usage = data?.usage
      ? {
          promptTokens: typeof data.usage.prompt_tokens === 'number' ? data.usage.prompt_tokens : undefined,
          completionTokens: typeof data.usage.completion_tokens === 'number' ? data.usage.completion_tokens : undefined,
          totalTokens: typeof data.usage.total_tokens === 'number' ? data.usage.total_tokens : undefined,
        }
      : null;

    if (!answer) {
      return NextResponse.json({ error: 'モデルから有効な応答を取得できませんでした。' }, { status: 502 });
    }

    return NextResponse.json({
      answer: answer.trim(),
      documentId,
      knowledgeBaseUrl,
      usage,
    });
  } catch (error) {
    console.error('Help API error:', error);
    const message = error instanceof Error ? error.message : 'ヘルプ処理中にエラーが発生しました。';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
