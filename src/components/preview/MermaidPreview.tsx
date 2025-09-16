'use client';

import React, { useEffect, useState, useRef } from 'react';
import { IoDownload, IoCopy, IoAdd, IoRemove, IoExpand } from 'react-icons/io5';

// mermaidの設定を一度だけ初期化
let mermaidInitialized = false;
let mermaidInstance: any = null;

const initializeMermaid = async (retryCount = 0): Promise<any> => {
  if (typeof window !== 'undefined' && !mermaidInitialized) {
    mermaidInitialized = true;
    
    try {
      // 動的にmermaidをインポート（リトライ機能付き）
      const { default: mermaid } = await import('mermaid');
      mermaidInstance = mermaid;
      
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        logLevel: 'error',
        flowchart: { 
          useMaxWidth: false, 
          htmlLabels: true,
          curve: 'basis'
        },
        sequence: {
          useMaxWidth: false,
          diagramMarginX: 50,
          diagramMarginY: 30,
          actorMargin: 50,
          width: 150,
          height: 65,
          boxMargin: 10,
          boxTextMargin: 5,
          noteMargin: 10,
          messageMargin: 35
        },
        gantt: {
          useMaxWidth: false
        },
        er: {
          useMaxWidth: false
        },
        class: {
          useMaxWidth: false
        },
        state: {
          useMaxWidth: false
        },
        pie: {
          useMaxWidth: false
        },
        suppressErrorRendering: true
      });
      
      return mermaid;
    } catch (error) {
      console.error('Mermaid initialization failed:', error);
      
      // 最大3回までリトライ
      if (retryCount < 3) {
        // リトライ時は初期化フラグをリセット
        mermaidInitialized = false;
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒待機
        return initializeMermaid(retryCount + 1);
      }
      
      throw error;
    }
  }
  
  return mermaidInstance;
};

// SVGにパディングを追加して描画範囲を広げる関数
const addPaddingToSvg = (svgString: string): string => {
  try {
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = svgDoc.querySelector('svg');
    
    if (!svgElement) {
      return svgString;
    }
    
    // 現在のviewBoxを取得
    const viewBox = svgElement.getAttribute('viewBox');
    if (viewBox) {
      const [x, y, width, height] = viewBox.split(' ').map(Number);
      
      // パディングを追加（左右に50px、上下に30px）
      const padding = { x: 50, y: 30 };
      const newX = x - padding.x;
      const newY = y - padding.y;
      const newWidth = width + (padding.x * 2);
      const newHeight = height + (padding.y * 2);
      
      svgElement.setAttribute('viewBox', `${newX} ${newY} ${newWidth} ${newHeight}`);
    } else {
      // viewBoxがない場合はwidthとheightを取得してパディングを追加
      const width = svgElement.getAttribute('width');
      const height = svgElement.getAttribute('height');
      
      if (width && height) {
        const w = parseFloat(width.replace('px', ''));
        const h = parseFloat(height.replace('px', ''));
        
        const padding = { x: 50, y: 30 };
        const newWidth = w + (padding.x * 2);
        const newHeight = h + (padding.y * 2);
        
        svgElement.setAttribute('width', `${newWidth}px`);
        svgElement.setAttribute('height', `${newHeight}px`);
        svgElement.setAttribute('viewBox', `${-padding.x} ${-padding.y} ${newWidth} ${newHeight}`);
        
        // 既存のコンテンツをグループ化してパディング分移動
        const content = svgElement.innerHTML;
        svgElement.innerHTML = `<g transform="translate(${padding.x}, ${padding.y})">${content}</g>`;
      }
    }
    
    return svgElement.outerHTML;
  } catch (error) {
    console.error('SVG padding addition failed:', error);
    return svgString;
  }
};

interface MermaidPreviewProps {
  content: string;
  fileName: string;
}

const MermaidPreview: React.FC<MermaidPreviewProps> = ({ content, fileName }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isLoadingMermaid, setIsLoadingMermaid] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCounter = useRef<number>(0);

  useEffect(() => {
    renderDiagram();
  }, [content]);

  const renderDiagram = async () => {
    if (!content || content.trim() === '') {
      setError('図式のコンテンツが空です');
      return;
    }

    setIsRendering(true);
    setError(null);
    setSvg('');

    try {
      // mermaidを初期化（動的インポート）
      setIsLoadingMermaid(true);
      const mermaid = await initializeMermaid();
      setIsLoadingMermaid(false);
      
      if (!mermaid) {
        throw new Error('Mermaidライブラリの読み込みに失敗しました');
      }

      // ユニークIDを生成
      renderCounter.current += 1;
      const id = `mermaid-${Date.now()}-${renderCounter.current}`;
      
      // 一時的なdiv要素を作成
      const tempDiv = document.createElement('div');
      tempDiv.id = id;
      tempDiv.className = 'mermaid';
      tempDiv.style.position = 'absolute';
      tempDiv.style.top = '-9999px';
      tempDiv.style.left = '-9999px';
      tempDiv.style.visibility = 'hidden';
      
      // コンテンツを設定
      tempDiv.textContent = content.trim();
      
      // DOMに追加
      document.body.appendChild(tempDiv);

      try {
        // mermaidでレンダリング
        const { svg: renderedSvg } = await mermaid.render(id + '_svg', content.trim());
        
        if (renderedSvg) {
          // SVGにパディングを追加して描画範囲を広げる
          const enhancedSvg = addPaddingToSvg(renderedSvg);
          setSvg(enhancedSvg);
          setError(null);
        } else {
          throw new Error('SVGの生成に失敗しました');
        }
      } catch (renderError: any) {
        console.error('Mermaid rendering error:', renderError);
        setError(`図式のレンダリングに失敗しました: ${renderError.message || 'Unknown error'}`);
      } finally {
        // 一時要素を削除
        if (tempDiv.parentNode) {
          tempDiv.parentNode.removeChild(tempDiv);
        }
      }
    } catch (generalError: any) {
      console.error('General mermaid error:', generalError);
      setError(`エラーが発生しました: ${generalError.message || 'Unknown error'}`);
    } finally {
      setIsRendering(false);
      setIsLoadingMermaid(false);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.2, 3));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.2, 0.3));
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  const handleDownload = () => {
    if (!svg) return;
    
    try {
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.(mmd|mermaid)$/, '')}_diagram.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      showToastMessage('SVGファイルをダウンロードしました');
    } catch (error) {
      console.error('Download failed:', error);
      showToastMessage('ダウンロードに失敗しました');
    }
  };

  const handleCopy = async () => {
    if (!svg) return;
    
    try {
      await navigator.clipboard.writeText(svg);
      showToastMessage('SVGコードをクリップボードにコピーしました');
    } catch (error) {
      console.error('Copy failed:', error);
      showToastMessage('コピーに失敗しました');
    }
  };

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* ヘッダー */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <div className="flex items-center">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mr-4">
            {fileName}
          </h2>
          {(isRendering || isLoadingMermaid) && (
            <div className="flex items-center text-blue-600 dark:text-blue-400">
              <div className="animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full mr-2"></div>
              <span className="text-sm">
                {isLoadingMermaid ? 'Mermaidライブラリを読み込み中...' : 'レンダリング中...'}
              </span>
            </div>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {/* ズームコントロール */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="縮小"
            >
              <IoRemove size={16} />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[3rem] text-center">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="拡大"
            >
              <IoAdd size={16} />
            </button>
            <button
              onClick={handleZoomReset}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="リセット"
            >
              <IoExpand size={16} />
            </button>
          </div>
          
          {/* アクションボタン */}
          <button
            onClick={handleCopy}
            disabled={!svg}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center"
          >
            <IoCopy className="mr-1" size={16} />
            コピー
          </button>
          <button
            onClick={handleDownload}
            disabled={!svg}
            className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
            <IoDownload className="mr-1" size={16} />
            ダウンロード
          </button>
        </div>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 overflow-auto relative" ref={containerRef} style={{ minHeight: 0 }}>
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-red-500 dark:text-red-400 mb-2">
                ⚠️ レンダリングエラー
              </div>
              <p className="text-red-600 dark:text-red-300 text-sm max-w-md">
                {error}
              </p>
              <button
                onClick={renderDiagram}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                再試行
              </button>
            </div>
          </div>
        )}

        {!error && svg && (
          <div 
            className="p-4 overflow-auto"
            style={{ 
              minWidth: 'max-content',
              minHeight: 'max-content'
            }}
          >
            <div
              className="mermaid-output"
              style={{ 
                transform: `scale(${zoomLevel})`, 
                transformOrigin: 'top left',
                display: 'inline-block',
                minWidth: 'max-content',
                minHeight: 'max-content'
              }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        )}

        {!error && !svg && !isRendering && !isLoadingMermaid && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500 dark:text-gray-400">
              図式を読み込んでいます...
            </p>
          </div>
        )}
        
        {isLoadingMermaid && !error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-gray-500 dark:text-gray-400">
                Mermaidライブラリを読み込んでいます...
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
                初回読み込みには時間がかかる場合があります
              </p>
            </div>
          </div>
        )}
      </div>

      {/* トースト */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default MermaidPreview;
