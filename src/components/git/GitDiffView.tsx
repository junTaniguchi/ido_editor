'use client';

import React, { useMemo } from 'react';
import { TabData } from '@/types';
import { type GitCommitEntry } from '@/store/gitStore';

interface DiffPayload {
  filePath: string;
  fileName: string;
  diff: string;
  commit: GitCommitEntry | null;
  baseCommit: GitCommitEntry | null;
  compareCommit: GitCommitEntry | null;
  comparisonLabel: string | null;
}

interface CommitSummaryProps {
  title: string;
  commit: GitCommitEntry | null;
  label?: string | null;
}

const CommitSummary: React.FC<CommitSummaryProps> = ({ title, commit, label }) => (
  <div className="rounded border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-slate-800/60">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
    {commit ? (
      <div className="mt-1 space-y-1 text-xs text-gray-600 dark:text-gray-300">
        <p className="break-words font-medium text-gray-700 dark:text-gray-100">{commit.message}</p>
        <p className="break-words">{commit.author}</p>
        <p>{commit.date}</p>
        <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{commit.oid}</p>
      </div>
    ) : label ? (
      <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{label}</p>
    ) : (
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">コミット情報がありません。</p>
    )}
  </div>
);

interface GitDiffViewProps {
  tab: TabData;
}

const GitDiffView: React.FC<GitDiffViewProps> = ({ tab }) => {
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
      return {
        filePath: parsed.filePath ?? '',
        fileName: parsed.fileName ?? tab.name,
        commit,
        baseCommit,
        compareCommit,
        comparisonLabel,
        diff: parsed.diff ?? '',
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
      };
    }
  }, [tab.content, tab.name]);

  const diffLines = useMemo(() => diffData.diff.split('\n'), [diffData.diff]);

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
    if (line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')) {
      return 'text-amber-200';
    }
    return 'text-slate-200';
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white dark:bg-gray-900">
      <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <h2 className="text-sm font-semibold">{diffData.fileName}</h2>
        <p className="mt-1 break-all text-xs text-gray-500 dark:text-gray-400">{diffData.filePath || 'ファイルパス未指定'}</p>
        {(diffData.baseCommit || diffData.compareCommit || diffData.comparisonLabel) && (
          <div className="mt-3 grid gap-3 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2">
            <CommitSummary title="比較元" commit={diffData.baseCommit} />
            <CommitSummary title="比較先" commit={diffData.compareCommit} label={diffData.comparisonLabel} />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto bg-slate-950 p-4">
        {diffData.diff.trim().length === 0 ? (
          <p className="text-sm text-slate-300">差分はありません。</p>
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
