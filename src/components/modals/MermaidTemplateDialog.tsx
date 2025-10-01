'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';
import { diagramDefinitions, diagramList } from '@/lib/mermaid/diagramDefinitions';
import type { MermaidDiagramType } from '@/lib/mermaid/types';
import MermaidCodePreview from '@/components/mermaid/MermaidCodePreview';
import { requestMermaidGeneration } from '@/lib/llm/mermaidGenerator';
import { createId } from '@/lib/utils/id';
import { useEditorStore } from '@/store/editorStore';
import type { MermaidGenerationHistoryEntry } from '@/types';

const EMPTY_HISTORY: MermaidGenerationHistoryEntry[] = [];

interface MermaidTemplateDialogProps {
  isOpen: boolean;
  fileName: string;
  initialType?: MermaidDiagramType;
  historyKey?: string;
  onCancel: () => void;
  onConfirm: (diagramType: MermaidDiagramType, generatedCode?: string) => void;
}

const MermaidTemplateDialog: React.FC<MermaidTemplateDialogProps> = ({
  isOpen,
  fileName,
  initialType = 'flowchart',
  historyKey,
  onCancel,
  onConfirm,
}) => {
  const [selectedType, setSelectedType] = useState<MermaidDiagramType>(initialType);
  const [prompt, setPrompt] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [summary, setSummary] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAiAvailable, setIsAiAvailable] = useState<boolean | null>(null);
  const [isCheckingAiAvailability, setIsCheckingAiAvailability] = useState(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedType(initialType);
    }
  }, [initialType, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setPrompt('');
      setGeneratedCode('');
      setSummary('');
      setErrorMessage(null);
      setSelectedHistoryId(null);
      setIsAiAvailable(null);
      setIsCheckingAiAvailability(false);
      return;
    }

    let isMounted = true;
    setIsCheckingAiAvailability(true);

    fetch('/api/llm/status')
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Failed to check LLM availability');
        }
        return response.json();
      })
      .then((data) => {
        if (!isMounted) return;
        const hasKey = Boolean(data?.hasOpenAiApiKey);
        setIsAiAvailable(hasKey);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAiAvailable(false);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsCheckingAiAvailability(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const definition = useMemo(() => diagramDefinitions[selectedType], [selectedType]);
  const effectiveHistoryKey = useMemo(() => historyKey ?? fileName, [historyKey, fileName]);

  const mermaidHistory = useEditorStore(
    (state) => state.mermaidGenerationHistory[effectiveHistoryKey] ?? EMPTY_HISTORY,
  );
  const addHistoryEntry = useEditorStore((state) => state.addMermaidGenerationEntry);
  const updateHistoryEntry = useEditorStore((state) => state.updateMermaidGenerationEntry);

  const selectedHistoryEntry = useMemo<MermaidGenerationHistoryEntry | null>(() => {
    if (!selectedHistoryId) return null;
    return mermaidHistory.find((entry) => entry.id === selectedHistoryId) ?? null;
  }, [mermaidHistory, selectedHistoryId]);

  useEffect(() => {
    if (selectedHistoryEntry) {
      setSelectedType(selectedHistoryEntry.diagramType);
      setPrompt(selectedHistoryEntry.prompt);
      setGeneratedCode(selectedHistoryEntry.mermaidCode);
      setSummary(selectedHistoryEntry.summary ?? '');
      setErrorMessage(null);
    }
  }, [selectedHistoryEntry]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setErrorMessage('生成する内容を入力してください。');
      return;
    }

    if (isAiAvailable === false) {
      setErrorMessage('AI生成機能を利用するには OPENAI_API_KEY を設定してください。');
      return;
    }

    setIsGenerating(true);
    setErrorMessage(null);

    try {
      const response = await requestMermaidGeneration({
        prompt: trimmedPrompt,
        diagramType: selectedType,
      });
      const code = response.mermaidCode;
      if (!code) {
        throw new Error('生成結果が空でした。');
      }

      setGeneratedCode(code);
      setSummary(response.summary ?? '');

      const entry: MermaidGenerationHistoryEntry = {
        id: createId('mermaid_ai'),
        diagramType: response.diagramType ?? selectedType,
        prompt: trimmedPrompt,
        mermaidCode: code,
        summary: response.summary ?? '',
        createdAt: new Date().toISOString(),
      };
      addHistoryEntry(effectiveHistoryKey, entry);
      setSelectedHistoryId(entry.id);
    } catch (error) {
      console.error('Mermaid generation error:', error);
      const message = error instanceof Error ? error.message : 'AI生成に失敗しました。';
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  }, [addHistoryEntry, effectiveHistoryKey, isAiAvailable, prompt, selectedType]);

  const handleApplyGeneratedCode = useCallback(() => {
    if (!generatedCode) {
      setErrorMessage('AI生成されたコードがありません。');
      return;
    }
    onConfirm(selectedType, generatedCode);
    if (selectedHistoryId) {
      updateHistoryEntry(effectiveHistoryKey, selectedHistoryId, {
        appliedAt: new Date().toISOString(),
      });
    }
  }, [effectiveHistoryKey, generatedCode, onConfirm, selectedHistoryId, selectedType, updateHistoryEntry]);

  const handleConfirmTemplate = useCallback(() => {
    onConfirm(selectedType);
  }, [onConfirm, selectedType]);

  if (!isOpen) {
    return null;
  }

  const hasHistory = mermaidHistory.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg w-[36rem] max-w-full">
        <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h3 className="text-lg font-medium">Mermaid テンプレートを選択</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-all">{fileName}</p>
          </div>
          <button
            type="button"
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onCancel}
            aria-label="ダイアログを閉じる"
          >
            <IoCloseOutline size={22} />
          </button>
        </div>

        <div className="p-4 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              図の種類
            </label>
            <select
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-700 dark:text-white"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value as MermaidDiagramType)}
            >
              {diagramList.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{definition.description}</p>
          </div>

          <div className="space-y-3 border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-900">
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  自然言語説明
                </label>
                <textarea
                  className="w-full h-24 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="例: 部署間の承認フローをフローチャートで表現し、主要な意思決定ポイントを強調"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={isGenerating || isCheckingAiAvailability || isAiAvailable === false}
                  className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {isGenerating ? '生成中…' : 'AI生成'}
                </button>
                {!isCheckingAiAvailability && isAiAvailable === false ? (
                  <p className="text-xs text-red-600">
                    環境変数 <code className="font-mono">OPENAI_API_KEY</code> を設定すると AI 生成が利用できます。
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedCode('');
                    setSummary('');
                    setSelectedHistoryId(null);
                    setErrorMessage(null);
                  }}
                  disabled={!generatedCode && !summary}
                  className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  リセット
                </button>
              </div>

              {errorMessage && <p className="text-xs text-red-500">{errorMessage}</p>}
            </div>

            {hasHistory && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">生成履歴</label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-800"
                  value={selectedHistoryId ?? ''}
                  onChange={(event) => setSelectedHistoryId(event.target.value || null)}
                >
                  <option value="">履歴を選択…</option>
                  {mermaidHistory.map((entry) => {
                    const createdAt = new Date(entry.createdAt);
                    const timestamp = Number.isNaN(createdAt.getTime())
                      ? entry.createdAt
                      : createdAt.toLocaleString();
                    return (
                      <option key={entry.id} value={entry.id}>
                        {`${timestamp}｜${entry.diagramType}`}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  過去のプロンプトと生成結果を呼び出して再利用できます。
                </p>
              </div>
            )}

            {summary && (
              <div className="text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md p-3">
                {summary}
              </div>
            )}

            {generatedCode && (
              <div className="space-y-3">
                <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-white dark:bg-gray-900">
                  <MermaidCodePreview code={generatedCode} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">生成されたMermaidコード</label>
                  <pre className="w-full max-h-48 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 p-3 text-xs whitespace-pre-wrap">
                    {generatedCode}
                  </pre>
                </div>
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">テンプレートのプレビュー</p>
            <pre className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md p-3 text-xs overflow-x-auto whitespace-pre">
              {definition.defaultTemplate}
            </pre>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            AI生成結果を採用するか、既定のテンプレートを使用してファイルを作成できます。
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
              onClick={onCancel}
            >
              キャンセル
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
              onClick={handleConfirmTemplate}
            >
              テンプレートで作成
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm text-white bg-purple-600 rounded-md hover:bg-purple-700 disabled:opacity-60"
              onClick={handleApplyGeneratedCode}
              disabled={!generatedCode}
            >
              AI結果で作成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MermaidTemplateDialog;
