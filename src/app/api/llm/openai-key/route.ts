import { NextResponse } from 'next/server';
import {
  deleteStoredOpenAiApiKey,
  getStoredOpenAiApiKey,
  hasOpenAiApiKeyConfigured,
  setStoredOpenAiApiKey,
} from '@/lib/server/openaiKeyStore';

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
  const hasKey = await hasOpenAiApiKeyConfigured();
  const storedKey = await getStoredOpenAiApiKey();
  const source: 'env' | 'stored' | 'none' = hasKey
    ? storedKey
      ? 'stored'
      : 'env'
    : 'none';

  return NextResponse.json({
    hasKey,
    source,
  });
}

export async function POST(request: Request) {
  try {
    const body: OpenAiKeyRequestBody = await request.json();
    const apiKey = normalizeApiKey(body.apiKey);

    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーを入力してください。' }, { status: 400 });
    }

    await setStoredOpenAiApiKey(apiKey);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to persist OpenAI API key:', error);
    return NextResponse.json({ error: 'APIキーの保存に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteStoredOpenAiApiKey();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete OpenAI API key:', error);
    return NextResponse.json({ error: 'APIキーの削除に失敗しました。' }, { status: 500 });
  }
}
