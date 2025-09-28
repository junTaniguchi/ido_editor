'use client';

import React, { useEffect, useRef, useState } from 'react';
import { IoCloseOutline } from 'react-icons/io5';

interface GitCloneDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onClone: (options: { url: string; directoryName?: string; reference?: string }) => void;
  isCloning?: boolean;
  errorMessage?: string | null;
}

const deriveDirectoryName = (input: string): string => {
  const sanitized = input.trim().replace(/\.git$/i, '');
  if (!sanitized) {
    return '';
  }
  const parts = sanitized.split('/');
  const lastSegment = parts[parts.length - 1] ?? '';
  if (!lastSegment) {
    return '';
  }
  return lastSegment.replace(/[^a-zA-Z0-9._-]/g, '-');
};

const GitCloneDialog: React.FC<GitCloneDialogProps> = ({ isOpen, onCancel, onClone, isCloning = false, errorMessage }) => {
  const [url, setUrl] = useState('');
  const [directoryName, setDirectoryName] = useState('');
  const [reference, setReference] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const urlInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setLocalError(null);
    setUrl('');
    setDirectoryName('');
    setReference('');
    if (urlInputRef.current) {
      urlInputRef.current.focus();
    }
  }, [isOpen]);

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextUrl = event.target.value;
    setUrl(nextUrl);
    if (!directoryName.trim()) {
      setDirectoryName(deriveDirectoryName(nextUrl));
    }
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setLocalError('リポジトリのURLを入力してください');
      return;
    }
    const trimmedDirectory = directoryName.trim();
    onClone({
      url: trimmedUrl,
      directoryName: trimmedDirectory || deriveDirectoryName(trimmedUrl),
      reference: reference.trim() || undefined,
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h2 className="text-lg font-semibold">Git リポジトリをクローン</h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="閉じる"
          >
            <IoCloseOutline size={22} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 px-4 py-5">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">リポジトリURL</label>
              <input
                ref={urlInputRef}
                type="text"
                value={url}
                onChange={handleUrlChange}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="https://github.com/user/repository.git"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">フォルダ名 (任意)</label>
              <input
                type="text"
                value={directoryName}
                onChange={(event) => setDirectoryName(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="未入力の場合はリポジトリ名を使用"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">ブランチ / 参照 (任意)</label>
              <input
                type="text"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                placeholder="main"
              />
            </div>
            {(localError || errorMessage) && (
              <p className="text-sm text-red-600 dark:text-red-400">{localError || errorMessage}</p>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
            <button
              type="button"
              className="rounded px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              onClick={onCancel}
              disabled={isCloning}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isCloning}
            >
              {isCloning ? 'クローン中…' : 'クローン'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GitCloneDialog;
