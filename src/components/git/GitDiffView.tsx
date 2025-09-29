'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { TabData } from '@/types';
import { type GitCommitEntry } from '@/store/gitStore';
import { useEditorStore } from '@/store/editorStore';
import CommitSummary from './CommitSummary';
import {
  buildSideBySideRows,
  getLeftCellClass,
  getRightCellClass,
  SPECIAL_ROW_CLASSES,
  type SideBySideRow,
} from './diffUtils';

interface DiffPayload {
  filePath: string;
  fileName: string;
  diff: string;
  commit: GitCommitEntry | null;
  baseCommit: GitCommitEntry | null;
  compareCommit: GitCommitEntry | null;
  comparisonLabel: string | null;
  historyTabId: string | null;
}

interface GitDiffViewProps {
  tab: TabData;
}

const GitDiffView: React.FC<GitDiffViewProps> = ({ tab }) => {
  const setActiveTabId = useEditorStore((state) => state.setActiveTabId);
  const getTab = useEditorStore((state) => state.getTab);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  const diffData = useMemo<DiffPayload>(() => {
    try {
      const parsed = JSON.parse(tab.content) as Partial<
        DiffPayload & { commit?: GitCommitEntry | null }
      >;
      const commit = parsed.commit ?? null;
      const baseCommit = parsed.baseCommit ?? commit ?? null;
      const compareCommit = parsed.compareCommit ?? null;
      let comparisonLabel: string | null = null;
      if (typeof parsed.comparisonLabel === 'string') {
        comparisonLabel = parsed.comparisonLabel;
      } else if (!compareCommit && commit) {
        comparisonLabel = '作業ツリー';
      }
      const historyTabId = typeof parsed.historyTabId === 'string' ? parsed.historyTabId : null;
      return {
        filePath: parsed.filePath ?? '',
        fileName: parsed.fileName ?? tab.name,
        commit,
        baseCommit,
        compareCommit,
        comparisonLabel,
        diff: parsed.diff ?? '',
        historyTabId,
      };
    } catch {
      return {
        filePath: '',
        fileName: tab.name,
        commit: null,
        baseCommit: null,
        compareCommit: null,
        comparisonLabel: null,
        diff: tab.content,
        historyTabId: null,
      };
    }
  }, [tab.content, tab.name]);

  const diffLines = useMemo(() => diffData.diff.split('\n'), [diffData.diff]);
  const sideBySideRows = useMemo(() => buildSideBySideRows(diffData.diff), [diffData.diff]);

  const hasDiff = diffData.diff.trim().length > 0;
  const canGoBack = Boolean(diffData.historyTabId);
  const isSplitActive = viewMode === 'split' && sideBySideRows.length > 0;
  const effectiveViewMode = isSplitActive ? 'split' : 'unified';

  const handleBack = useCallback(() => {
    if (!diffData.historyTabId) {
      return;
    }
    const historyTab = getTab(diffData.historyTabId);
    if (historyTab) {
      setActiveTabId(diffData.historyTabId);
    } else {
      alert('元の履歴タブが見つかりませんでした。ファイルの履歴を再度開いてください。');
    }
  }, [diffData.historyTabId, getTab, setActiveTabId]);

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
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            {canGoBack && (
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                <span aria-hidden="true">←</span>
                履歴に戻る
              </button>
            )}
            <h2 className="text-sm font-semibold">{diffData.fileName}</h2>
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
        <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">
          {diffData.filePath || 'ファイルパス未指定'}
        </p>
        {(diffData.baseCommit || diffData.compareCommit || diffData.comparisonLabel) && (
          <div className="mt-3 grid gap-3 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
            <CommitSummary title="比較元" commit={diffData.baseCommit} />
            <CommitSummary title="比較先" commit={diffData.compareCommit} label={diffData.comparisonLabel} />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-slate-950 p-4">
        {!hasDiff ? (
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
                    <div
                      className={`border-r border-slate-800/60 px-2 py-1 whitespace-pre-wrap ${getLeftCellClass(row)}`}
                    >
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
    </div>
  );
};

export default GitDiffView;
