import { NextResponse } from 'next/server';

import {
  deleteStoredGeminiApiKey,
  getActiveLlmProvider,
  getLlmSettingsStatus,
  refreshActiveProviderFallback,
  setActiveLlmProvider,
  setStoredGeminiApiKey,
} from '@/lib/server/llmSettingsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface GeminiKeyRequestBody {
  apiKey?: unknown;
}

function normalizeApiKey(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

export async function POST(request: Request) {
  try {
    const body: GeminiKeyRequestBody = await request.json();
    const apiKey = normalizeApiKey(body.apiKey);

    if (!apiKey) {
      return NextResponse.json({ error: 'APIキーを入力してください。' }, { status: 400 });
    }

    await setStoredGeminiApiKey(apiKey);

    const activeProvider = await getActiveLlmProvider();
    if (activeProvider === 'none') {
      await setActiveLlmProvider('gemini');
    }

    const settings = await getLlmSettingsStatus();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Failed to persist Gemini API key:', error);
    return NextResponse.json({ error: 'APIキーの保存に失敗しました。' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await deleteStoredGeminiApiKey();
    await refreshActiveProviderFallback();
    const settings = await getLlmSettingsStatus();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Failed to delete Gemini API key:', error);
    return NextResponse.json({ error: 'APIキーの削除に失敗しました。' }, { status: 500 });
  }
}
