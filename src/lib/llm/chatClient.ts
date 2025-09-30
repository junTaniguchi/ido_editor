import type { PairWritingPurpose } from '@/types';
import type { ChatCompletionMessage } from './workflowPrompt';

export interface PairWritingRequest {
  purpose: PairWritingPurpose;
  text: string;
  targetLanguage?: string;
  rewriteInstruction?: string;
}

export interface PairWritingUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface PairWritingResponse {
  purpose: PairWritingPurpose;
  output: string;
  targetLanguage?: string;
  rewriteInstruction?: string;
  usage?: PairWritingUsage | null;
}

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';
export const DEFAULT_TRANSLATION_TARGET = '日本語';

interface PromptTemplate {
  system: string;
  buildUserContent: (payload: PairWritingRequest) => string;
  temperature?: number;
}

const translationPrompt: PromptTemplate = {
  system: [
    'あなたはMarkdownで記述された技術文書を的確に翻訳するバイリンガル編集者です。',
    '必ずMarkdownの構造を保持し、コードブロックやURL、HTMLタグは原文のまま残してください。',
    '翻訳結果のみを出力し、説明や前置きの文章は追加しないでください。',
  ].join('\n'),
  buildUserContent: (payload) => {
    const targetLanguage = payload.targetLanguage?.trim() || DEFAULT_TRANSLATION_TARGET;
    const normalized = payload.text?.trim() || '';
    return [
      `以下のMarkdownテキストを${targetLanguage}に翻訳してください。`,
      'テキスト:',
      '```markdown',
      normalized,
      '```',
      '翻訳時の注意点:',
      '- 文章の意味を正確に保つ',
      '- 数字やコード、固有名詞の整合性を保つ',
      '- Markdownの見出しレベルや表、リスト構造を保持する',
    ].join('\n');
  },
  temperature: 0.2,
};

const rewritePrompt: PromptTemplate = {
  system: [
    'あなたはMarkdown文書の編集を行う熟練のテクニカルライターです。',
    '文章の意味を変えずに、読みやすく自然な日本語または原文の言語で整えてください。',
    'Markdownの構造やコードブロック、数式は維持し、不要な語句の追加は避けてください。',
    '出力は編集後のMarkdownテキストのみとし、解説は加えないでください。',
  ].join('\n'),
  buildUserContent: (payload) => {
    const normalized = payload.text?.trim() || '';
    const instruction = payload.rewriteInstruction?.trim();
    const segments = [
      '次のMarkdownテキストを読みやすくリライトしてください。',
      '原文の意味を保ちつつ、冗長な表現は簡潔に整えてください。',
      'テキスト:',
      '```markdown',
      normalized,
      '```',
    ];

    if (instruction && instruction.length > 0) {
      segments.push('追加指示:');
      segments.push(instruction);
    }

    segments.push('Markdown構造と専門用語は保持してください。');
    return segments.join('\n');
  },
  temperature: 0.4,
};

const promptMap: Record<PairWritingPurpose, PromptTemplate> = {
  translate: translationPrompt,
  rewrite: rewritePrompt,
};

export function buildPairWritingMessages(payload: PairWritingRequest): ChatCompletionMessage[] {
  const template = promptMap[payload.purpose];
  const systemContent = template.system;
  const userContent = template.buildUserContent(payload);

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent },
  ];
}

export async function callPairWritingModel(
  apiKey: string,
  payload: PairWritingRequest,
): Promise<PairWritingResponse> {
  const template = promptMap[payload.purpose];
  const messages = buildPairWritingMessages(payload);

  const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: template.temperature ?? 0.3,
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
    const error = new Error(message);
    throw error;
  }

  const data = await response.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  const usage: PairWritingUsage | null = data?.usage
    ? {
        promptTokens: typeof data.usage.prompt_tokens === 'number' ? data.usage.prompt_tokens : undefined,
        completionTokens: typeof data.usage.completion_tokens === 'number' ? data.usage.completion_tokens : undefined,
        totalTokens: typeof data.usage.total_tokens === 'number' ? data.usage.total_tokens : undefined,
      }
    : null;

  if (!content) {
    throw new Error('モデルから有効な応答を取得できませんでした。');
  }

  return {
    purpose: payload.purpose,
    output: content.trim(),
    targetLanguage: payload.targetLanguage,
    rewriteInstruction: payload.rewriteInstruction,
    usage,
  };
}

export type PairWritingApiRequest = PairWritingRequest;

export async function requestPairWritingPreview(
  payload: PairWritingApiRequest,
): Promise<PairWritingResponse> {
  const response = await fetch('/api/llm/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let message = `チャット補助の生成に失敗しました。（${response.status}）`;
    try {
      const errorPayload = await response.json();
      if (errorPayload && typeof errorPayload.error === 'string') {
        message = errorPayload.error;
      }
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const data = await response.json();
  return {
    purpose: data?.purpose ?? payload.purpose,
    output: typeof data?.output === 'string' ? data.output : '',
    targetLanguage: typeof data?.targetLanguage === 'string' ? data.targetLanguage : payload.targetLanguage,
    rewriteInstruction: typeof data?.rewriteInstruction === 'string' ? data.rewriteInstruction : payload.rewriteInstruction,
    usage: data?.usage ?? null,
  };
}
