import { NextResponse } from 'next/server';

import {
  buildWorkflowMessages,
  ensureWorkflowCellsAreSafe,
  parseWorkflowResponse,
  WorkflowGeneratedCell,
  WorkflowPromptInput,
} from '@/lib/llm/workflowPrompt';
import { callLlmModel, LlmProviderError } from '@/lib/server/llmProviderClient';
import { getActiveProviderApiKey } from '@/lib/server/llmSettingsStore';

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

const DEFAULT_MODEL = 'gpt-4o-mini';
const GEMINI_WORKFLOW_MODEL = process.env.GEMINI_WORKFLOW_MODEL || process.env.GEMINI_CHAT_MODEL;
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
  provider: 'openai' | 'gemini',
  apiKey: string,
  input: WorkflowPromptInput,
): Promise<{ cells: WorkflowGeneratedCell[]; rationale?: string }> {
  const messages = buildWorkflowMessages(input);

  const result = await callLlmModel({
    provider,
    apiKey,
    messages,
    temperature: 0.2,
    ...(provider === 'openai'
      ? { model: DEFAULT_MODEL, responseFormat: { type: 'json_object' as const } }
      : { model: GEMINI_WORKFLOW_MODEL, responseMimeType: 'application/json' }),
  });

  const content = result.content;

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
    const providerConfig = await getActiveProviderApiKey();
    if (!providerConfig) {
      return NextResponse.json({ error: 'AIプロバイダーのAPIキーが設定されていません。設定画面から登録してください。' }, { status: 500 });
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

    const { cells, rationale } = await callChatCompletion(providerConfig.provider, providerConfig.apiKey, promptInput);

    return NextResponse.json({ cells, rationale: rationale ?? null });
  } catch (error) {
    console.error('Workflow API error:', error);
    if (error instanceof LlmProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'ワークフロー生成中にエラーが発生しました。';
    const status = error instanceof WorkflowApiError ? error.status : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
