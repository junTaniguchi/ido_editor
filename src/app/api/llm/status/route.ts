import { NextResponse } from 'next/server';
import { getOpenAiApiKeyStatus } from '@/lib/server/openaiKeyStore';

export async function GET() {
  const status = await getOpenAiApiKeyStatus();

  return NextResponse.json({
    hasOpenAiApiKey: status.hasKey,
    source: status.source,
    hasStoredKey: status.hasStoredKey,
  });
}
