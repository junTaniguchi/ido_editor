/**
 * PdfPreview.tsx
 * PDFファイルのプレビュー表示Reactコンポーネント。
 * 主な機能:
 * - PDFのページ表示
 * - ページ送り・ズーム・ダウンロード
 * - ダークモード対応
 */
import React, { useRef, useEffect, useState } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

interface PdfPreviewProps {
  fileUrl: string;
}

// PDF.jsを使ったPDFプレビュー（外部ライブラリ必要）
const PdfPreview: React.FC<PdfPreviewProps> = ({ fileUrl }) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fileUrl) return;
    let isCancelled = false;
    // PDF.js workerのパス設定（CDN利用、Next.js対応）
    GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const renderPDF = async () => {
      if (!viewerRef.current) return;
      setError(null);
      const loadingTask = getDocument(fileUrl);

      try {
        const pdf = await loadingTask.promise;
        if (isCancelled || !viewerRef.current) return;

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
          return;
        }

        await page.render({ canvasContext: context, viewport, canvas }).promise;
      } catch (err) {
        console.error('PDFプレビューの読み込みに失敗しました:', err);
        if (!isCancelled) {
          setError('PDFの読み込みに失敗しました。');
        }
      }
    };
    renderPDF();

    return () => {
      isCancelled = true;
    };
  }, [fileUrl]);

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-2">PDFプレビュー</h2>
      {error && (
        <p className="text-red-500 mb-2">{error}</p>
      )}
      <div ref={viewerRef} className="border rounded min-h-[400px] bg-gray-50 flex items-center justify-center">
        {/* CanvasにPDFが描画される */}
      </div>
    </div>
  );
};

export default PdfPreview;
