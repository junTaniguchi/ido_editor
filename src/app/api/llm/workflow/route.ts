import { NextResponse } from 'next/server';
import {
  buildWorkflowMessages,
  ensureWorkflowCellsAreSafe,
  parseWorkflowResponse,
  WorkflowGeneratedCell,
  WorkflowPromptInput,
} from '@/lib/llm/workflowPrompt';
import { getEffectiveOpenAiApiKey } from '@/lib/server/openaiKeyStore';

class WorkflowApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'WorkflowApiError';
    this.status = status;
  }
}

interface WorkflowApiRequestBody {
  request?: string;
  columns?: unknown;
  sampleRows?: unknown;
}

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_SAMPLE_ROWS = 5;
const MAX_COLUMNS = 50;

function normalizeColumns(columns: unknown): string[] {
  if (!Array.isArray(columns)) {
    return [];
  }

  return columns
    .filter((col): col is string => typeof col === 'string')
    .map((col) => col.trim())
    .filter((col) => col.length > 0)
    .slice(0, MAX_COLUMNS);
}

function normalizeSampleRows(sampleRows: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(sampleRows)) {
    return [];
  }

  return sampleRows.slice(0, MAX_SAMPLE_ROWS).map((row) => {
    if (!row || typeof row !== 'object') {
      return {} as Record<string, unknown>;
    }

    const entries = Object.entries(row as Record<string, unknown>).slice(0, 50).map(([key, value]) => {
      if (value === null || value === undefined) {
        return [key, value];
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return [key, value];
      }

      try {
        return [key, JSON.parse(JSON.stringify(value))];
      } catch {
        return [key, String(value)];
      }
    });

    return Object.fromEntries(entries);
  });
}

async function callChatCompletion(
  apiKey: string,
  input: WorkflowPromptInput,
): Promise<{ cells: WorkflowGeneratedCell[]; rationale?: string }> {
  const messages = buildWorkflowMessages(input);

  const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!response.ok) {
    let message = 'ChatGPT APIの呼び出しに失敗しました。';
    try {
      const errorPayload = await response.json();
      message = errorPayload?.error?.message || message;
    } catch {
      // ignore
    }
    throw new WorkflowApiError(message, response.status >= 400 && response.status < 500 ? response.status : 502);
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  try {
    const parsed = parseWorkflowResponse(content);
    const safeCells = ensureWorkflowCellsAreSafe(parsed.cells);
    return { cells: safeCells, rationale: parsed.rationale };
  } catch (error) {
    if (error instanceof Error && /安全ではありません/.test(error.message)) {
      throw new WorkflowApiError(error.message, 400);
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const apiKey = await getEffectiveOpenAiApiKey();
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const body: WorkflowApiRequestBody = await request.json();
    const userRequest = typeof body.request === 'string' ? body.request.trim() : '';

    if (!userRequest) {
      return NextResponse.json({ error: '自然言語リクエストを入力してください。' }, { status: 400 });
    }

    const columns = normalizeColumns(body.columns);
    const sampleRows = normalizeSampleRows(body.sampleRows);

    const promptInput: WorkflowPromptInput = {
      request: userRequest,
      columns,
      sampleRows,
    };

    const { cells, rationale } = await callChatCompletion(apiKey, promptInput);

    return NextResponse.json({ cells, rationale: rationale ?? null });
  } catch (error) {
    console.error('Workflow API error:', error);
    const message = error instanceof Error ? error.message : 'ワークフロー生成中にエラーが発生しました。';
    const status = error instanceof WorkflowApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
