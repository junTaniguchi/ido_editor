import { NextResponse } from 'next/server';
import {
  AnalysisSummary,
  buildReportMessages,
  parseReportResponse,
  reportResponseJsonSchema,
} from '@/lib/llm/analysisSummarizer';

class ReportApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ReportApiError';
    this.status = status;
  }
}

interface ReportApiRequestBody {
  summary?: AnalysisSummary;
  customInstruction?: string;
}

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

async function callChatCompletion(
  apiKey: string,
  summary: AnalysisSummary,
  customInstruction?: string,
) {
  const messages = buildReportMessages(summary, customInstruction);

  const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: {
        type: 'json_schema',
        json_schema: reportResponseJsonSchema,
      },
      messages,
    }),
  });

  if (!response.ok) {
    let message = 'ChatGPT APIの呼び出しに失敗しました。';
    try {
      const errorPayload = await response.json();
      message = errorPayload?.error?.message || message;
    } catch {
      // ignore
    }

    throw new ReportApiError(
      message,
      response.status >= 400 && response.status < 500 ? response.status : 502,
    );
  }

  const data = await response.json();
  const content: unknown = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  const parsed = JSON.parse(content);
  return parseReportResponse(parsed);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const body: ReportApiRequestBody = await request.json();
    if (!body.summary) {
      return NextResponse.json({ error: 'summary が必要です。' }, { status: 400 });
    }

    const report = await callChatCompletion(apiKey, body.summary, body.customInstruction);

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report API error:', error);
    const message = error instanceof Error ? error.message : 'レポート生成中にエラーが発生しました。';
    const status = error instanceof ReportApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
