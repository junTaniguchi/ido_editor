'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoReloadOutline, IoReturnDownForwardOutline } from 'react-icons/io5';

const DEFAULT_URL = 'https://www.google.com/';

const QUICK_LINKS: { label: string; url: string }[] = [
  { label: 'Google', url: 'https://www.google.com/' },
  { label: 'Google Gemini', url: 'https://gemini.google.com/app' },
  { label: 'ChatGPT', url: 'https://chatgpt.com/' },
];

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_URL;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
};

const BrowserPanel: React.FC = () => {
  const [urlInput, setUrlInput] = useState(DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(DEFAULT_URL);
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(() => Date.now());

  const hostLabel = useMemo(() => {
    try {
      const parsed = new URL(currentUrl);
      return parsed.hostname;
    } catch {
      return currentUrl;
    }
  }, [currentUrl]);

  const navigateTo = useCallback((nextUrl: string) => {
    setCurrentUrl(nextUrl);
    setUrlInput(nextUrl);
    setIsLoading(true);
    setIframeKey(Date.now());
  }, []);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      navigateTo(normalizeUrl(urlInput));
    },
    [navigateTo, urlInput],
  );

  const handleQuickLink = useCallback(
    (url: string) => {
      navigateTo(url);
    },
    [navigateTo],
  );

  const handleReload = useCallback(() => {
    setIframeKey(Date.now());
    setIsLoading(true);
  }, []);

  useEffect(() => {
    setIsLoading(true);
  }, [currentUrl]);

  return (
    <div className="flex h-full flex-col bg-gray-50 dark:bg-slate-950">
      <div className="border-b border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-slate-900">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReload}
            className="flex h-9 w-9 items-center justify-center rounded border border-gray-300 text-gray-600 transition hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            title="再読み込み"
            aria-label="再読み込み"
          >
            <IoReloadOutline size={18} />
          </button>
          <input
            className="h-9 flex-1 rounded border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-slate-950 dark:text-gray-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/40"
            value={urlInput}
            onChange={(event) => setUrlInput(event.target.value)}
            placeholder="https://"
            spellCheck={false}
            aria-label="URL入力"
          />
          <button
            type="submit"
            className="flex h-9 items-center gap-1 rounded border border-blue-500 bg-blue-500 px-3 text-sm font-medium text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            <IoReturnDownForwardOutline size={18} />
            開く
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_LINKS.map((link) => (
            <button
              key={link.url}
              type="button"
              onClick={() => handleQuickLink(link.url)}
              className="rounded-full border border-transparent bg-gray-200 px-3 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1 border-b border-gray-200 px-3 py-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">
        <span className="font-medium">現在のサイト: {hostLabel}</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400">
          一部のサイトはセキュリティのため埋め込み表示を許可しておらず、空白になる場合があります。その際はヘッダーのリンクから直接アクセスしてください。
        </span>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <iframe
          key={iframeKey}
          src={currentUrl}
          title="ブラウザビュー"
          className="h-full w-full border-0 bg-white dark:bg-slate-900"
          onLoad={() => setIsLoading(false)}
          allow="clipboard-read; clipboard-write; geolocation *; microphone *; camera *; autoplay *"
        />
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-950/60">
            <div className="rounded-full border border-gray-300 bg-white px-4 py-1 text-sm font-medium text-gray-700 shadow dark:border-gray-700 dark:bg-slate-900 dark:text-gray-200">
              読み込み中...
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserPanel;
