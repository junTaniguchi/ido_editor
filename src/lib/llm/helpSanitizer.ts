import { HelpUserRole } from '@/types';

export interface HelpFileAttachment {
  path: string;
  content: string;
}

export interface HelpSanitizerOptions {
  maskFileContent: boolean;
  userRole: HelpUserRole;
  allowedRoles: Record<HelpUserRole, boolean>;
  maxContextLength?: number;
  additionalPatterns?: RegExp[];
}

export interface SanitizedHelpRequest {
  sanitizedQuery: string;
  context: string | null;
  maskedFiles: { path: string; reason: string }[];
  maskedPatterns: string[];
  blocked: boolean;
  blockReason?: string;
}

const DEFAULT_SENSITIVE_PATTERNS: RegExp[] = [
  /sk-[a-zA-Z0-9]{32,}/g, // OpenAI keys
  /(AIza[0-9A-Za-z\-_]{35})/g, // Google API keys
  /(xox[pbar]-[0-9A-Za-z-]{10,})/g, // Slack tokens
  /(?<=password\s*[=:]\s*)(['"])?.+?\1(?=\s|$)/gi,
  /(?<=secret\s*[=:]\s*)(['"])?.+?\1(?=\s|$)/gi,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
];

function maskSensitiveSegments(text: string, patterns: RegExp[]): { sanitized: string; matches: string[] } {
  if (!text) {
    return { sanitized: '', matches: [] };
  }

  let sanitized = text;
  const matches: string[] = [];

  patterns.forEach((pattern) => {
    sanitized = sanitized.replace(pattern, (match) => {
      const label = `pattern:${pattern.source}`;
      if (label && !matches.includes(label)) {
        matches.push(label);
      }
      return '[MASKED]';
    });
  });

  return { sanitized, matches };
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 20)}\n...[truncated]`;
}

export function sanitizeHelpRequest(
  input: { query: string; files?: HelpFileAttachment[] },
  options: HelpSanitizerOptions,
): SanitizedHelpRequest {
  const { allowedRoles, userRole, maskFileContent, maxContextLength = 4000, additionalPatterns = [] } = options;
  const patterns = [...DEFAULT_SENSITIVE_PATTERNS, ...additionalPatterns];
  const roleAllowed = allowedRoles?.[userRole];

  const { sanitized: sanitizedQuery, matches: queryMatches } = maskSensitiveSegments(input.query ?? '', patterns);

  if (!roleAllowed) {
    return {
      sanitizedQuery,
      context: null,
      maskedFiles: [],
      maskedPatterns: queryMatches,
      blocked: true,
      blockReason: '現在の権限ではヘルプ機能を利用できません。',
    };
  }

  const maskedFiles: { path: string; reason: string }[] = [];
  const maskedPatterns = [...queryMatches];

  const fileBlocks = (input.files ?? []).map((file) => {
    const path = file.path ?? 'unknown';
    const rawContent = file.content ?? '';

    if (maskFileContent) {
      maskedFiles.push({ path, reason: 'マスク設定により非表示' });
      return `## File: ${path}\n[マスク済みコンテンツ]`;
    }

    const { sanitized, matches } = maskSensitiveSegments(rawContent, patterns);
    matches.forEach((match) => {
      if (!maskedPatterns.includes(match)) {
        maskedPatterns.push(match);
      }
    });

    const limited = truncate(sanitized, maxContextLength);
    return `## File: ${path}\n${limited}`;
  });

  const context = fileBlocks.length > 0 ? fileBlocks.join('\n\n') : null;

  return {
    sanitizedQuery,
    context,
    maskedFiles,
    maskedPatterns,
    blocked: false,
  };
}

export const helpSanitizerDefaults = {
  patterns: DEFAULT_SENSITIVE_PATTERNS,
};
