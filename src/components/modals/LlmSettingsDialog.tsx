'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';

import { deleteLlmApiKey, saveLlmApiKey, updateActiveLlmProvider } from '@/lib/llm/llmSettingsClient';
import { useLlmSettingsContext } from '@/components/providers/LlmSettingsProvider';
import type { LlmProvider, LlmProviderStatus } from '@/types/llm';

type ProviderKey = 'openai' | 'gemini';

const PROVIDER_LABEL: Record<ProviderKey, string> = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

interface ProviderMessages {
  success: string | null;
  error: string | null;
  warning: string | null;
}

const INITIAL_MESSAGES: Record<ProviderKey, ProviderMessages> = {
  openai: { success: null, error: null, warning: null },
  gemini: { success: null, error: null, warning: null },
};

function describeStatus(status: LlmProviderStatus): string {
  if (status.source === 'env') {
    return status.hasStoredKey
      ? '環境変数のキーが優先されています（ローカル設定にもキーがあります）。'
      : '環境変数に設定されたキーを使用しています。';
  }

  if (status.source === 'stored') {
    return 'ローカル設定ファイルに保存されたキーを使用しています。';
  }

  if (status.hasStoredKey) {
    return 'ローカル設定ファイルにキーが保存されていますが、現在は使用していません。';
  }

  return 'キーは未設定です。';
}

function quotaWarning(status: LlmProviderStatus): string | null {
  if (!status.quota || status.quota.ok || status.quota.reason !== 'insufficient_quota') {
    return null;
  }
  return status.quota.message ?? 'OpenAIの利用枠（クォータ）が不足しています。';
}

const LlmSettingsDialog: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { settings, loading, error, refresh, setSettings } = useLlmSettingsContext();
  const [openAiInput, setOpenAiInput] = useState('');
  const [geminiInput, setGeminiInput] = useState('');
  const [saving, setSaving] = useState<{ openai: boolean; gemini: boolean }>({ openai: false, gemini: false });
  const [deleting, setDeleting] = useState<{ openai: boolean; gemini: boolean }>({ openai: false, gemini: false });
  const [providerUpdating, setProviderUpdating] = useState(false);
  const [providerMessage, setProviderMessage] = useState<{ success?: string | null; warning?: string | null; error?: string | null }>({});
  const [providerMessages, setProviderMessages] = useState<Record<ProviderKey, ProviderMessages>>(INITIAL_MESSAGES);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setOpenAiInput('');
      setGeminiInput('');
      setSaving({ openai: false, gemini: false });
      setDeleting({ openai: false, gemini: false });
      setProviderUpdating(false);
      setProviderMessage({});
      setProviderMessages(INITIAL_MESSAGES);
      setLocalError(null);
      return;
    }

    setLocalError(error);
    void refresh();
  }, [isOpen, error, refresh]);

  const activeProvider: LlmProvider = settings?.activeProvider ?? 'none';
  const openAiStatus = settings?.openai;
  const geminiStatus = settings?.gemini;
  const openAiQuotaWarning = openAiStatus ? quotaWarning(openAiStatus) : null;

  const isBusy = loading && !settings;

  const updateProviderMessage = useCallback(
    (value: { success?: string | null; warning?: string | null; error?: string | null }) => {
      setProviderMessage(value);
    },
    [],
  );

  const updateProviderMessages = useCallback(
    (provider: ProviderKey, value: ProviderMessages) => {
      setProviderMessages((prev) => ({ ...prev, [provider]: value }));
    },
    [],
  );

  const handleSaveKey = useCallback(
    async (provider: ProviderKey) => {
      const input = provider === 'openai' ? openAiInput.trim() : geminiInput.trim();
      if (!input) {
        updateProviderMessages(provider, {
          success: null,
          warning: null,
          error: `${PROVIDER_LABEL[provider]} のAPIキーを入力してください。`,
        });
        return;
      }

      setSaving((prev) => ({ ...prev, [provider]: true }));
      updateProviderMessages(provider, { success: null, warning: null, error: null });

      try {
        const updated = await saveLlmApiKey(provider, input);
        setSettings(updated);
        if (provider === 'openai') {
          setOpenAiInput('');
        } else {
          setGeminiInput('');
        }

        const status = provider === 'openai' ? updated.openai : updated.gemini;
        let successMessage = `${PROVIDER_LABEL[provider]} のAPIキーを保存しました。`;
        let warningMessage: string | null = null;
        let errorMessage: string | null = null;

        if (provider === 'openai') {
          if (status.source === 'env') {
            successMessage = 'OpenAI APIキーを保存しました（環境変数が優先されます）。';
          }
          if (status.quota && !status.quota.ok) {
            if (status.quota.reason === 'insufficient_quota') {
              warningMessage = status.quota.message ?? 'OpenAIの利用枠（クォータ）が不足しています。';
              successMessage = `${successMessage}（ただし利用枠が不足しています。）`;
            } else {
              errorMessage = status.quota.message ?? 'OpenAI APIキーの検証で警告が発生しました。';
            }
          }
        }

        updateProviderMessages(provider, {
          success: successMessage,
          warning: warningMessage,
          error: errorMessage,
        });
        updateProviderMessage({});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'APIキーの保存に失敗しました。';
        updateProviderMessages(provider, { success: null, warning: null, error: message });
      } finally {
        setSaving((prev) => ({ ...prev, [provider]: false }));
      }
    },
    [geminiInput, openAiInput, setSettings, updateProviderMessage, updateProviderMessages],
  );

  const handleDeleteKey = useCallback(
    async (provider: ProviderKey) => {
      setDeleting((prev) => ({ ...prev, [provider]: true }));
      updateProviderMessages(provider, { success: null, warning: null, error: null });

      try {
        const updated = await deleteLlmApiKey(provider);
        setSettings(updated);
        const status = provider === 'openai' ? updated.openai : updated.gemini;

        let successMessage = `${PROVIDER_LABEL[provider]} のAPIキーを削除しました。`;
        if (provider === 'openai' && status.hasKey) {
          successMessage = 'ローカルのキーは削除しました（環境変数のキーが利用されています）。';
        }

        updateProviderMessages(provider, { success: successMessage, warning: null, error: null });
        updateProviderMessage({});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'APIキーの削除に失敗しました。';
        updateProviderMessages(provider, { success: null, warning: null, error: message });
      } finally {
        setDeleting((prev) => ({ ...prev, [provider]: false }));
      }
    },
    [setSettings, updateProviderMessage, updateProviderMessages],
  );

  const handleProviderChange = useCallback(
    async (provider: LlmProvider) => {
      setProviderUpdating(true);
      updateProviderMessage({});

      try {
        const updated = await updateActiveLlmProvider(provider);
        setSettings(updated);

        if (provider === 'none') {
          updateProviderMessage({ success: 'AI機能を使用しないように設定しました。', warning: null, error: null });
          return;
        }

        const status = provider === 'openai' ? updated.openai : updated.gemini;
        const label = PROVIDER_LABEL[provider];
        let warning: string | null = null;

        if (!status.hasKey) {
          warning = `${label} のAPIキーが設定されていません。キーを登録してください。`;
        } else if (provider === 'openai' && status.quota && !status.quota.ok && status.quota.reason === 'insufficient_quota') {
          warning = status.quota.message ?? 'OpenAIの利用枠（クォータ）が不足しています。';
        }

        updateProviderMessage({
          success: `${label} を利用するように設定しました。`,
          warning,
          error: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'AI設定の更新に失敗しました。';
        updateProviderMessage({ error: message });
      } finally {
        setProviderUpdating(false);
      }
    },
    [setSettings, updateProviderMessage],
  );

  const renderProviderDescription = useCallback((status: LlmProviderStatus | undefined, provider: ProviderKey) => {
    if (!status) {
      return '状態を確認しています…';
    }
    const description = describeStatus(status);
    if (status.source === 'none' && provider === 'gemini') {
      return `${description} Gemini のAPIキーは Google AI Studio で取得できます。`;
    }
    return description;
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-[36rem] max-w-full rounded-lg bg-white shadow-lg dark:bg-gray-800">
        <div className="flex items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h2 className="text-lg font-medium">AIプロバイダー設定</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="設定ダイアログを閉じる"
          >
            <IoCloseOutline size={22} />
          </button>
        </div>

        <div className="space-y-6 p-4 text-sm text-gray-700 dark:text-gray-200">
          {localError ? (
            <div className="rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200">
              {localError}
            </div>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">利用するAIプロバイダー</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              利用するAIエンジンを選択してください。選択したプロバイダーに有効なAPIキーが必要です。
            </p>

            <div className="space-y-2">
              {[
                { value: 'openai' as LlmProvider, label: 'OpenAI', description: renderProviderDescription(openAiStatus, 'openai') },
                { value: 'gemini' as LlmProvider, label: 'Google Gemini', description: renderProviderDescription(geminiStatus, 'gemini') },
                { value: 'none' as LlmProvider, label: 'AI機能を使用しない', description: 'すべてのAI機能を一時的に非表示にします。' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col rounded border p-3 transition ${
                    activeProvider === option.value
                      ? 'border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/30'
                      : 'border-gray-200 hover:border-blue-300 dark:border-gray-700 dark:hover:border-blue-500'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="llm-provider"
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      value={option.value}
                      checked={activeProvider === option.value}
                      onChange={() => {
                        void handleProviderChange(option.value);
                      }}
                      disabled={providerUpdating || isBusy}
                    />
                    <span className="font-medium">{option.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{option.description}</p>
                </label>
              ))}
            </div>

            {providerMessage.success ? (
              <p className="text-xs text-green-600 dark:text-green-400">{providerMessage.success}</p>
            ) : null}
            {providerMessage.warning ? (
              <p className="text-xs text-yellow-600 dark:text-yellow-400">{providerMessage.warning}</p>
            ) : null}
            {providerMessage.error ? (
              <p className="text-xs text-red-600 dark:text-red-400">{providerMessage.error}</p>
            ) : null}
          </section>

          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">OpenAI APIキー</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{renderProviderDescription(openAiStatus, 'openai')}</p>
              </div>
            </header>

            {openAiQuotaWarning ? (
              <p className="text-xs text-red-600 dark:text-red-400">{openAiQuotaWarning}</p>
            ) : null}

            <div className="space-y-2">
              <input
                type="password"
                className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900"
                placeholder="sk-..."
                value={openAiInput}
                onChange={(event) => {
                  setOpenAiInput(event.target.value);
                  updateProviderMessages('openai', { success: null, warning: null, error: null });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSaveKey('openai');
                  }
                }}
                disabled={saving.openai || isBusy}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveKey('openai');
                  }}
                  disabled={saving.openai || isBusy}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving.openai ? '保存中…' : '保存する'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteKey('openai');
                  }}
                  disabled={deleting.openai || !openAiStatus?.hasStoredKey || isBusy}
                  className="rounded bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting.openai ? '削除中…' : 'ローカルキーを削除'}
                </button>
              </div>
              {providerMessages.openai.success ? (
                <p className="text-xs text-green-600 dark:text-green-400">{providerMessages.openai.success}</p>
              ) : null}
              {providerMessages.openai.warning ? (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">{providerMessages.openai.warning}</p>
              ) : null}
              {providerMessages.openai.error ? (
                <p className="text-xs text-red-600 dark:text-red-400">{providerMessages.openai.error}</p>
              ) : null}
            </div>
          </section>

          <section className="space-y-3">
            <header className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Google Gemini APIキー</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{renderProviderDescription(geminiStatus, 'gemini')}</p>
              </div>
            </header>

            <div className="space-y-2">
              <input
                type="password"
                className="w-full rounded border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-900"
                placeholder="..."
                value={geminiInput}
                onChange={(event) => {
                  setGeminiInput(event.target.value);
                  updateProviderMessages('gemini', { success: null, warning: null, error: null });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void handleSaveKey('gemini');
                  }
                }}
                disabled={saving.gemini || isBusy}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleSaveKey('gemini');
                  }}
                  disabled={saving.gemini || isBusy}
                  className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {saving.gemini ? '保存中…' : '保存する'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeleteKey('gemini');
                  }}
                  disabled={deleting.gemini || !geminiStatus?.hasStoredKey || isBusy}
                  className="rounded bg-red-600 px-4 py-2 text-sm text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting.gemini ? '削除中…' : 'ローカルキーを削除'}
                </button>
              </div>
              {providerMessages.gemini.success ? (
                <p className="text-xs text-green-600 dark:text-green-400">{providerMessages.gemini.success}</p>
              ) : null}
              {providerMessages.gemini.warning ? (
                <p className="text-xs text-yellow-600 dark:text-yellow-400">{providerMessages.gemini.warning}</p>
              ) : null}
              {providerMessages.gemini.error ? (
                <p className="text-xs text-red-600 dark:text-red-400">{providerMessages.gemini.error}</p>
              ) : null}
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default LlmSettingsDialog;
