import { NextResponse } from 'next/server';

export async function GET() {
  const hasOpenAiApiKey =
    typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.trim().length > 0;

  return NextResponse.json({
    hasOpenAiApiKey,
  });
}
