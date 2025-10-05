'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IoReloadOutline, IoReturnDownForwardOutline } from 'react-icons/io5';
import { DEFAULT_BROWSER_URL, useEditorStore } from '@/store/editorStore';

const DEFAULT_URL = DEFAULT_BROWSER_URL;

const QUICK_LINKS: { label: string; url: string }[] = [
  { label: 'Google', url: DEFAULT_BROWSER_URL },
  { label: 'Google Drive', url: 'https://drive.google.com/drive/u/0/my-drive' },
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

const BLOCKED_HOSTNAMES = new Set<string>(['chatgpt.com', 'gemini.google.com']);

const BLOCKED_HOST_MESSAGES: Record<string, string> = {
  'chatgpt.com':
    'ChatGPT は X-Frame-Options などのポリシーで外部サイトからの埋め込みを禁止しているため、このパネル内では表示できません。',
  'gemini.google.com':
    'Google Gemini は厳格な CSP (Content-Security-Policy) を設定しており、別サイトから iframe で読み込むことができません。',
};

const BrowserPanel: React.FC = () => {
  const browserUrl = useEditorStore((state) => state.browserUrl);
  const setBrowserUrl = useEditorStore((state) => state.setBrowserUrl);
  const [urlInput, setUrlInput] = useState(browserUrl || DEFAULT_URL);
  const [currentUrl, setCurrentUrl] = useState(browserUrl || DEFAULT_URL);
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

  const { isLikelyBlocked, blockedDescription } = useMemo(() => {
    try {
      const { hostname } = new URL(currentUrl);
      if (!BLOCKED_HOSTNAMES.has(hostname)) {
        return { isLikelyBlocked: false, blockedDescription: '' };
      }

      return {
        isLikelyBlocked: true,
        blockedDescription:
          BLOCKED_HOST_MESSAGES[hostname] ??
          'このサイトは埋め込み表示をサポートしていないため、直接アクセスする必要があります。',
      };
    } catch {
      return { isLikelyBlocked: false, blockedDescription: '' };
    }
  }, [currentUrl]);

  useEffect(() => {
    const nextUrl = browserUrl || DEFAULT_URL;
    setCurrentUrl(nextUrl);
    setUrlInput(nextUrl);
    setIsLoading(true);
    setIframeKey(Date.now());
  }, [browserUrl]);

  const navigateTo = useCallback(
    (nextUrl: string) => {
      setBrowserUrl(nextUrl);
    },
    [setBrowserUrl],
  );

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
    if (isLikelyBlocked) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
  }, [currentUrl, isLikelyBlocked]);

  const handleOpenExternally = useCallback(() => {
    if (!currentUrl) {
      return;
    }

    window.open(currentUrl, '_blank', 'noopener,noreferrer');
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
          一部のサイト（ChatGPT や Google Gemini など）はセキュリティポリシーにより iframe での表示が禁止されています。その場合はヘッダーのショートカットまたは「新しいタブで開く」から直接アクセスしてください。
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
        {isLikelyBlocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/90 px-4 text-center text-sm text-gray-700 dark:bg-slate-950/90 dark:text-gray-200">
            <p className="font-medium">このサイトは埋め込み表示が制限されています。</p>
            <p className="max-w-xs text-xs text-gray-500 dark:text-gray-400">
              {blockedDescription ||
                '安全性の理由から iframe 内で読み込めない場合があります。下のボタンからブラウザで開いてください。'}
            </p>
            <button
              type="button"
              onClick={handleOpenExternally}
              className="rounded border border-blue-500 bg-blue-500 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 dark:border-blue-400 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              新しいタブで開く
            </button>
          </div>
        )}
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
