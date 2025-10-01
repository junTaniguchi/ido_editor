import { NextResponse } from 'next/server';
import {
  deleteStoredOpenAiApiKey,
  getOpenAiApiKeyStatus,
  setStoredOpenAiApiKey,
} from '@/lib/server/openaiKeyStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface OpenAiKeyRequestBody {
  apiKey?: unknown;
}

function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export async function GET() {
  const status = await getOpenAiApiKeyStatus();

  return NextResponse.json(status);
}

export async function POST(request: Request) {
  try {
    const body: OpenAiKeyRequestBody = await request.json();
    const apiKey = normalizeApiKey(body.apiKey);

    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーを入力してください。' }, { status: 400 });
    }

    await setStoredOpenAiApiKey(apiKey);

    const status = await getOpenAiApiKeyStatus();

    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Failed to persist OpenAI API key:', error);
    return NextResponse.json({ error: 'APIキーの保存に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteStoredOpenAiApiKey();
    const status = await getOpenAiApiKeyStatus();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    console.error('Failed to delete OpenAI API key:', error);
    return NextResponse.json({ error: 'APIキーの削除に失敗しました。' }, { status: 500 });
  }
}
