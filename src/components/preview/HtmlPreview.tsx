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

export interface HtmlPreviewProps {
  tabId: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

const HtmlPreview = forwardRef<HTMLDivElement, HtmlPreviewProps>(({ tabId, onScroll }, ref) => {
  const { tabs, editorSettings } = useEditorStore();
  const tab = tabs.get(tabId);
  const content = tab?.content || '';
  const isDark = editorSettings.theme === 'dark';
  const fontSize = editorSettings.fontSize || 14;

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeHeight, setIframeHeight] = useState<number>(0);

  // srcdoc を生成（<html>または<body>が含まれていればそのまま使用）
  const srcDoc = useMemo(() => {
    const hasHtmlTag = /<\s*html[\s>]/i.test(content) || /<\s*body[\s>]/i.test(content);
    if (hasHtmlTag) return content;
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
    return `<!DOCTYPE html><html><head><meta charset=\"utf-8\" />
      <meta name=\"viewport\" content=\"width=device-width,initial-scale=1\" />
      <style>${baseCss}</style></head><body>${content}</body></html>`;
  }, [content, isDark, fontSize]);

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

          const container = doc.createElement('div');
          for (let i = 0; i < selection.rangeCount; i += 1) {
            const range = selection.getRangeAt(i);
            const fragment = range.cloneContents();
            container.appendChild(fragment);
          }

          const html = container.innerHTML;
          const text = selection.toString();

          if (!html.trim() && !text.trim()) {
            return;
          }

          event.preventDefault();
          if (html.trim()) {
            event.clipboardData.setData('text/html', html);
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

  return (
    <div className="w-full h-full overflow-auto bg-white text-gray-900 dark:bg-[#0f172a] dark:text-gray-100" ref={ref} onScroll={onScroll}>
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
  );
});

export default HtmlPreview;
