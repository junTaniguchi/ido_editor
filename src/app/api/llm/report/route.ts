import { NextResponse } from 'next/server';

import {
  AnalysisSummary,
  buildReportMessages,
  parseReportResponse,
  reportResponseJsonSchema,
} from '@/lib/llm/analysisSummarizer';
import { callLlmModel, LlmProviderError } from '@/lib/server/llmProviderClient';
import { getActiveProviderApiKey } from '@/lib/server/llmSettingsStore';

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

const DEFAULT_MODEL = 'gpt-4o-mini';
const GEMINI_REPORT_MODEL = process.env.GEMINI_REPORT_MODEL || process.env.GEMINI_CHAT_MODEL;

async function callChatCompletion(
  provider: 'openai' | 'gemini',
  apiKey: string,
  summary: AnalysisSummary,
  customInstruction?: string,
) {
  const messages = buildReportMessages(summary, customInstruction);

  const result = await callLlmModel({
    provider,
    apiKey,
    messages,
    temperature: 0.2,
    ...(provider === 'openai'
      ? { model: DEFAULT_MODEL, responseFormat: { type: 'json_schema', json_schema: reportResponseJsonSchema } }
      : { model: GEMINI_REPORT_MODEL, responseMimeType: 'application/json' }),
  });

  const content = result.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  const parsed = JSON.parse(content);
  return parseReportResponse(parsed);
}

export async function POST(request: Request) {
  try {
    const providerConfig = await getActiveProviderApiKey();
    if (!providerConfig) {
      return NextResponse.json({ error: 'AIプロバイダーのAPIキーが設定されていません。設定画面から登録してください。' }, { status: 500 });
    }

    const body: ReportApiRequestBody = await request.json();
    if (!body.summary) {
      return NextResponse.json({ error: 'summary が必要です。' }, { status: 400 });
    }

    const report = await callChatCompletion(
      providerConfig.provider,
      providerConfig.apiKey,
      body.summary,
      body.customInstruction,
    );

    return NextResponse.json(report);
  } catch (error) {
    console.error('Report API error:', error);
    if (error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'レポート生成中にエラーが発生しました。';
    const status = error instanceof ReportApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
