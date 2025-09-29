'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TabData } from '@/types';
import { type GitCommitEntry } from '@/store/gitStore';
import CommitSummary from './CommitSummary';
import {
  buildSideBySideRows,
  getLeftCellClass,
  getRightCellClass,
  SPECIAL_ROW_CLASSES,
} from './diffUtils';

interface CommitDiffFile {
  filePath: string;
  diff: string;
}

interface CommitDiffPayload {
  commit: GitCommitEntry | null;
  parentCommit: GitCommitEntry | null;
  files: CommitDiffFile[];
}

const computeFileStats = (diff: string) => {
  const lines = diff.split('\n');
  let additions = 0;
  let deletions = 0;
  let isBinary = false;

  for (const line of lines) {
    if (line.startsWith('Binary files') || line.startsWith('GIT binary patch')) {
      isBinary = true;
      continue;
    }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }

  return { additions, deletions, isBinary };
};

const GitCommitDiffView: React.FC<{ tab: TabData }> = ({ tab }) => {
  const payload = useMemo<CommitDiffPayload>(() => {
    try {
      const parsed = JSON.parse(tab.content) as Partial<CommitDiffPayload>;
      return {
        commit: parsed.commit ?? null,
        parentCommit: parsed.parentCommit ?? null,
        files: Array.isArray(parsed.files)
          ? parsed.files.filter(
              (file): file is CommitDiffFile =>
                typeof file?.filePath === 'string' && typeof file?.diff === 'string',
            )
          : [],
      };
    } catch (error) {
      console.warn('Failed to parse commit diff payload:', error);
      return { commit: null, parentCommit: null, files: [] };
    }
  }, [tab.content]);

  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(() => payload.files[0]?.filePath ?? null);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  useEffect(() => {
    if (!payload.files.some((file) => file.filePath === selectedFilePath)) {
      setSelectedFilePath(payload.files[0]?.filePath ?? null);
    }
  }, [payload.files, selectedFilePath]);

  const fileStats = useMemo(() => {
    return new Map(payload.files.map((file) => [file.filePath, computeFileStats(file.diff)]));
  }, [payload.files]);

  const selectedFile = useMemo(() => {
    if (!selectedFilePath) {
      return null;
    }
    return payload.files.find((file) => file.filePath === selectedFilePath) ?? null;
  }, [payload.files, selectedFilePath]);

  const diffLines = useMemo(() => (selectedFile ? selectedFile.diff.split('\n') : []), [selectedFile]);
  const sideBySideRows = useMemo(
    () => (selectedFile ? buildSideBySideRows(selectedFile.diff) : []),
    [selectedFile],
  );

  const hasDiff = Boolean(selectedFile && selectedFile.diff.trim().length > 0);
  const isSplitActive = viewMode === 'split' && sideBySideRows.length > 0;
  const effectiveViewMode = isSplitActive ? 'split' : 'unified';

  const lineClasses = (line: string) => {
    if (line.startsWith('+')) {
      return 'bg-emerald-900/40 text-emerald-200';
    }
    if (line.startsWith('-')) {
      return 'bg-rose-900/40 text-rose-200';
    }
    if (line.startsWith('@@')) {
      return 'bg-slate-800 text-sky-300';
    }
    if (
      line.startsWith('diff') ||
      line.startsWith('index') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      return 'text-amber-200';
    }
    if (line.startsWith('\\')) {
      return 'text-slate-400 italic';
    }
    return 'text-slate-200';
  };

  const toggleButtonBase =
    'px-3 py-1 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500';
  const activeToggleClass = 'bg-blue-600 text-white dark:bg-blue-500';
  const inactiveToggleClass =
    'bg-transparent text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

  return (
    <div className="flex h-full overflow-hidden bg-white dark:bg-gray-900">
      <aside className="w-72 border-r border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">変更ファイル</h2>
        {payload.files.length === 0 ? (
          <p className="mt-4 text-xs text-gray-500 dark:text-gray-400">このコミットにファイルの変更はありません。</p>
        ) : (
          <ul className="mt-3 space-y-2 text-sm">
            {payload.files.map((file) => {
              const stats = fileStats.get(file.filePath) ?? { additions: 0, deletions: 0, isBinary: false };
              const isActive = file.filePath === selectedFilePath;
              return (
                <li key={file.filePath}>
                  <button
                    type="button"
                    onClick={() => setSelectedFilePath(file.filePath)}
                    className={`w-full rounded border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      isActive
                        ? 'border-blue-400 bg-blue-50/80 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-200'
                        : 'border-transparent bg-white hover:border-blue-300 hover:bg-blue-50/60 dark:bg-slate-900 dark:hover:border-blue-700/60 dark:hover:bg-blue-900/40'
                    }`}
                  >
                    <p className="break-words text-xs font-medium text-gray-700 dark:text-gray-200">{file.filePath}</p>
                    <div className="mt-1 flex items-center gap-2 text-[11px]">
                      {stats.isBinary ? (
                        <span className="rounded bg-slate-800 px-2 py-[2px] text-slate-200">バイナリ</span>
                      ) : (
                        <>
                          <span className="rounded bg-emerald-900/40 px-2 py-[2px] font-mono text-emerald-200">
                            +{stats.additions}
                          </span>
                          <span className="rounded bg-rose-900/40 px-2 py-[2px] font-mono text-rose-200">
                            -{stats.deletions}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">コミット差分</h3>
              {payload.commit ? (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{payload.commit.message}</p>
              ) : (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">コミット情報がありません。</p>
              )}
              {selectedFile && (
                <p className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                  表示中のファイル: <span className="font-mono text-gray-700 dark:text-gray-200">{selectedFile.filePath}</span>
                </p>
              )}
            </div>
            {hasDiff && (
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  表示
                </span>
                <div className="inline-flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={() => setViewMode('unified')}
                    className={`${toggleButtonBase} ${
                      effectiveViewMode === 'unified' ? activeToggleClass : inactiveToggleClass
                    }`}
                  >
                    ユニファイド
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('split')}
                    disabled={sideBySideRows.length === 0}
                    className={`${toggleButtonBase} ${
                      effectiveViewMode === 'split' ? activeToggleClass : inactiveToggleClass
                    } disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    プレビュー
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="mt-3 grid gap-3 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
            <CommitSummary title="対象コミット" commit={payload.commit} />
            <CommitSummary title="比較元" commit={payload.parentCommit} label={payload.parentCommit ? null : '親コミットがありません'} />
          </div>
        </div>
        <div className="flex-1 overflow-auto bg-slate-950 p-4">
          {!selectedFile ? (
            <p className="text-sm text-slate-300">表示するファイルを選択してください。</p>
          ) : !hasDiff ? (
            <p className="text-sm text-slate-300">差分はありません。</p>
          ) : effectiveViewMode === 'split' ? (
            <div className="space-y-2 text-xs font-mono">
              <div className="grid grid-cols-[3rem_minmax(0,1fr)_3rem_minmax(0,1fr)] overflow-hidden rounded border border-slate-800/70 bg-slate-900/60 text-[11px] uppercase tracking-wide text-slate-300">
                <div className="border-r border-slate-800/70 px-2 py-1 text-right">行</div>
                <div className="border-r border-slate-800/70 px-2 py-1">比較元</div>
                <div className="border-r border-slate-800/70 px-2 py-1 text-right">行</div>
                <div className="px-2 py-1">比較先</div>
              </div>
              <div className="space-y-1">
                {sideBySideRows.map((row, index) => {
                  if (row.type === 'meta' || row.type === 'hunk' || row.type === 'info') {
                    return (
                      <div
                        key={`row-${index}`}
                        className={`rounded border border-slate-800/60 px-3 py-1 text-xs font-mono ${SPECIAL_ROW_CLASSES[row.type]}`}
                      >
                        {row.leftText || row.rightText || ' '}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={`row-${index}`}
                      className="grid grid-cols-[3rem_minmax(0,1fr)_3rem_minmax(0,1fr)] overflow-hidden rounded border border-slate-800/60 bg-slate-900/40"
                    >
                      <div className="border-r border-slate-800/60 px-2 py-1 text-right text-[11px] text-slate-500">
                        {row.leftNumber ?? ''}
                      </div>
                      <div className={`border-r border-slate-800/60 px-2 py-1 whitespace-pre-wrap ${getLeftCellClass(row)}`}>
                        {row.leftText || '\u00A0'}
                      </div>
                      <div className="border-r border-slate-800/60 px-2 py-1 text-right text-[11px] text-slate-500">
                        {row.rightNumber ?? ''}
                      </div>
                      <div className={`px-2 py-1 whitespace-pre-wrap ${getRightCellClass(row)}`}>
                        {row.rightText || '\u00A0'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap text-xs leading-relaxed">
              {diffLines.map((line, index) => (
                <span key={`${index}-${line}`} className={`block rounded px-2 py-[2px] ${lineClasses(line)}`}>
                  {line || ' '}
                </span>
              ))}
            </pre>
          )}
        </div>
      </section>
    </div>
  );
};

export default GitCommitDiffView;
