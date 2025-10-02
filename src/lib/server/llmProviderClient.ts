import type { ChatCompletionMessage } from '@/lib/llm/workflowPrompt';
import type { LlmProvider } from '@/types/llm';

const OPENAI_CHAT_COMPLETION_URL = 'https://api.openai.com/v1/chat/completions';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_OPENAI_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini';
const DEFAULT_GEMINI_MODEL = process.env.GEMINI_DEFAULT_MODEL || 'gemini-1.5-flash-latest';

export interface LlmUsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export class LlmProviderError extends Error {
  provider: Exclude<LlmProvider, 'none'>;
  status: number;

  constructor(provider: Exclude<LlmProvider, 'none'>, message: string, status = 500) {
    super(message);
    this.name = 'LlmProviderError';
    this.provider = provider;
    this.status = status;
  }
}

interface BaseCallOptions {
  apiKey: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
}

interface OpenAiCallOptions extends BaseCallOptions {
  provider: 'openai';
  model?: string;
  responseFormat?: { type: 'json_object' | 'json_schema'; json_schema?: unknown };
}

interface GeminiCallOptions extends BaseCallOptions {
  provider: 'gemini';
  model?: string;
  responseMimeType?: string;
}

export type LlmCallOptions = OpenAiCallOptions | GeminiCallOptions;

export interface LlmCallResult {
  content: string;
  usage?: LlmUsageMetrics;
}

function buildOpenAiPayload(options: OpenAiCallOptions) {
  const body: Record<string, unknown> = {
    model: options.model ?? DEFAULT_OPENAI_MODEL,
    temperature: options.temperature ?? 0.3,
    messages: options.messages,
  };

  if (options.responseFormat) {
    body.response_format = options.responseFormat;
  }

  return body;
}

interface GeminiContentPart {
  text?: string;
}

interface GeminiContent {
  role?: string;
  parts: GeminiContentPart[];
}

function buildGeminiPayload(options: GeminiCallOptions) {
  const contents: GeminiContent[] = [];
  let systemInstruction: GeminiContent | undefined;

  options.messages.forEach((message) => {
    if (message.role === 'system') {
      const text = message.content?.toString();
      if (text && text.trim().length > 0) {
        systemInstruction = {
          role: 'system',
          parts: [{ text }],
        };
      }
      return;
    }

    const role = message.role === 'assistant' ? 'model' : 'user';
    contents.push({
      role,
      parts: [{ text: message.content }],
    });
  });

  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.3,
  };

  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType;
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig,
  };

  if (systemInstruction) {
    payload.systemInstruction = systemInstruction;
  }

  return payload;
}

function extractGeminiText(data: any): string {
  const finishReason = data?.candidates?.[0]?.finishReason;
  if (finishReason === 'SAFETY') {
    throw new Error('Gemini から安全性により応答がブロックされました。');
  }

  const parts: GeminiContentPart[] = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) {
    throw new Error('Gemini から有効な応答を取得できませんでした。');
  }

  const text = parts
    .map((part) => part?.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini から有効なテキスト応答を取得できませんでした。');
  }

  return text;
}

function parseGeminiUsage(data: any): LlmUsageMetrics | undefined {
  const usage = data?.usageMetadata;
  if (!usage) {
    return undefined;
  }

  const promptTokens = typeof usage.promptTokenCount === 'number' ? usage.promptTokenCount : undefined;
  const completionTokens = typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : undefined;
  const totalTokens = typeof usage.totalTokenCount === 'number' ? usage.totalTokenCount : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens };
}

function parseOpenAiUsage(data: any): LlmUsageMetrics | undefined {
  const usage = data?.usage;
  if (!usage) {
    return undefined;
  }

  const promptTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : undefined;
  const completionTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === 'number' ? usage.total_tokens : undefined;

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return { promptTokens, completionTokens, totalTokens };
}

export async function callLlmModel(options: LlmCallOptions): Promise<LlmCallResult> {
  if (options.provider === 'openai') {
    const response = await fetch(OPENAI_CHAT_COMPLETION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(buildOpenAiPayload(options)),
    });

    if (!response.ok) {
      let message = 'OpenAI APIの呼び出しに失敗しました。';
      try {
        const errorPayload = await response.json();
        message = errorPayload?.error?.message || message;
      } catch {
        // ignore
      }
      throw new LlmProviderError('openai', message, response.status);
    }

    const data = await response.json();
    const content: string | undefined = data?.choices?.[0]?.message?.content;
    if (!content || content.trim().length === 0) {
      throw new LlmProviderError('openai', 'OpenAI から有効な応答を取得できませんでした。', 502);
    }

    return {
      content: content.trim(),
      usage: parseOpenAiUsage(data),
    };
  }

  const model = options.model ?? DEFAULT_GEMINI_MODEL;
  const url = `${GEMINI_BASE_URL}/${model}:generateContent?key=${encodeURIComponent(options.apiKey)}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(buildGeminiPayload(options)),
  });

  if (!response.ok) {
    let message = 'Gemini APIの呼び出しに失敗しました。';
    try {
      const errorPayload = await response.json();
      message = errorPayload?.error?.message || message;
    } catch {
      // ignore
    }
    throw new LlmProviderError('gemini', message, response.status);
  }

  const data = await response.json();
  try {
    const content = extractGeminiText(data);
    return {
      content,
      usage: parseGeminiUsage(data),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gemini から有効な応答を取得できませんでした。';
    throw new LlmProviderError('gemini', message, 502);
  }
}
