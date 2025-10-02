import { NextResponse } from 'next/server';

import { diagramDefinitions } from '@/lib/mermaid/diagramDefinitions';
import type { MermaidDiagramType } from '@/lib/mermaid/types';
import { callMermaidGenerationModel } from '@/lib/llm/mermaidGenerator';
import { getActiveProviderApiKey } from '@/lib/server/llmSettingsStore';
import { LlmProviderError } from '@/lib/server/llmProviderClient';

interface MermaidApiRequestBody {
  prompt?: unknown;
  diagramType?: unknown;
  existingCode?: unknown;
}

const DIAGRAM_TYPES = new Set(Object.keys(diagramDefinitions) as MermaidDiagramType[]);

function normalizePrompt(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeDiagramType(value: unknown): MermaidDiagramType {
  if (typeof value !== 'string') {
    return 'flowchart';
  }
  const trimmed = value.trim() as MermaidDiagramType;
  return DIAGRAM_TYPES.has(trimmed) ? trimmed : 'flowchart';
}

function normalizeExistingCode(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: Request) {
  try {
    const providerConfig = await getActiveProviderApiKey();
    if (!providerConfig) {
      return NextResponse.json({ error: 'AIプロバイダーのAPIキーが設定されていません。設定画面から登録してください。' }, { status: 500 });
    }

    const body: MermaidApiRequestBody = await request.json();
    const prompt = normalizePrompt(body.prompt);
    if (!prompt) {
      return NextResponse.json({ error: '自然言語で説明を入力してください。' }, { status: 400 });
    }

    const diagramType = normalizeDiagramType(body.diagramType);
    const existingCode = normalizeExistingCode(body.existingCode);

    const result = await callMermaidGenerationModel(providerConfig.provider, providerConfig.apiKey, {
      prompt,
      diagramType,
      existingCode,
    });

    return NextResponse.json({
      diagramType: result.diagramType,
      mermaid: result.mermaidCode,
      summary: result.summary ?? null,
    });
  } catch (error) {
    console.error('Mermaid generation API error:', error);
    if (error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Mermaidコードの生成中にエラーが発生しました。';
    const status = /APIキー/.test(message) ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
