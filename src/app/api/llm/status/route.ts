import { NextResponse } from 'next/server';
import { hasOpenAiApiKeyConfigured } from '@/lib/server/openaiKeyStore';

export async function GET() {
  const hasOpenAiApiKey = await hasOpenAiApiKeyConfigured();

  return NextResponse.json({
    hasOpenAiApiKey,
  });
}
