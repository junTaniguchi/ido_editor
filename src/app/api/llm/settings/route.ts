import { NextResponse } from 'next/server';

import { getLlmSettingsStatus, setActiveLlmProvider } from '@/lib/server/llmSettingsStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface UpdateSettingsBody {
  activeProvider?: unknown;
}

function normalizeProvider(value: unknown) {
  if (value === 'openai' || value === 'gemini' || value === 'none') {
    return value;
  }
  return null;
}

export async function GET() {
  const settings = await getLlmSettingsStatus();
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  try {
    const body: UpdateSettingsBody = await request.json();
    const provider = normalizeProvider(body.activeProvider);

    if (!provider) {
      return NextResponse.json(
        { error: 'activeProvider には openai / gemini / none のいずれかを指定してください。' },
        { status: 400 },
      );
    }

    await setActiveLlmProvider(provider);
    const settings = await getLlmSettingsStatus();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Failed to update LLM settings:', error);
    return NextResponse.json({ error: 'AI設定の更新に失敗しました。' }, { status: 500 });
  }
}
