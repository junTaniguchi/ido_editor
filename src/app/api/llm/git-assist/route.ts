import { NextResponse } from 'next/server';
import type { ChatCompletionMessage } from '@/lib/llm/workflowPrompt';
import type {
  GitAssistApiResponse,
  GitAssistDiffPayload,
  GitAssistFileDiff,
  GitAssistIntent,
  GitAssistModelResponse,
  GitAssistRequestPayload,
  GitAssistSkippedFile,
  GitAssistDiffScope,
  GitFileStatus,
} from '@/types/git';

class GitAssistApiError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = 'GitAssistApiError';
    this.status = status;
  }
}

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
const MAX_DIFF_SNIPPET_LENGTH = 12000;
const MAX_FILE_ENTRIES = 20;
const VALID_INTENTS: GitAssistIntent[] = ['commit-summary', 'review-comments'];
const VALID_STATUSES: GitFileStatus[] = ['unmodified', 'modified', 'deleted', 'added', 'untracked', 'absent'];
const VALID_SCOPES: GitAssistDiffScope[] = ['staged', 'worktree', 'all'];

const gitAssistResponseSchema = {
  name: 'git_assist_response',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['intent'],
    properties: {
      intent: {
        type: 'string',
        enum: VALID_INTENTS,
        description: '応答の種類。commit-summary または review-comments。',
      },
      commitMessage: {
        type: 'string',
        description: '提案されたコミットメッセージ。',
      },
      summary: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'string',
          description: '変更概要の箇条書き。',
        },
      },
      reviewComments: {
        type: 'array',
        maxItems: 12,
        items: {
          type: 'string',
          description: 'レビューコメント。',
        },
      },
      warnings: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'string',
          description: '注意点や警告。',
        },
      },
    },
  },
} as const;

function normalizeIntent(value: unknown): GitAssistIntent | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim() as GitAssistIntent;
  return VALID_INTENTS.includes(trimmed) ? trimmed : null;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeScope(value: unknown): GitAssistDiffScope {
  if (typeof value === 'string') {
    const trimmed = value.trim() as GitAssistDiffScope;
    if (VALID_SCOPES.includes(trimmed)) {
      return trimmed;
    }
  }
  return 'staged';
}

function normalizeStatus(value: unknown): GitFileStatus {
  if (typeof value === 'string') {
    const trimmed = value.trim() as GitFileStatus;
    if (VALID_STATUSES.includes(trimmed)) {
      return trimmed;
    }
  }
  return 'modified';
}

function sanitizeSkipped(value: unknown): GitAssistSkippedFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const entries: GitAssistSkippedFile[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const path = typeof (item as any).path === 'string' ? (item as any).path : null;
    if (!path) {
      continue;
    }
    const reason = (item as any).reason === 'sensitive' ? 'sensitive' : 'error';
    const message = typeof (item as any).message === 'string' ? (item as any).message : undefined;
    entries.push({ path, reason, message });
  }
  return entries;
}

function sanitizeFiles(value: unknown): GitAssistFileDiff[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const files: GitAssistFileDiff[] = [];
  for (const item of value.slice(0, MAX_FILE_ENTRIES)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const path = typeof (item as any).path === 'string' ? (item as any).path : null;
    if (!path) {
      continue;
    }
    const diff = typeof (item as any).diff === 'string' ? (item as any).diff : null;
    files.push({
      path,
      worktreeStatus: normalizeStatus((item as any).worktreeStatus),
      stagedStatus: normalizeStatus((item as any).stagedStatus),
      isStaged: Boolean((item as any).isStaged),
      isUntracked: Boolean((item as any).isUntracked),
      diff,
      isBinary: Boolean((item as any).isBinary),
      headSize: typeof (item as any).headSize === 'number' ? (item as any).headSize : null,
      worktreeSize: typeof (item as any).worktreeSize === 'number' ? (item as any).worktreeSize : null,
    });
  }
  return files;
}

function sanitizeDiffPayload(value: unknown, fallbackBranch: string | null): GitAssistDiffPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const branch = typeof (value as any).branch === 'string' ? (value as any).branch : fallbackBranch;
  const scope = normalizeScope((value as any).scope);
  const files = sanitizeFiles((value as any).files);
  const skipped = sanitizeSkipped((value as any).skipped);
  return {
    branch: branch ?? null,
    scope,
    files,
    skipped,
  };
}

function truncateDiff(diff: string | null): string | null {
  if (typeof diff !== 'string') {
    return null;
  }
  if (diff.length <= MAX_DIFF_SNIPPET_LENGTH) {
    return diff;
  }
  return `${diff.slice(0, MAX_DIFF_SNIPPET_LENGTH)}\n... (diff truncated)`;
}

function formatFileEntry(file: GitAssistFileDiff, index: number): string {
  const lines: string[] = [];
  lines.push(`### File ${index + 1}: ${file.path}`);
  lines.push(`- 状態: worktree=${file.worktreeStatus}, staged=${file.stagedStatus}, isStaged=${file.isStaged}, isUntracked=${file.isUntracked}`);
  lines.push(`- サイズ: HEAD=${file.headSize ?? 0} bytes, 作業ツリー=${file.worktreeSize ?? 0} bytes`);
  if (file.isBinary) {
    lines.push('- このファイルはバイナリのため差分を省略しました。');
  } else if (file.diff) {
    lines.push('```diff');
    lines.push(truncateDiff(file.diff) ?? '');
    lines.push('```');
  } else {
    lines.push('- 差分を取得できませんでした。');
  }
  return lines.join('\n');
}

function buildUserContent(payload: GitAssistRequestPayload): string {
  const segments: string[] = [];
  segments.push(`Intent: ${payload.intent}`);
  if (payload.branch) {
    segments.push(`Current branch: ${payload.branch}`);
  }
  segments.push(`Diff scope: ${payload.diff.scope}`);
  if (payload.commitPurpose) {
    segments.push(`Commit purpose: ${payload.commitPurpose}`);
  }
  if (payload.diff.skipped.length > 0) {
    segments.push('Skipped files (not shared with the model):');
    for (const skipped of payload.diff.skipped) {
      segments.push(`- ${skipped.path} (${skipped.reason})${skipped.message ? `: ${skipped.message}` : ''}`);
    }
  }

  if (payload.diff.files.length === 0) {
    segments.push('No diff content was provided.');
  } else {
    segments.push('Changed files:');
    payload.diff.files.forEach((file, index) => {
      segments.push(formatFileEntry(file, index));
    });
  }

  segments.push('Respond in Japanese.');
  return segments.join('\n\n');
}

function buildMessages(payload: GitAssistRequestPayload): ChatCompletionMessage[] {
  const intentInstruction =
    payload.intent === 'commit-summary'
      ? 'Provide a concise commit message and bullet summary of the changes.'
      : 'Provide specific code review comments pointing out potential issues or improvements.';

  const systemPrompt = [
    'You are an experienced software engineer assisting with Git workflows.',
    'When asked for a commit summary, craft a clear Japanese commit message (max 72 chars) and 1-4 bullet summary items.',
    'When asked for review comments, produce actionable Japanese comments referencing the provided diff.',
    'Do not invent details that are not supported by the diff.',
    'Always return JSON that satisfies the provided schema. Do not include extra commentary.',
  ].join(' ');

  const userContent = [intentInstruction, buildUserContent(payload)].join('\n\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
}

function normalizeModelResponse(data: unknown, fallbackIntent: GitAssistIntent): GitAssistModelResponse {
  const intent = normalizeIntent((data as any)?.intent) ?? fallbackIntent;
  const commitMessage = normalizeOptionalString((data as any)?.commitMessage) ?? null;
  const rawSummary = Array.isArray((data as any)?.summary) ? (data as any).summary : [];
  const summary = rawSummary
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item: string) => item.length > 0);
  const rawReview = Array.isArray((data as any)?.reviewComments) ? (data as any).reviewComments : [];
  const reviewComments = rawReview
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item: string) => item.length > 0);
  const rawWarnings = Array.isArray((data as any)?.warnings) ? (data as any).warnings : [];
  const warnings = rawWarnings
    .map((item: unknown) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item: string) => item.length > 0);

  const response: GitAssistModelResponse = {
    intent,
  };

  if (commitMessage) {
    response.commitMessage = commitMessage;
  }
  if (summary.length > 0) {
    response.summary = summary;
  }
  if (reviewComments.length > 0) {
    response.reviewComments = reviewComments;
  }
  if (warnings.length > 0) {
    response.warnings = warnings;
  }

  return response;
}

async function callGitAssistModel(apiKey: string, payload: GitAssistRequestPayload): Promise<GitAssistApiResponse> {
  const messages = buildMessages(payload);
  const temperature = payload.intent === 'commit-summary' ? 0.2 : 0.3;

  const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature,
      response_format: {
        type: 'json_schema',
        json_schema: gitAssistResponseSchema,
      },
      messages,
    }),
  });

  if (!response.ok) {
    let message = 'ChatGPT APIの呼び出しに失敗しました。';
    try {
      const errorPayload = await response.json();
      message = errorPayload?.error?.message || message;
    } catch {
      // ignore JSON parse errors
    }
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;
    throw new GitAssistApiError(message, status);
  }

  const data = await response.json();
  const content: unknown = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  const parsed = JSON.parse(content);
  return normalizeModelResponse(parsed, payload.intent);
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY が設定されていません。' }, { status: 500 });
    }

    const body: Partial<GitAssistRequestPayload> = await request.json();
    const intent = normalizeIntent(body?.intent);
    if (!intent) {
      return NextResponse.json({ error: 'intent には commit-summary または review-comments を指定してください。' }, { status: 400 });
    }

    const branch = normalizeOptionalString(body?.branch) ?? null;
    const commitPurpose = normalizeOptionalString(body?.commitPurpose);
    const diff = sanitizeDiffPayload(body?.diff, branch);

    if (!diff || diff.files.length === 0) {
      return NextResponse.json({ error: '送信可能な差分がありません。' }, { status: 400 });
    }

    const payload: GitAssistRequestPayload = {
      intent,
      branch: diff.branch ?? branch,
      commitPurpose,
      diff,
    };

    const result = await callGitAssistModel(apiKey, payload);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Git assist API error:', error);
    const message = error instanceof Error ? error.message : 'AIアシスト処理中にエラーが発生しました。';
    const status = error instanceof GitAssistApiError ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
