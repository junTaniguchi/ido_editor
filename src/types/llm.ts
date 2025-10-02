export type LlmProvider = 'openai' | 'gemini' | 'none';

export type LlmKeySource = 'env' | 'stored' | 'none';

export type LlmQuotaIssueReason =
  | 'insufficient_quota'
  | 'invalid_key'
  | 'network_error'
  | 'unexpected_response';

export interface LlmQuotaStatus {
  ok: boolean;
  reason?: LlmQuotaIssueReason;
  message?: string;
  detail?: string;
}

export interface LlmProviderStatus {
  provider: 'openai' | 'gemini';
  hasKey: boolean;
  hasStoredKey: boolean;
  source: LlmKeySource;
  quota?: LlmQuotaStatus;
}

export interface LlmSettingsStatus {
  openai: LlmProviderStatus;
  gemini: LlmProviderStatus;
  activeProvider: LlmProvider;
}
