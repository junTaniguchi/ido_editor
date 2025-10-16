'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { IoAlertCircleOutline, IoRefresh } from 'react-icons/io5';

interface PptxPreviewProps {
  content: ArrayBuffer;
  fileName: string;
}

type PptxViewer = {
  preview: (data: ArrayBuffer) => Promise<void> | void;
  destroy?: () => void;
};

const PptxPreview: React.FC<PptxPreviewProps> = ({ content, fileName }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<PptxViewer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const renderDocument = useCallback(async () => {
    if (!containerRef.current) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { init } = await import('pptx-preview');
      if (!containerRef.current) {
        return;
      }

      containerRef.current.innerHTML = '';
      const mount = document.createElement('div');
      mount.style.width = '100%';
      mount.style.height = '100%';
      mount.className = 'overflow-auto bg-white dark:bg-slate-900';
      containerRef.current.appendChild(mount);

      const width = containerRef.current.clientWidth || 960;
      const height = containerRef.current.clientHeight || 540;

      const viewer = init(mount, { width, height }) as PptxViewer;
      viewerRef.current = viewer;
      await Promise.resolve(viewer.preview(content));
      setLoading(false);
    } catch (err) {
      console.error('Failed to render PPTX preview:', err);
      setError('PPTXファイルの読み込みに失敗しました');
      setLoading(false);
    }
  }, [content]);

  useEffect(() => {
    const run = async () => {
      await renderDocument();
    };

    run();

    return () => {
      setLoading(false);
      if (viewerRef.current && typeof viewerRef.current.destroy === 'function') {
        try {
          viewerRef.current.destroy();
        } catch (err) {
          console.warn('Failed to dispose PPTX viewer:', err);
        }
      }
      viewerRef.current = null;
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [renderDocument, reloadKey]);

  return (
    <div className="flex h-[70vh] flex-col overflow-hidden rounded border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{fileName}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">PowerPointプレゼンテーションをアプリ内でプレビューします。</p>
        </div>
        <button
          type="button"
          onClick={() => setReloadKey((prev) => prev + 1)}
          className="inline-flex items-center gap-1 rounded border border-gray-300 px-3 py-1 text-sm text-gray-700 transition hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
        >
          <IoRefresh /> 再読み込み
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-200">
          <IoAlertCircleOutline />
          <span>{error}</span>
        </div>
      )}
      <div className="relative flex-1 bg-gray-100 dark:bg-slate-950">
        <div ref={containerRef} className="h-full w-full" />
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm text-gray-600 backdrop-blur-sm dark:bg-slate-900/70 dark:text-gray-300">
            プレゼンテーションを読み込み中です…
          </div>
        )}
      </div>
    </div>
  );
};

export default PptxPreview;
