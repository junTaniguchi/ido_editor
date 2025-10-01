'use client';

import React, { useMemo, useState } from 'react';
import { IoClipboardOutline, IoCloseOutline, IoWarningOutline } from 'react-icons/io5';

interface GitAssistReviewResultProps {
  value: string;
  onChange: (value: string) => void;
  warnings: string[];
  disabled?: boolean;
  loading?: boolean;
  onClear?: () => void;
}

const GitAssistReviewResult: React.FC<GitAssistReviewResultProps> = ({
  value,
  onChange,
  warnings,
  disabled,
  loading,
  onClear,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const canCopy = useMemo(() => value.trim().length > 0, [value]);

  const handleCopy = async () => {
    if (!canCopy || disabled) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy review comments:', error);
      setCopyState('failed');
      setTimeout(() => setCopyState('idle'), 2500);
    }
  };

  const hasContent = canCopy || warnings.length > 0;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100">AI レビューコメント</p>
          <p className="text-xs text-slate-700 dark:text-slate-300/80">気になる点を箇条書きで提示します。必要に応じて編集してご利用ください。</p>
        </div>
        <div className="flex items-center gap-2">
          {onClear && (
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
              onClick={onClear}
              disabled={disabled || (!hasContent && !loading)}
            >
              <IoCloseOutline size={14} />
              クリア
            </button>
          )}
          <button
            type="button"
            className="flex items-center gap-1 rounded border border-slate-400 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-500 dark:text-slate-200 dark:hover:bg-slate-800"
            onClick={handleCopy}
            disabled={disabled || !canCopy}
          >
            <IoClipboardOutline size={14} />
            コピー
          </button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-200">提案されたレビューコメント</label>
          <textarea
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-28 w-full resize-y rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 shadow-inner focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-slate-400"
            placeholder={loading ? '生成中...' : 'AIによるレビューコメントがここに表示されます。'}
            disabled={disabled || loading}
          />
        </div>

        {loading && <p className="text-xs text-slate-600 dark:text-slate-300">コメントを生成しています...</p>}

        {warnings.length > 0 && (
          <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-100/80 px-2 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-100">
            <IoWarningOutline size={16} className="mt-[2px]" />
            <div>
              <p className="font-semibold">注意事項</p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {copyState === 'copied' && (
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">クリップボードにコピーしました。</p>
        )}
        {copyState === 'failed' && (
          <p className="text-xs font-medium text-rose-600 dark:text-rose-300">コピーに失敗しました。手動で選択してコピーしてください。</p>
        )}

        {!loading && !hasContent && (
          <p className="text-xs text-slate-600 dark:text-slate-300">AIにレビューコメントを依頼すると結果がここに表示されます。</p>
        )}
      </div>
    </div>
  );
};

export default GitAssistReviewResult;
