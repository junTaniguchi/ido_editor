/**
 * HtmlPreview.tsx
 * HTMLテキストのプレビュー表示Reactコンポーネント。
 * - iframe(srcDoc)で安全に描画（スクリプトは無効）
 * - ダーク/ライトテーマに合わせた背景色
 * - 分割表示用にスクロール可能コンテナを提供
 */
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { convertContainerToRtf } from '@/utils/htmlToRtf';

export interface HtmlPreviewProps {
  tabId: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

interface ConsoleLogEntry {
  id: string;
  level: ConsoleLevel;
  messages: string[];
  timestamp: number;
}

const HtmlPreview = forwardRef<HTMLDivElement, HtmlPreviewProps>(({ tabId, onScroll }, ref) => {
  const { tabs, editorSettings } = useEditorStore();
  const tab = tabs.get(tabId);
  const content = tab?.content || '';
  const isDark = editorSettings.theme === 'dark';
  const fontSize = editorSettings.fontSize || 14;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(0);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);
  const [isConsoleOpen, setIsConsoleOpen] = useState<boolean>(false);

  // srcdoc を生成（<html>または<body>が含まれていればそのまま使用）
  const srcDoc = useMemo(() => {
    const serializedTabId = JSON.stringify(tabId);
    const consoleScript = `
      <script>(function(){
        var TAB_ID = ${serializedTabId};
        var METHODS = ['log','info','warn','error','debug'];
        function safeStringify(value){
          if (value === undefined) return 'undefined';
          if (value === null) return 'null';
          if (typeof value === 'string') return value;
          if (typeof value === 'function') return value.toString();
          try { return JSON.stringify(value, null, 2); } catch (error) {
            try { return String(value); } catch (stringError) { return Object.prototype.toString.call(value); }
          }
        }
        function notify(method,args){
          try {
            parent.postMessage({
              __htmlPreviewConsole__: true,
              tabId: TAB_ID,
              method: method,
              messages: Array.prototype.map.call(args, safeStringify),
              timestamp: Date.now()
            }, '*');
          } catch (error) {}
        }
        METHODS.forEach(function(method){
          var original = console[method];
          console[method] = function(){
            notify(method, arguments);
            if (original) {
              return original.apply(console, arguments);
            }
          };
        });
        var originalClear = console.clear;
        console.clear = function(){
          try {
            parent.postMessage({ __htmlPreviewConsole__: true, tabId: TAB_ID, method: 'clear', messages: [], timestamp: Date.now() }, '*');
          } catch (error) {}
          if (originalClear) {
            return originalClear.apply(console, arguments);
          }
        };
        window.addEventListener('error', function(event){
          if (!event) return;
          var message = event.message || 'Unknown error';
          var stack = event.error && event.error.stack ? '\\n' + event.error.stack : '';
          notify('error', [message + stack]);
        });
      })();<\/script>
    `;

    const injectConsoleScript = (html: string) => {
      if (/<\/body\s*>/i.test(html)) {
        return html.replace(/<\/body\s*>/i, `${consoleScript}</body>`);
      }
      if (/<\/html\s*>/i.test(html)) {
        return html.replace(/<\/html\s*>/i, `${consoleScript}</html>`);
      }
      return `${html}${consoleScript}`;
    };

    const hasHtmlTag = /<\s*html[\s>]/i.test(content) || /<\s*body[\s>]/i.test(content);
    if (hasHtmlTag) {
      return injectConsoleScript(content);
    }
    // シンプルなラッパーを付ける
    const bg = isDark ? '#0f172a' : '#ffffff';
    const fg = isDark ? '#e5e7eb' : '#111827';
    const baseCss = `
      body { margin: 0; padding: 1rem; background: ${bg}; color: ${fg}; font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, Noto Sans, \"Apple Color Emoji\", \"Segoe UI Emoji\"; font-size: ${fontSize}px; line-height: 1.6; }
      img { max-width: 100%; height: auto; }
      pre { background: ${isDark ? '#111827' : '#f3f4f6'}; padding: 0.75rem; overflow: auto; }
      code { background: ${isDark ? '#111827' : '#f3f4f6'}; padding: 0.1rem 0.25rem; border-radius: 3px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid ${isDark ? '#374151' : '#d1d5db'}; padding: 0.5rem; text-align: left; }
    `;
    const wrapped = `<!DOCTYPE html><html><head><meta charset=\"utf-8\" />
      <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
      <style>${baseCss}</style></head><body>${content}</body></html>`;
    return injectConsoleScript(wrapped);
  }, [content, fontSize, isDark, tabId]);

  // iframe の高さをコンテンツに合わせる
  const updateIframeHeight = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;
      const body = doc.body;
      const html = doc.documentElement;
      const height = Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        html?.clientHeight || 0,
        html?.scrollHeight || 0,
        html?.offsetHeight || 0
      );
      if (height) {
        setIframeHeight(prev => (Math.abs(prev - height) > 4 ? height : prev));
      }
    } catch (e) {
      // sandbox での制約などがあれば無視
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateIframeHeight, 50);
    return () => clearTimeout(timer);
  }, [srcDoc, updateIframeHeight]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframeWindow = iframeRef.current?.contentWindow;
      if (!iframeWindow || event.source !== iframeWindow) {
        return;
      }

      const data = event.data as {
        __htmlPreviewConsole__?: boolean;
        tabId?: string;
        method?: string;
        messages?: string[];
        timestamp?: number;
      };

      if (!data || !data.__htmlPreviewConsole__ || data.tabId !== tabId) {
        return;
      }

      if (data.method === 'clear') {
        setLogs([]);
        return;
      }

      const allowedLevels: ConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];
      const level = allowedLevels.includes(data.method as ConsoleLevel)
        ? (data.method as ConsoleLevel)
        : 'log';
      const messages = Array.isArray(data.messages) ? data.messages : [];
      const timestamp = typeof data.timestamp === 'number' ? data.timestamp : Date.now();

      setLogs(prevLogs => [
        ...prevLogs,
        {
          id: `${timestamp}-${prevLogs.length + 1}`,
          level,
          messages,
          timestamp,
        },
      ]);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [tabId]);

  useEffect(() => {
    setLogs([]);
  }, [srcDoc]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanupCopyListener: (() => void) | null = null;

    const attachCopyListener = () => {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (!doc) {
          return () => {};
        }

        const handleCopy = (event: ClipboardEvent) => {
          if (!event.clipboardData) return;
          const selection = doc.getSelection();
          if (!selection || selection.rangeCount === 0) return;

          const htmlContainer = doc.createElement('div');
          const rtfContainer = doc.createElement('div');
          rtfContainer.style.cssText =
            'position:fixed;left:-99999px;top:-99999px;opacity:0;pointer-events:none;z-index:-1;';

          let hasContent = false;
          for (let i = 0; i < selection.rangeCount; i += 1) {
            const range = selection.getRangeAt(i);
            const fragment = range.cloneContents();
            const htmlFragment = fragment.cloneNode(true);
            htmlContainer.appendChild(htmlFragment);
            rtfContainer.appendChild(fragment);
            hasContent = true;
          }

          const html = htmlContainer.innerHTML;
          const text = selection.toString();

          if (!hasContent || (!html.trim() && !text.trim())) {
            return;
          }

          event.preventDefault();
          let rtf: string | null = null;

          if (rtfContainer.childNodes.length) {
            try {
              doc.body.appendChild(rtfContainer);
              rtf = convertContainerToRtf(rtfContainer);
            } catch (error) {
              rtf = null;
            } finally {
              if (rtfContainer.parentElement) {
                rtfContainer.parentElement.removeChild(rtfContainer);
              }
            }
          }

          const trimmedHtml = html.trim();
          if (trimmedHtml) {
            event.clipboardData.setData('text/html', trimmedHtml);
          }
          if (rtf && rtf.trim()) {
            event.clipboardData.setData('text/rtf', rtf);
          }
          if (text.trim()) {
            event.clipboardData.setData('text/plain', text);
          }
        };

        doc.addEventListener('copy', handleCopy);

        return () => {
          doc.removeEventListener('copy', handleCopy);
        };
      } catch (error) {
        return () => {};
      }
    };

    const handleLoad = () => {
      cleanupCopyListener?.();
      cleanupCopyListener = attachCopyListener();
      updateIframeHeight();
    };

    iframe.addEventListener('load', handleLoad);
    handleLoad();

    return () => {
      iframe.removeEventListener('load', handleLoad);
      cleanupCopyListener?.();
    };
  }, [srcDoc, updateIframeHeight]);

  const logLevelStyles: Record<ConsoleLevel, string> = {
    log: 'text-gray-900 dark:text-gray-100',
    info: 'text-blue-600 dark:text-blue-400',
    warn: 'text-yellow-700 dark:text-yellow-300',
    error: 'text-red-600 dark:text-red-400',
    debug: 'text-purple-600 dark:text-purple-300',
  };

  const formatTimestamp = (value: number) => {
    try {
      return new Date(value).toLocaleTimeString();
    } catch (error) {
      return '';
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="flex h-full flex-col bg-white text-gray-900 dark:bg-[#0f172a] dark:text-gray-100">
      <div className="flex-1 overflow-auto" ref={ref} onScroll={onScroll}>
        <iframe
          ref={iframeRef}
          title={tab?.name || 'HTML Preview'}
          className="w-full border-0"
          style={{ height: iframeHeight ? `${iframeHeight}px` : '100%', display: 'block' }}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={srcDoc}
          onLoad={updateIframeHeight}
        />
      </div>

      <div className="border-t border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-slate-900/60">
        <div className="flex items-center justify-between px-3 py-2 text-sm">
          <button
            type="button"
            className="flex items-center gap-2 font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-200 dark:hover:text-white"
            onClick={() => setIsConsoleOpen(prev => !prev)}
          >
            {isConsoleOpen ? 'コンソールログを隠す' : 'コンソールログを表示'}
            <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-gray-200 px-1 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-100">
              {logs.length}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-transparent bg-gray-200 px-2 py-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
              onClick={clearLogs}
              disabled={logs.length === 0}
            >
              ログをクリア
            </button>
          </div>
        </div>

        {isConsoleOpen && (
          <div className="max-h-48 overflow-auto border-t border-gray-200 bg-white px-3 pb-3 pt-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-[#0f172a] dark:text-gray-100">
            {logs.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400">ログはまだ出力されていません。</p>
            ) : (
              <ul className="space-y-2">
                {logs.map(log => (
                  <li key={log.id} className="rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-slate-900/70">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className={`font-semibold uppercase ${logLevelStyles[log.level]}`}>{log.level}</span>
                      <span className="text-gray-400 dark:text-gray-500">{formatTimestamp(log.timestamp)}</span>
                    </div>
                    <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-800 dark:text-gray-100">
                      {log.messages.join(' ')}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export default HtmlPreview;
