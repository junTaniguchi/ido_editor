'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import {
  deleteLlmKey,
  fetchLlmKeyStatus,
  saveLlmKey,
  type LlmKeyStatus,
} from '@/lib/llm/llmKeyClient';

interface LlmSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const CONFIG_FILE_HINT = '~/.dataloom/settings.json';

const LlmSettingsDialog: React.FC<LlmSettingsDialogProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<LlmKeyStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setApiKeyInput('');
      setErrorMessage(null);
      setFeedbackMessage(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setErrorMessage(null);

    fetchLlmKeyStatus()
      .then((result) => {
        if (!isMounted) return;
        setStatus(result);
      })
      .catch((error) => {
        console.error('Failed to load OpenAI API key status:', error);
        if (!isMounted) return;
        setStatus({ hasKey: false, hasStoredKey: false, source: 'none' });
        setErrorMessage('OpenAI APIキーの状態取得に失敗しました。');
      })
      .finally(() => {
        if (!isMounted) return;
        setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const statusDescription = useMemo(() => {
    if (!status) {
      return '状態を確認しています…';
    }

    if (status.source === 'env') {
      return status.hasStoredKey
        ? '環境変数 OPENAI_API_KEY が優先されています（ローカル設定にもキーが保存されています）。'
        : '環境変数 OPENAI_API_KEY が設定されています。';
    }

    if (status.source === 'stored') {
      return 'ローカル設定ファイルに保存された OpenAI APIキーを使用しています。';
    }

    if (status.hasStoredKey) {
      return 'ローカル設定ファイルにキーが保存されていますが、現在は利用されていません。';
    }

    return 'OpenAI APIキーは未設定です。';
  }, [status]);

  const handleSave = useCallback(async () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) {
      setErrorMessage('OpenAI APIキーを入力してください。');
      setFeedbackMessage(null);
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const result = await saveLlmKey(trimmed);
      setStatus(result);
      setApiKeyInput('');
      const message =
        result.source === 'env'
          ? 'OpenAI APIキーを保存しました（環境変数が優先されます）。'
          : 'OpenAI APIキーを保存しました。';
      setFeedbackMessage(message);
    } catch (error) {
      console.error('Failed to save OpenAI API key from settings dialog:', error);
      const message = error instanceof Error ? error.message : 'APIキーの保存に失敗しました。';
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  }, [apiKeyInput]);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    setErrorMessage(null);
    setFeedbackMessage(null);

    try {
      const result = await deleteLlmKey();
      setStatus(result);
      const message = result.hasKey
        ? 'ローカルのキーは削除しました（環境変数のキーが利用されています）。'
        : 'OpenAI APIキーを削除しました。';
      setFeedbackMessage(message);
    } catch (error) {
      console.error('Failed to delete OpenAI API key from settings dialog:', error);
      const message = error instanceof Error ? error.message : 'APIキーの削除に失敗しました。';
      setErrorMessage(message);
    } finally {
      setIsDeleting(false);
    }
  }, []);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[32rem] max-w-full">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium">OpenAI APIキー設定</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="設定ダイアログを閉じる"
          >
            <IoCloseOutline size={22} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
            <p>{statusDescription}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              キーを保存すると {CONFIG_FILE_HINT} に暗号化なしで書き込まれ、Electron やブラウザから再利用できます。
            </p>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200" htmlFor="llm-settings-api-key">
              OpenAI APIキー
            </label>
            <input
              id="llm-settings-api-key"
              type="password"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="sk-..."
              value={apiKeyInput}
              onChange={(event) => {
                setApiKeyInput(event.target.value);
                setErrorMessage(null);
                setFeedbackMessage(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleSave();
                }
              }}
              autoComplete="off"
              spellCheck={false}
              disabled={isSaving}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={isSaving}
                className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {isSaving ? '保存中…' : '保存する'}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDelete();
                }}
                disabled={isDeleting || !status?.hasStoredKey}
                className="px-4 py-2 text-sm rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? '削除中…' : 'ローカルキーを削除'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setErrorMessage(null);
                  setFeedbackMessage(null);
                  fetchLlmKeyStatus()
                    .then((result) => {
                      setStatus(result);
                    })
                    .catch((error) => {
                      console.error('Failed to refresh OpenAI API key status:', error);
                      setErrorMessage('キーの状態を再取得できませんでした。');
                    })
                    .finally(() => {
                      setIsLoading(false);
                    });
                }}
                disabled={isLoading}
                className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                {isLoading ? '更新中…' : '状態を再確認'}
              </button>
            </div>
          </div>

          {feedbackMessage ? <p className="text-xs text-green-600">{feedbackMessage}</p> : null}
          {errorMessage ? <p className="text-xs text-red-600">{errorMessage}</p> : null}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default LlmSettingsDialog;
