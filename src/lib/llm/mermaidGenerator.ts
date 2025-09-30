import type { MermaidDiagramType } from '@/lib/mermaid/types';
import type { ChatCompletionMessage } from './workflowPrompt';

export interface MermaidGenerationRequest {
  prompt: string;
  diagramType: MermaidDiagramType;
  existingCode?: string;
}

export interface MermaidGenerationResponse {
  diagramType: MermaidDiagramType;
  mermaidCode: string;
  summary?: string;
}

interface MermaidModelPayload {
  diagramType: MermaidDiagramType;
  description: string;
  existingCode?: string;
}

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

const MERMAID_SYSTEM_PROMPT = [
  'You are a senior technical writer who translates requirements into valid Mermaid diagrams.',
  'Always return JSON with the following keys: diagramType (string), mermaid (string), and summary (string).',
  'The "mermaid" value must contain only the Mermaid source code for the requested diagram and must be valid for Mermaid v11.',
  'Keep the summary concise (max 120 characters) and written in Japanese.',
  'If existing code is provided, update or extend it instead of ignoring it.',
].join('\n');

function buildUserContent(payload: MermaidModelPayload): string {
  const lines = [
    `Mermaid diagram type: ${payload.diagramType}`,
    'Natural language description:',
    payload.description.trim(),
  ];

  if (payload.existingCode) {
    lines.push('\nExisting Mermaid code to refine:');
    lines.push('```mermaid');
    lines.push(payload.existingCode.trim());
    lines.push('```');
  }

  lines.push('\nConstraints:');
  lines.push('- Produce a single JSON object with keys diagramType, mermaid, summary.');
  lines.push('- The mermaid field must be valid Mermaid syntax without markdown fences.');
  lines.push('- Align with the requested diagram type and keep node names readable.');

  return lines.join('\n');
}

export function buildMermaidGenerationMessages(payload: MermaidGenerationRequest): ChatCompletionMessage[] {
  return [
    { role: 'system', content: MERMAID_SYSTEM_PROMPT },
    {
      role: 'user',
      content: buildUserContent({
        diagramType: payload.diagramType,
        description: payload.prompt,
        existingCode: payload.existingCode,
      }),
    },
  ];
}

function extractJsonFromResponse(raw: string): any {
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    throw new Error('モデル応答が空でした。');
  }

  const jsonFence = trimmed.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence && jsonFence[1]) {
    try {
      return JSON.parse(jsonFence[1]);
    } catch (error) {
      throw new Error('モデル応答(JSON)の解析に失敗しました。');
    }
  }

  const genericFence = trimmed.match(/```[a-z]*\s*([\s\S]*?)```/i);
  if (genericFence && genericFence[1]) {
    try {
      return JSON.parse(genericFence[1]);
    } catch (error) {
      throw new Error('モデル応答(JSON)の解析に失敗しました。');
    }
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error('モデル応答(JSON)の解析に失敗しました。');
  }
}

function normalizeDiagramType(value: unknown, fallback: MermaidDiagramType): MermaidDiagramType {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim() as MermaidDiagramType;
  return normalized || fallback;
}

function parseMermaidModelResponse(
  payload: MermaidGenerationRequest,
  rawContent: string,
): MermaidGenerationResponse {
  const data = extractJsonFromResponse(rawContent);
  const mermaidCode = typeof data?.mermaid === 'string' ? data.mermaid.trim() : '';
  if (!mermaidCode) {
    throw new Error('AI生成の結果からMermaidコードを取得できませんでした。');
  }

  const diagramType = normalizeDiagramType(data?.diagramType, payload.diagramType);
  const summary = typeof data?.summary === 'string' ? data.summary.trim() : undefined;

  return {
    diagramType,
    mermaidCode,
    summary,
  };
}

export async function callMermaidGenerationModel(
  apiKey: string,
  payload: MermaidGenerationRequest,
): Promise<MermaidGenerationResponse> {
  const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      messages: buildMermaidGenerationMessages(payload),
    }),
  });

  if (!response.ok) {
    let message = 'Mermaidコードの生成に失敗しました。';
    try {
      const errorPayload = await response.json();
      message = errorPayload?.error?.message || message;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  return parseMermaidModelResponse(payload, content);
}

export async function requestMermaidGeneration(
  payload: MermaidGenerationRequest,
): Promise<MermaidGenerationResponse> {
  const response = await fetch('/api/llm/mermaid', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `Mermaidコードの生成に失敗しました。（${response.status}）`;
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  const diagramType = normalizeDiagramType(data?.diagramType, payload.diagramType);
  const mermaidCode = typeof data?.mermaid === 'string' ? data.mermaid : '';
  const summary = typeof data?.summary === 'string' ? data.summary : undefined;

  if (!mermaidCode) {
    throw new Error('AI生成されたMermaidコードが空でした。');
  }

  return {
    diagramType,
    mermaidCode,
    summary,
  };
}
