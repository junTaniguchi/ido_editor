import { NextResponse } from 'next/server';

import { callLlmModel, LlmProviderError } from '@/lib/server/llmProviderClient';
import { getActiveProviderApiKey } from '@/lib/server/llmSettingsStore';
import type { ChatCompletionMessage } from '@/lib/llm/workflowPrompt';

interface MindmapExpansionRequestBody {
  nodeLabel?: unknown;
  ancestorPath?: unknown;
  existingChildren?: unknown;
  instruction?: unknown;
}

interface MindmapExpansionIdea {
  label: string;
  description?: string;
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .map((item) => item.replace(/\s+/g, ' '))
    .filter((item) => item.length > 0);
}

function normalizeInstruction(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function buildMessages(payload: {
  nodeLabel: string;
  ancestorPath: string[];
  existingChildren: string[];
  instruction?: string;
}): ChatCompletionMessage[] {
  const ancestorText = payload.ancestorPath.length > 0 ? payload.ancestorPath.join(' ＞ ') : '（なし）';
  const childrenText = payload.existingChildren.length > 0
    ? payload.existingChildren.map((label) => `- ${label}`).join('\n')
    : '（まだありません）';

  const instructionText = payload.instruction
    ? `ユーザーからの追加指示:\n${payload.instruction}\n\n`
    : '';

  const systemPrompt =
    'あなたは日本語でマインドマップのブレインストーミングを支援するアシスタントです。' +
    '与えられたテーマを深掘りし、重複を避けながら具体的で実践的な子トピックを提案してください。' +
    '各トピックは20文字以内の簡潔な見出しとし、必要に応じて短い補足説明（30文字以内）を付けても構いません。' +
    '出力は必ずJSONのみで、余計な文章を含めないでください。';

  const userPrompt =
    `対象ノード: ${payload.nodeLabel || '（ラベル未設定）'}\n` +
    `上位の流れ: ${ancestorText}\n` +
    `既存の子ノード:\n${childrenText}\n\n` +
    instructionText +
    'マインドマップの子ノードとして3〜5件の新しいアイデアを提案してください。' +
    '必ず重複を避け、多角的な視点になるよう工夫してください。' +
    '\n\n出力フォーマットの例:\n' +
    '{"ideas": [{"label": "課題整理", "description": "現状の問題を洗い出す"}]}\n' +
    'descriptionは任意項目です。labelのみでも構いません。';

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

function extractIdeas(raw: string): MindmapExpansionIdea[] {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new Error('AIからの応答が空でした。');
  }

  const fenceMatch = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  const jsonText = fenceMatch ? fenceMatch[1] : trimmed;

  let data: any;
  try {
    data = JSON.parse(jsonText);
  } catch (error) {
    throw new Error('AIからの応答を解析できませんでした。');
  }

  const rawIdeas: any[] = Array.isArray(data?.ideas)
    ? data.ideas
    : Array.isArray(data)
      ? data
      : Array.isArray(data?.children)
        ? data.children
        : [];

  const seen = new Set<string>();
  const ideas: MindmapExpansionIdea[] = [];

  rawIdeas.forEach((item) => {
    let label: string | undefined;
    let description: string | undefined;

    if (item && typeof item === 'object') {
      if (typeof item.label === 'string') {
        label = item.label.trim();
      } else if (typeof item.title === 'string') {
        label = item.title.trim();
      }
      if (typeof item.description === 'string') {
        description = item.description.trim();
      }
    } else if (typeof item === 'string') {
      label = item.trim();
    }

    if (!label) {
      return;
    }

    const normalized = label.replace(/\s+/g, ' ').slice(0, 60);
    if (normalized.length === 0 || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);

    const normalizedDescription = description ? description.replace(/\s+/g, ' ').slice(0, 80) : undefined;
    ideas.push({ label: normalized, description: normalizedDescription });
  });

  if (ideas.length === 0) {
    throw new Error('AIから有効な子ノード案が返されませんでした。');
  }

  return ideas.slice(0, 5);
}

export async function POST(request: Request) {
  try {
    const providerConfig = await getActiveProviderApiKey();
    if (!providerConfig) {
      return NextResponse.json({ error: 'AIプロバイダーのAPIキーが設定されていません。設定画面から登録してください。' }, { status: 500 });
    }

    const body: MindmapExpansionRequestBody = await request.json();
    const nodeLabel = normalizeLabel(body.nodeLabel);
    if (!nodeLabel) {
      return NextResponse.json({ error: '対象のノード名が空です。まずノード名を入力してください。' }, { status: 400 });
    }

    const ancestorPath = normalizeStringArray(body.ancestorPath);
    const existingChildren = normalizeStringArray(body.existingChildren);
    const instruction = normalizeInstruction(body.instruction);

    const messages = buildMessages({
      nodeLabel,
      ancestorPath,
      existingChildren,
      instruction,
    });

    const response = await callLlmModel({
      provider: providerConfig.provider,
      apiKey: providerConfig.apiKey,
      messages,
      temperature: 0.7,
    });

    const ideas = extractIdeas(response.content);

    return NextResponse.json({ children: ideas });
  } catch (error) {
    console.error('Mindmap AI expansion error:', error);
    if (error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'マインドマップのAI詳細化に失敗しました。';
    const status = /APIキー/.test(message) ? 500 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
