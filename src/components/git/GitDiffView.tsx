'use client';

import React, { useMemo } from 'react';
import { TabData } from '@/types';
import { type GitCommitEntry } from '@/store/gitStore';

interface DiffPayload {
  filePath: string;
  fileName: string;
  commit: GitCommitEntry | null;
  diff: string;
}

interface GitDiffViewProps {
  tab: TabData;
}

const defaultCommit: GitCommitEntry = {
  oid: '',
  message: '',
  author: '',
  date: '',
};

const GitDiffView: React.FC<GitDiffViewProps> = ({ tab }) => {
  const diffData = useMemo<DiffPayload>(() => {
    try {
      const parsed = JSON.parse(tab.content) as Partial<DiffPayload>;
      return {
        filePath: parsed.filePath ?? '',
        fileName: parsed.fileName ?? tab.name,
        commit: parsed.commit ?? defaultCommit,
        diff: parsed.diff ?? '',
      };
    } catch {
      return { filePath: '', fileName: tab.name, commit: defaultCommit, diff: tab.content };
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
        {diffData.commit && diffData.commit.oid && (
          <div className="mt-2 space-y-1 text-xs text-gray-500 dark:text-gray-400">
            <p className="font-medium text-gray-600 dark:text-gray-300">{diffData.commit.message}</p>
            <p>{diffData.commit.author}</p>
            <p>{diffData.commit.date}</p>
            <p className="font-mono text-[11px] text-gray-500 dark:text-gray-400">{diffData.commit.oid}</p>
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
