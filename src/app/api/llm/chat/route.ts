import { NextResponse } from 'next/server';
import { callPairWritingModel, DEFAULT_TRANSLATION_TARGET } from '@/lib/llm/chatClient';
import { getEffectiveOpenAiApiKey } from '@/lib/server/openaiKeyStore';
import type { PairWritingPurpose } from '@/types';

interface ChatApiRequestBody {
  purpose?: unknown;
  text?: unknown;
  targetLanguage?: unknown;
  rewriteInstruction?: unknown;
}

function normalizePurpose(value: unknown): PairWritingPurpose | null {
  if (value === 'translate' || value === 'rewrite') {
    return value;
  }
  return null;
}

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeTargetLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeInstruction(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  try {
    const apiKey = await getEffectiveOpenAiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const body: ChatApiRequestBody = await request.json();
    const purpose = normalizePurpose(body.purpose);
    if (!purpose) {
      return NextResponse.json({ error: 'purpose には translate または rewrite を指定してください。' }, { status: 400 });
    }

    const text = normalizeText(body.text);
    if (!text) {
      return NextResponse.json({ error: 'テキストを入力してください。' }, { status: 400 });
    }

    const targetLanguage = purpose === 'translate'
      ? normalizeTargetLanguage(body.targetLanguage) ?? DEFAULT_TRANSLATION_TARGET
      : undefined;
    const rewriteInstruction = purpose === 'rewrite'
      ? normalizeInstruction(body.rewriteInstruction)
      : undefined;

    const response = await callPairWritingModel(apiKey, {
      purpose,
      text,
      targetLanguage,
      rewriteInstruction,
    });

    return NextResponse.json({
      purpose: response.purpose,
      output: response.output,
      targetLanguage: response.targetLanguage ?? targetLanguage ?? null,
      rewriteInstruction: response.rewriteInstruction ?? rewriteInstruction ?? null,
      usage: response.usage ?? null,
    });
  } catch (error) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'テキスト処理中にエラーが発生しました。';
    const status = /OPENAI_API_KEY/.test(message) ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
