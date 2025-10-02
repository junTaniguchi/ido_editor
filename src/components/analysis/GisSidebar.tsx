'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoChevronDown, IoChevronForward, IoDocumentOutline, IoSparkles, IoStatsChartOutline, IoWarningOutline } from 'react-icons/io5';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { useEditorStore } from '@/store/editorStore';
import { useGisAnalysisStore } from '@/store/gisStore';
import { getFileType } from '@/lib/editorUtils';
import type { FileTreeItem } from '@/types';
import type { GisFileType } from '@/lib/gisFileTypes';
import { GIS_FILE_TYPES } from '@/lib/gisFileTypes';
import type { LlmReportResponse } from '@/lib/llm/analysisSummarizer';

interface GisFileEntry {
  path: string;
  name: string;
  fileType: GisFileType;
}

const isSupportedGisType = (value: string): value is GisFileType => {
  return (GIS_FILE_TYPES as readonly string[]).includes(value);
};

const isGisFile = (item: FileTreeItem) => {
  if (item.isDirectory) {
    return false;
  }
  const type = getFileType(item.name);
  return isSupportedGisType(type);
};

const collectGisFiles = (root: FileTreeItem | null): GisFileEntry[] => {
  if (!root) {
    return [];
  }

  const files: GisFileEntry[] = [];
  const stack: FileTreeItem[] = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (current.isDirectory) {
      current.children?.forEach((child) => stack.push(child));
      continue;
    }

    if (isGisFile(current)) {
      const fileType = getFileType(current.name);
      if (isSupportedGisType(fileType)) {
        files.push({
          path: current.path,
          name: current.name,
          fileType: fileType,
        });
      }
    }
  }

  files.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  return files;
};

const GisSidebar: React.FC = () => {
  const rootFileTree = useEditorStore((state) => state.rootFileTree);
  const columnCache = useGisAnalysisStore((state) => state.columnCache);
  const selectedFilePaths = useGisAnalysisStore((state) => state.selectedFilePaths);
  const activeFilePath = useGisAnalysisStore((state) => state.activeFilePath);
  const selectedColumns = useGisAnalysisStore((state) => state.selectedColumns);
  const toggleSelectedFilePath = useGisAnalysisStore((state) => state.toggleSelectedFilePath);
  const setActiveFilePath = useGisAnalysisStore((state) => state.setActiveFilePath);
  const setSelectedColumn = useGisAnalysisStore((state) => state.setSelectedColumn);
  const analysisSummary = useGisAnalysisStore((state) => state.analysisSummary);

  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<LlmReportResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const files = useMemo(() => collectGisFiles(rootFileTree), [rootFileTree]);
  const fileMap = useMemo(() => new Map(files.map((file) => [file.path, file])), [files]);

  useEffect(() => {
    if (!activeFilePath) {
      return;
    }
    setExpandedFiles((previous) => {
      if (previous.has(activeFilePath)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(activeFilePath);
      return next;
    });
  }, [activeFilePath]);

  useEffect(() => {
    if (files.length === 0) {
      setExpandedFiles(new Set());
    }
  }, [files]);

  const toggleFileExpansion = useCallback((path: string) => {
    setExpandedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleSelectColumn = useCallback(
    (path: string, column: string) => {
      setSelectedColumn(path, column);
    },
    [setSelectedColumn],
  );

  const datasetDisplayName = useMemo(() => {
    if (analysisSummary?.metadata.datasetName) {
      return analysisSummary.metadata.datasetName;
    }
    if (!activeFilePath) {
      return null;
    }
    const file = fileMap.get(activeFilePath);
    if (file) {
      return file.name;
    }
    const segments = activeFilePath.split('/').filter(Boolean);
    return segments.length > 0 ? segments[segments.length - 1] : activeFilePath;
  }, [analysisSummary, activeFilePath, fileMap]);

  const canRequestAiInsight = useMemo(() => {
    return Boolean(analysisSummary && analysisSummary.metadata.rowCount > 0);
  }, [analysisSummary]);

  useEffect(() => {
    setAiResult(null);
    setAiError(null);
  }, [analysisSummary]);

  const handleRequestAiInsight = useCallback(async () => {
    if (!analysisSummary || aiLoading) {
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const trimmedPrompt = aiPrompt.trim();
      const response = await fetch('/api/llm/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: analysisSummary,
          customInstruction: trimmedPrompt.length > 0 ? trimmedPrompt : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload) {
        const message =
          payload && typeof payload === 'object' && 'error' in payload && typeof (payload as any).error === 'string'
            ? (payload as { error: string }).error
            : `GIS分析レポートの生成に失敗しました。（${response.status}）`;
        throw new Error(message);
      }

      if (
        typeof payload !== 'object' ||
        payload === null ||
        typeof (payload as Record<string, unknown>).markdown !== 'string' ||
        !Array.isArray((payload as Record<string, unknown>).bulletSummary)
      ) {
        throw new Error('ChatGPTから有効な分析結果を取得できませんでした。');
      }

      setAiResult(payload as LlmReportResponse);
    } catch (error) {
      console.error('GIS sidebar AI analysis error:', error);
      const message = error instanceof Error ? error.message : 'GIS分析レポートの生成に失敗しました。';
      setAiError(message);
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, aiPrompt, analysisSummary]);

  if (files.length === 0) {
    return (
      <div className="flex h-full flex-col bg-gray-50/80 dark:bg-gray-900/40">
        <div className="flex-1 overflow-y-auto p-4 text-sm text-gray-500 dark:text-gray-400">
          GIS対応ファイルが見つかりません。エクスプローラからGeoJSONやKMLなどのファイルを追加してください。
        </div>
        <div className="border-t border-gray-200 bg-white/80 p-4 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <IoSparkles size={16} />
            <span>ChatGPT分析</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
            地図に表示するGISデータを読み込むと、AIが特徴や注目ポイントを解説してくれます。
          </p>
          <p className="mt-2 flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <IoWarningOutline size={14} className="mt-0.5 flex-shrink-0" />
            まずはGeoJSONやShapefileなどの対応データを追加し、地図にプロットしてください。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-gray-50/80 dark:bg-gray-900/40">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-800 dark:text-gray-300">
        GISデータ
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {files.map((file) => {
            const isSelected = selectedFilePaths.includes(file.path);
            const isActive = activeFilePath === file.path;
            const isExpanded = expandedFiles.has(file.path);
            const columns = columnCache[file.path] ?? [];
            const selectedColumn = selectedColumns[file.path] ?? null;
            const showColumns = isExpanded && columns.length > 0;

            return (
              <div key={file.path} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFileExpansion(file.path)}
                    className="rounded p-1 text-gray-500 transition hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label={showColumns ? 'カラム一覧を閉じる' : 'カラム一覧を開く'}
                  >
                    {showColumns ? <IoChevronDown size={16} /> : <IoChevronForward size={16} />}
                  </button>
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={isSelected}
                    onChange={() => toggleSelectedFilePath(file.path)}
                    aria-label={`${file.name} を地図に表示`}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveFilePath(file.path)}
                    className={`flex flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200'
                        : 'hover:bg-gray-200 text-gray-700 dark:hover:bg-gray-800 dark:text-gray-200'
                    }`}
                  >
                    <IoDocumentOutline size={16} />
                    <span className="flex-1 truncate">{file.name}</span>
                    <span className="text-xs uppercase text-gray-400">{file.fileType}</span>
                  </button>
                </div>
                {isSelected && columns.length === 0 && (
                  <div className="ml-7 mt-2 text-xs text-gray-500 dark:text-gray-400">
                    カラム情報は解析が完了すると表示されます。
                  </div>
                )}
                {showColumns && (
                  <ul className="ml-7 mt-2 space-y-1">
                    {columns.map((column) => {
                      const isColumnSelected = column === selectedColumn;
                      return (
                        <li key={`${file.path}:${column}`}>
                          <button
                            type="button"
                            onClick={() => handleSelectColumn(file.path, column)}
                            className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
                              isColumnSelected
                                ? 'bg-blue-500 text-white'
                                : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700'
                            }`}
                          >
                            <IoStatsChartOutline size={14} />
                            <span className="truncate">{column}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="border-t border-gray-200 bg-white/80 p-4 text-xs text-gray-600 dark:border-gray-800 dark:bg-gray-900/60 dark:text-gray-300">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <IoSparkles size={16} />
          <span>ChatGPT分析</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          現在のマップに基づいて、注目ポイントや活用のヒントをAIが要約します。
        </p>

        <div className="mt-3 rounded border border-gray-200 bg-white/70 px-3 py-2 text-[11px] text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-300">
          <div className="text-[11px] font-medium text-gray-700 dark:text-gray-200">対象データ</div>
          <div className="mt-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
            {datasetDisplayName ?? '未選択'}
          </div>
          {analysisSummary && (
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500 dark:text-gray-400">
              <span>行数: {analysisSummary.metadata.rowCount.toLocaleString('ja-JP')}</span>
              <span>列数: {analysisSummary.metadata.columnCount.toLocaleString('ja-JP')}</span>
            </div>
          )}
        </div>

        <label className="mt-3 block text-[11px] font-medium text-gray-600 dark:text-gray-300" htmlFor="gis-sidebar-ai-prompt">
          追加で伝えたいこと（任意）
        </label>
        <textarea
          id="gis-sidebar-ai-prompt"
          value={aiPrompt}
          onChange={(event) => setAiPrompt(event.target.value)}
          rows={3}
          placeholder="例: 特定の自治体ごとの傾向を教えてほしい"
          className="mt-1 w-full rounded border border-gray-200 bg-white p-2 text-[11px] text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:focus:border-blue-400"
        />

        <button
          type="button"
          onClick={() => {
            void handleRequestAiInsight();
          }}
          disabled={!canRequestAiInsight || aiLoading}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300 dark:bg-blue-500 dark:hover:bg-blue-600 dark:disabled:bg-blue-800/60"
        >
          {aiLoading ? (
            <>
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
              生成中...
            </>
          ) : (
            <>
              <IoSparkles size={16} />
              ChatGPTに分析してもらう
            </>
          )}
        </button>

        {!canRequestAiInsight && !aiLoading && (
          <p className="mt-2 flex items-start gap-2 text-[11px] text-gray-500 dark:text-gray-400">
            <IoWarningOutline size={14} className="mt-0.5 flex-shrink-0" />
            地図にデータをプロットすると分析を依頼できます。対応ファイルを選択し、表示を確認してください。
          </p>
        )}

        {aiError && (
          <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-300">
            {aiError}
          </div>
        )}

        {aiResult && (
          <div className="mt-4 space-y-3">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">要点</h3>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-gray-700 dark:text-gray-200">
                {aiResult.bulletSummary.map((item, index) => (
                  <li key={`gis-sidebar-ai-bullet-${index}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">Markdownレポート</h3>
              <div className="mt-2 max-h-48 overflow-y-auto rounded border border-gray-200 bg-white p-3 text-[11px] leading-relaxed text-gray-800 shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiResult.markdown}</ReactMarkdown>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GisSidebar;
