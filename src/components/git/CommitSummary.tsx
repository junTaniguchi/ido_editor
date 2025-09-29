'use client';

import React from 'react';
import type { GitCommitEntry } from '@/store/gitStore';

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

export default CommitSummary;
