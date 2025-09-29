'use client';

/**
 * PdfPreview.tsx
 * PDFファイルのプレビュー表示Reactコンポーネント。
 * 主な機能:
 * - PDFのページ表示
 * - ページ送り・ズーム・ダウンロード
 * - ダークモード対応
 */

import React, { useRef, useEffect, useState } from 'react';
import {
  GlobalWorkerOptions,
  getDocument,
  type DocumentInitParameters,
  type PDFDocumentLoadingTask,
} from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs';

interface PdfPreviewProps {
  fileUrl: string;
}

// PDF.jsを使ったPDFプレビュー（外部ライブラリ必要）
const PdfPreview: React.FC<PdfPreviewProps> = ({ fileUrl }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }, []);

  useEffect(() => {
    if (!fileUrl) return;
    let isCancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    const renderPDF = async () => {
      if (!viewerRef.current) return;
      setError(null);
      setIsLoading(true);
      let params: string | DocumentInitParameters = fileUrl;

      if (fileUrl.startsWith('data:application/pdf;base64,')) {
        try {
          const [, base64] = fileUrl.split(',');
          if (!base64) {
            throw new Error('base64 data not found');
          }
          params = { data: Uint8Array.from(atob(base64), (char: string) => char.charCodeAt(0)) };
        } catch (conversionError) {
          console.error('PDFデータの変換に失敗しました:', conversionError);
          setError('PDFデータの読み込みに失敗しました。');
          setIsLoading(false);
          return;
        }
      }

      loadingTask = getDocument(params);

      try {
        const pdf = await loadingTask.promise;
        if (isCancelled || !viewerRef.current) {
          await loadingTask.destroy();
          return;
        }

        const page = await pdf.getPage(1); // 1ページ目のみ表示
        const viewport = page.getViewport({ scale: 1.5 });

        let canvas = viewerRef.current.querySelector('canvas');
        if (!canvas) {
          canvas = document.createElement('canvas');
          viewerRef.current.innerHTML = '';
          viewerRef.current.appendChild(canvas);
        }

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        if (!context) {
          setError('PDFの描画に失敗しました。');
          await loadingTask.destroy();
          return;
        }

        await page.render({ canvasContext: context, viewport, canvas }).promise;
        if (!isCancelled) {
          setIsLoading(false);
        }
      } catch (err) {
        console.error('PDFプレビューの読み込みに失敗しました:', err);
        if (!isCancelled) {
          setError('PDFの読み込みに失敗しました。');
          setIsLoading(false);
        }
      }
    };
    renderPDF();

    return () => {
      isCancelled = true;
      setIsLoading(false);
      if (loadingTask) {
        loadingTask.destroy();
      }
      if (viewerRef.current) {
        viewerRef.current.innerHTML = '';
      }
    };
  }, [fileUrl]);

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-2">PDFプレビュー</h2>
      {error && (
        <p className="text-red-500 mb-2">{error}</p>
      )}
      <div className="relative border rounded min-h-[400px] bg-gray-50 dark:bg-gray-900 flex items-center justify-center overflow-auto">
        <div ref={viewerRef} className="w-full flex items-center justify-center p-2">
          {/* CanvasにPDFが描画される */}
        </div>
        {isLoading && !error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-gray-900/70">
            <p className="text-sm text-gray-600 dark:text-gray-300">PDFを読み込み中です…</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfPreview;
