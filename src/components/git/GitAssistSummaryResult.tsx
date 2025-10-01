'use client';

import React from 'react';
import { IoCheckmarkCircleOutline, IoCloseOutline } from 'react-icons/io5';

interface GitAssistSummaryResultProps {
  value: string;
  onChange: (value: string) => void;
  summary: string[];
  warnings: string[];
  onApply?: () => void;
  onClear?: () => void;
  disabled?: boolean;
  loading?: boolean;
}

const GitAssistSummaryResult: React.FC<GitAssistSummaryResultProps> = ({
  value,
  onChange,
  summary,
  warnings,
  onApply,
  onClear,
  disabled,
  loading,
}) => {
  const hasContent = value.trim().length > 0 || summary.length > 0 || warnings.length > 0;

  return (
    <div className="rounded border border-blue-200 bg-blue-50/60 p-3 text-sm shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-blue-900 dark:text-blue-100">AI コミット要約</p>
          <p className="text-xs text-blue-900/70 dark:text-blue-200/80">提案を確認・編集してからコミットメッセージに反映できます。</p>
        </div>
        <div className="flex items-center gap-2">
          {onClear && (
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-900/40"
              onClick={onClear}
              disabled={disabled || (!hasContent && !loading)}
            >
              <IoCloseOutline size={14} />
              クリア
            </button>
          )}
          {onApply && (
            <button
              type="button"
              className="flex items-center gap-1 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onApply}
              disabled={disabled || value.trim().length === 0}
            >
              <IoCheckmarkCircleOutline size={14} />
              反映
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-blue-900/80 dark:text-blue-100">提案されたコミットメッセージ</label>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-20 w-full resize-y rounded border border-blue-200 bg-white px-2 py-1 text-sm text-blue-900 shadow-inner focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-70 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-100 dark:focus:border-blue-400"
            placeholder={loading ? '生成中...' : 'AIによるコミットメッセージの提案がここに表示されます。'}
            disabled={disabled || loading}
          />
        </div>

        {loading && (
          <p className="text-xs text-blue-700 dark:text-blue-200">生成中です。少しお待ちください...</p>
        )}

        {summary.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium text-blue-900/80 dark:text-blue-100">変更概要</p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-blue-900 dark:text-blue-100">
              {summary.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="rounded border border-yellow-300 bg-yellow-100/90 px-2 py-1 text-xs text-yellow-900 dark:border-yellow-900/60 dark:bg-yellow-950/40 dark:text-yellow-100">
            <p className="font-semibold">注意事項</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {warnings.map((warning, index) => (
                <li key={`${warning}-${index}`}>{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {!loading && !hasContent && (
          <p className="text-xs text-blue-800/80 dark:text-blue-200/80">AIにコミット要約を依頼すると結果がここに表示されます。</p>
        )}
      </div>
    </div>
  );
};

export default GitAssistSummaryResult;
