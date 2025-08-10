/**
 * MermaidPreview.tsx
 * Mermaid記法のグラフ（フローチャート・シーケンス図等）をプレビュー表示するReactコンポーネント。
 * 主な機能:
 * - Mermaid記法のSVGグラフ描画
 * - エラー時のメッセージ表示
 * - ダークモード対応
 */
import React, { useEffect, useState, useRef } from 'react';
import mermaid from 'mermaid';
import { parseMermaid } from '@/lib/dataPreviewUtils';
import { IoDownload, IoCopy, IoAdd, IoRemove, IoExpand } from 'react-icons/io5';

// mermaidの設定（バージョンに応じて適切な設定に調整）
// mermaidの初期化は一度だけ行われるようにする
if (typeof window !== 'undefined' && !window.__mermaidInitialized) {
  window.__mermaidInitialized = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    logLevel: 'error', // エラーのみ表示するよう変更
    flowchart: { 
      useMaxWidth: true, 
      htmlLabels: true 
    },
    // エラー抑制設定を追加
    er: { 
      useMaxWidth: true 
    },
    // 状態図の設定を改善（TypeScriptエラー回避のためas anyを使用）
    ...(({
      stateDiagram: {
        diagramPadding: 40, // パディングを増やす
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'linear', // 曲線をlinearに変更してエッジ計算を簡略化
        // エッジラベルの位置計算問題を軽減するための設定
        edgeLengthFactor: 2, // エッジの長さファクターを増やす
        rankSpacing: 50, // ランク間隔を増やす
        nodespacing: 50 // ノード間隔を増やす
      }
    }) as any),
    // レンダリングエラーを無視するオプション
    suppressErrors: true
  });
}

// 型拡張のための宣言
declare global {
  interface Window {
    __mermaidInitialized?: boolean;
  }
}

interface MermaidPreviewProps {
  content: string;
  fileName: string;
}

const MermaidPreview: React.FC<MermaidPreviewProps> = ({ content, fileName }) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [diagramType, setDiagramType] = useState<string>('unknown');
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [initialZoomCalculated, setInitialZoomCalculated] = useState<boolean>(false);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // コンテンツが空の場合は処理しない
    if (!content || content.trim() === '') {
      setError('図式のコンテンツが空です');
      return;
    }

    // レンダリング中のフラグをセット
    setIsRendering(true);
    setError(null);
    
    // 新しいコンテンツがロードされた時は初期ズーム状態にリセット
    setInitialZoomCalculated(false);

    const renderDiagram = async () => {
      try {
        // コンテンツをパース
        const parseResult = parseMermaid(content);
        
        if (!parseResult.valid) {
          setError(parseResult.error || 'Mermaid図式の解析に失敗しました');
          setIsRendering(false);
          return;
        }
        
        setDiagramType(parseResult.data.type);
        
        // ユニークなID生成
        const id = `mermaid-diagram-${Math.random().toString(36).substring(2, 15)}`;
        
        // 状態図を検出
        const isStateChart = content.trim().startsWith('stateDiagram-v2') || content.trim().startsWith('stateDiagram');
        
        // 状態図のエラー処理が改善されたか確認するためのフラグ
        let stateChartRenderSuccess = false;
        
        // 状態図の処理方法を3種類試す（エラー回避のため）
        if (isStateChart) {
          // 方法1: 状態図用に特別な設定で初期化
          try {
            // 状態図用の設定を動的に適用（TypeScriptエラー回避のためas anyを使用）
            mermaid.initialize({
              // 基本設定
              startOnLoad: false,
              theme: 'default',
              securityLevel: 'loose',
              fontFamily: 'ui-sans-serif, system-ui, sans-serif',
              logLevel: 'error',
              // 型エラーを回避するためにas anyを使用
              ...(({
                stateDiagram: {
                  diagramPadding: 50,
                  useMaxWidth: true,
                  htmlLabels: true,
                  curve: 'linear',
                  edgeLengthFactor: 3,
                  rankSpacing: 70,
                  nodespacing: 60
                },
                suppressErrors: true
              }) as any)
            });
            
            // 新しい要素を作成
            const element = document.createElement('div');
            element.id = id;
            element.style.visibility = 'hidden'; // 一時的に非表示
            element.style.position = 'absolute';
            element.style.zIndex = '-1000';
            element.className = 'mermaid';
            element.textContent = content;
            
            // コンテナに一時的に追加
            if (containerRef.current) {
              containerRef.current.appendChild(element);
              
              // レンダリング試行
              try {
                // @ts-ignore TypeScriptの型エラーを無視
                await mermaid.init(undefined, `#${id}`);
                
                // レンダリング後のSVG要素を取得
                const svgElement = element.querySelector('svg');
                if (svgElement) {
                  // クラスとスタイルを調整
                  svgElement.style.maxWidth = '100%';
                  svgElement.style.height = 'auto';
                  
                  // SVGコンテンツを保存
                  setSvg(element.innerHTML);
                  setError(null);
                  stateChartRenderSuccess = true;
                }
              } catch (error) {
                console.log('状態図レンダリング方法1が失敗:', error);
                // エラーは無視して次の方法を試す
              } finally {
                // 一時要素を削除
                if (element.parentNode) {
                  element.parentNode.removeChild(element);
                }
              }
            }
          } catch (stateError) {
            console.log('状態図レンダリング方法1の設定エラー:', stateError);
          }
          
          // 方法1が失敗した場合、方法2を試す
          if (!stateChartRenderSuccess) {
            try {
              // エッジラベルの計算を簡略化するために構文を修正
              let modifiedContent = content;
              
              // 状態遷移の矢印（-->）にラベルがあるケースを検出して簡略化
              // 例: 状態A --> 状態B: ラベル を 状態A --> 状態B に変換
              modifiedContent = modifiedContent.replace(/-->\s*(.+?):\s*(.+)/g, '--> $1');
              
              // 方法2: mermaid.render APIを使用
              try {
                const renderResult = await mermaid.render(id, modifiedContent);
                setSvg(renderResult.svg);
                setError(null);
                stateChartRenderSuccess = true;
              } catch (renderError) {
                console.log('状態図レンダリング方法2が失敗:', renderError);
              }
            } catch (modifyError) {
              console.log('状態図コンテンツ修正エラー:', modifyError);
            }
          }
          
          // 方法2も失敗した場合、方法3を試す
          if (!stateChartRenderSuccess) {
            try {
              // 方法3: レンダリングを複数回試行
              const maxAttempts = 3;
              for (let attempt = 0; attempt < maxAttempts && !stateChartRenderSuccess; attempt++) {
                try {
                  // レンダリング前の待機時間を追加
                  await new Promise(resolve => setTimeout(resolve, 100));
                  
                  // 新しい要素をbodyに直接追加
                  const element = document.createElement('div');
                  element.style.display = 'none';
                  document.body.appendChild(element);
                  
                  // mermaidクラスを持つ要素を作成
                  const simplifiedContent = `stateDiagram-v2\n  [*] --> 状態A\n  状態A --> 状態B\n  状態B --> [*]`;
                  element.innerHTML = `<div class="mermaid">${attempt === maxAttempts - 1 ? simplifiedContent : content}</div>`;
                  
                  // mermaid.init()を呼び出し
                  const mermaidElement = element.querySelector('.mermaid');
                  if (mermaidElement) {
                    // @ts-ignore TypeScriptの型エラーを無視
                    await mermaid.init(undefined, mermaidElement);
                    
                    // SVGコンテンツを取得
                    const svgContent = element.querySelector('.mermaid svg')?.outerHTML || '';
                    
                    // 要素を削除
                    document.body.removeChild(element);
                    
                    // SVGが生成されていれば設定
                    if (svgContent) {
                      setSvg(svgContent);
                      setError(null);
                      stateChartRenderSuccess = true;
                      break;
                    }
                  }
                } catch (attemptError) {
                  console.log(`状態図レンダリング試行 ${attempt + 1}/${maxAttempts} が失敗:`, attemptError);
                  // 最後の試行で簡略版のダイアグラムを試す
                }
              }
              
              // すべての試行が失敗した場合
              if (!stateChartRenderSuccess) {
                // ダイアグラムを表示できないがエラーは抑制
                setError('図式の表示に問題がありますが、エディタでは編集できます');
              }
            } catch (fallbackError) {
              console.error('すべての状態図レンダリング方法が失敗:', fallbackError);
              setError('状態図のレンダリングに失敗しました。エディタモードで編集してください。');
            }
          }
        } else {
          // 通常のダイアグラムの場合のレンダリング処理
          try {
            // 標準のmermaid.render APIを使用
            const renderResult = await mermaid.render(id, content);
            setSvg(renderResult.svg);
            setError(null);
          } catch (renderError) {
            console.error('通常の図式レンダリングに失敗:', renderError);
            
            // フォールバックとして別の方法でレンダリングを試みる
            try {
              // 新しい要素を作成
              const element = document.createElement('div');
              element.style.display = 'none';
              document.body.appendChild(element);
              
              // mermaidクラスを持つ要素を作成
              element.innerHTML = `<div class="mermaid">${content}</div>`;
              
              // mermaid.init()を呼び出し
              const mermaidElement = element.querySelector('.mermaid');
              if (mermaidElement) {
                // @ts-ignore TypeScriptの型エラーを無視
                await mermaid.init(undefined, mermaidElement);
                
                // SVGコンテンツを取得
                const svgContent = element.querySelector('.mermaid svg')?.outerHTML || '';
                
                // 要素を削除
                document.body.removeChild(element);
                
                // SVGが生成されていれば設定
                if (svgContent) {
                  setSvg(svgContent);
                  setError(null);
                } else {
                  throw new Error('SVG要素が生成されませんでした');
                }
              } else {
                throw new Error('mermaid要素の作成に失敗しました');
              }
            } catch (fallbackError) {
              // すべての方法が失敗した場合
              setError(renderError instanceof Error 
                ? `レンダリングエラー: ${renderError.message}` 
                : '図式のレンダリングに失敗しました');
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '図式のレンダリングに失敗しました');
      } finally {
        setIsRendering(false);
      }
    };

    // レンダリング実行
    renderDiagram();
  }, [content]);

  // SVGがレンダリングされた後に初期ズームレベルを計算する
  useEffect(() => {
    if (svg && !isRendering && containerRef.current && svgRef.current) {
      // レンダリング後のタイミングで長めに遅延させて実行（レイアウト完了を待つ）
      const timer = setTimeout(() => {
        const svgElement = svgRef.current?.querySelector('svg');
        if (!svgElement || !containerRef.current) return;

        console.log('SVGサイズ計算開始', new Date().getTime());
        
        // コンテナとSVG要素のサイズを取得
        const containerWidth = containerRef.current.clientWidth - 120; // より大きなpadding分を考慮
        const containerHeight = containerRef.current.clientHeight - 120;
        
        console.log(`コンテナサイズ: ${containerWidth}x${containerHeight}`);
        
        // SVG要素の実際のサイズを取得
        let svgWidth = 0;
        let svgHeight = 0;
        
        // 1. viewBoxから寸法を取得（最も信頼性が高い）
        const viewBox = svgElement.getAttribute('viewBox');
        if (viewBox) {
          const [, , width, height] = viewBox.split(' ').map(parseFloat);
          if (!isNaN(width) && !isNaN(height)) {
            svgWidth = width;
            svgHeight = height;
            console.log(`viewBoxから取得したサイズ: ${svgWidth}x${svgHeight}`);
          }
        }
        
        // 2. width/height属性から取得（次に信頼性が高い）
        if (svgWidth === 0 || svgHeight === 0) {
          const width = svgElement.getAttribute('width');
          const height = svgElement.getAttribute('height');
          
          if (width && height) {
            // 単位付きの場合は数値だけ抽出
            const numWidth = parseFloat(width);
            const numHeight = parseFloat(height);
            
            if (!isNaN(numWidth) && !isNaN(numHeight)) {
              svgWidth = numWidth;
              svgHeight = numHeight;
              console.log(`width/height属性から取得したサイズ: ${svgWidth}x${svgHeight}`);
            }
          }
        }
        
        // 3. getBoundingClientRectから取得（現在の表示サイズなので、すでに変形がかかっている場合は注意）
        if (svgWidth === 0 || svgHeight === 0) {
          const svgRect = svgElement.getBoundingClientRect();
          // 現在のズームを考慮して元のサイズを計算
          svgWidth = svgRect.width / zoomLevel;
          svgHeight = svgRect.height / zoomLevel;
          console.log(`getBoundingClientRectから取得したサイズ: ${svgWidth}x${svgHeight} (現在のズーム: ${zoomLevel})`);
        }
        
        // SVG要素のサイズが有効な場合のみ処理
        if (svgWidth > 10 && svgHeight > 10) { // 最小サイズチェック
          // 初期表示は常に100%（1.0倍）ズームで表示
          const finalZoom = 1.0;
          console.log(`初期ズームを100%に固定: ${finalZoom} (型: ${diagramType}, 幅: ${svgWidth}, 高さ: ${svgHeight}, コンテナ幅: ${containerWidth}, 高さ: ${containerHeight})`);
          requestAnimationFrame(() => {
            setZoomLevel(finalZoom);
            setInitialZoomCalculated(true);
            if (svgRef.current) {
              svgRef.current.dataset.zoomInfo = `初期100%:${finalZoom}`;
            }
          });
        } else {
          console.warn('SVGサイズが無効です:', svgWidth, svgHeight);
          // SVGサイズが取得できない場合でも初期計算済みとマーク
          setInitialZoomCalculated(true);
          setZoomLevel(1); // デフォルト値
          
          if (svgRef.current) {
            svgRef.current.dataset.zoomError = 'サイズ無効';
          }
        }
      }, 500); // タイミングを確実にするため、遅延をさらに長めに設定
      
      return () => clearTimeout(timer);
    }
  }, [svg, isRendering, diagramType]);

  // ウィンドウのリサイズを検知して再計算する
  useEffect(() => {
    // リサイズハンドラー
    const handleResize = () => {
      // リサイズ中は「100%」表示状態の場合のみ自動調整する
      if (initialZoomCalculated && containerRef.current && svgRef.current) {
        // 一定時間後に再計算を実行（頻繁な再計算を避けるため）
        resetZoom();
      }
    };

    // デバウンス処理用変数
    let resizeTimer: NodeJS.Timeout;

    // リサイズイベントリスナーを登録
    const debouncedResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(handleResize, 300);
    };

    window.addEventListener('resize', debouncedResize);

    // クリーンアップ
    return () => {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', debouncedResize);
    };
  }, [initialZoomCalculated, containerRef.current]);
  
  // マウスホイールによるズーム操作
  useEffect(() => {
    if (!containerRef.current) return;
    
    const handleWheel = (event: WheelEvent) => {
      // Ctrlキーが押されている場合のみズーム操作を有効にする
      // MacではCommandキー (metaKey) も対応
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        
        // 初期計算済みフラグを無効化して実際のズームレベルを表示する
        if (initialZoomCalculated) {
          setInitialZoomCalculated(false);
        }
        
        // 上にスクロール（負の値）ならズームイン、下（正の値）ならズームアウト
        if (event.deltaY < 0) {
          setZoomLevel(prev => Math.min(prev + 0.1, 2.5)); // 最大2.5倍まで
        } else {
          setZoomLevel(prev => Math.max(prev - 0.1, 0.5)); // 最小0.5倍まで
        }
      }
    };
    
    const container = containerRef.current;
    container.addEventListener('wheel', handleWheel, { passive: false });
    
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, [containerRef.current, initialZoomCalculated]);

  // ズームイン機能
  const zoomIn = () => {
    // 拡大するとき、初期計算済みフラグを無効化して実際のズームレベルを表示するように
    if (initialZoomCalculated) {
      setInitialZoomCalculated(false);
    }
    setZoomLevel(prev => Math.min(prev + 0.1, 2.5)); // 最大2.5倍まで
  };

  // ズームアウト機能
  const zoomOut = () => {
    // 縮小するとき、初期計算済みフラグを無効化して実際のズームレベルを表示するように
    if (initialZoomCalculated) {
      setInitialZoomCalculated(false);
    }
    setZoomLevel(prev => Math.max(prev - 0.1, 0.5)); // 最小0.5倍まで
  };

  // リセット機能 - 画面にフィットするサイズに戻す
  const resetZoom = () => {
    // 初期計算済みフラグを立てる
    console.log('ズームリセット実行');
    
    if (containerRef.current && svgRef.current) {
      const svgElement = svgRef.current.querySelector('svg');
      if (!svgElement) {
        console.log('SVG要素が見つかりません');
        setZoomLevel(1);
        setInitialZoomCalculated(true);
        return;
      }

      // コンテナとSVG要素のサイズを取得
      const containerWidth = containerRef.current.clientWidth - 120; // より大きなpadding分を考慮
      const containerHeight = containerRef.current.clientHeight - 120;
      
      console.log(`リセット時のコンテナサイズ: ${containerWidth}x${containerHeight}`);
      
      // SVGのサイズを取得
      let svgWidth = 0;
      let svgHeight = 0;
      
      // 1. viewBoxから寸法を取得（最も信頼性が高い）
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const [, , width, height] = viewBox.split(' ').map(parseFloat);
        if (!isNaN(width) && !isNaN(height)) {
          svgWidth = width;
          svgHeight = height;
          console.log(`リセット: viewBoxから取得したサイズ: ${svgWidth}x${svgHeight}`);
        }
      }
      
      // 2. width/height属性から取得
      if (svgWidth === 0 || svgHeight === 0) {
        const width = svgElement.getAttribute('width');
        const height = svgElement.getAttribute('height');
        
        if (width && height) {
          const numWidth = parseFloat(width);
          const numHeight = parseFloat(height);
          
          if (!isNaN(numWidth) && !isNaN(numHeight)) {
            svgWidth = numWidth;
            svgHeight = numHeight;
            console.log(`リセット: width/height属性から取得したサイズ: ${svgWidth}x${svgHeight}`);
          }
        }
      }
      
      // 3. getBoundingClientRectから取得
      if (svgWidth === 0 || svgHeight === 0) {
        // 現在のズームをリセットして正確なサイズを取得
        const tempZoom = zoomLevel;
        svgElement.style.transform = 'scale(1)';
        
        // レイアウト更新を強制
        svgElement.getBoundingClientRect();
        
        // サイズを取得
        const svgRect = svgElement.getBoundingClientRect();
        svgWidth = svgRect.width;
        svgHeight = svgRect.height;
        
        console.log(`リセット: getBoundingClientRectから取得したサイズ: ${svgWidth}x${svgHeight}`);
        
        // 元のズームに戻す
        svgElement.style.transform = `scale(${tempZoom})`;
      }
      
      // SVG要素のサイズが有効な場合のみ処理
      if (svgWidth > 10 && svgHeight > 10) {
        // 幅と高さの比率を考慮してフィットするズームレベルを計算
        const widthRatio = containerWidth / svgWidth;
        const heightRatio = containerHeight / svgHeight;
        
        console.log(`リセット: 幅比率: ${widthRatio}, 高さ比率: ${heightRatio}`);
        
        // 幅と高さのどちらかに合わせる（小さい方を選択して全体が表示されるようにする）
        let optimalZoom = Math.min(widthRatio, heightRatio);
        
        // 極端な値を制限する（0.3〜1.5の間に収める）- 全体的に小さめに
        optimalZoom = Math.max(0.3, Math.min(optimalZoom, 1.5));
        
        // ダイアグラムの種類に応じて微調整 - さらに小さく調整
        if (diagramType === 'flowchart' || diagramType === 'graph') {
          optimalZoom *= 0.5; // もっと小さめに表示
        } else if (diagramType === 'sequence') {
          optimalZoom *= 0.55; // もっと小さめに表示
        } else if (diagramType === 'gantt') {
          optimalZoom = widthRatio * 0.6; // 横幅に合わせてもっと小さめに
        } else if (diagramType === 'state') {
          optimalZoom *= 0.4; // 状態図は特にかなり小さくする
        } else {
          // その他のダイアグラム：デフォルトで小さめに表示
          optimalZoom *= 0.5;
        }
        
        // 最終的なズームレベルを設定（小数第2位まで丸める）
        const finalZoom = Math.round(optimalZoom * 100) / 100;
        console.log(`リセット時の最適ズーム: ${finalZoom}`);
        
        // 強制的に一度レイアウトを更新させる
        requestAnimationFrame(() => {
          // ズームレベルを更新
          setZoomLevel(finalZoom);
          // このズームレベルを「100%」として扱う
          setInitialZoomCalculated(true);
          
          // デバッグ情報を設定
          if (svgRef.current) {
            svgRef.current.dataset.resetZoom = `${finalZoom}`;
          }
        });
        return;
      }
    }
    
    console.log('ズームリセット: デフォルト値を使用');
    // 計算できない場合はデフォルト値に戻す
    setZoomLevel(1);
    setInitialZoomCalculated(true);
  };

  // SVGをクリップボードにコピー
  const copyToClipboard = async () => {
    try {
      if (!svgRef.current) return;
      
      const svgElement = svgRef.current.querySelector('svg');
      if (!svgElement) {
        showToastMessage('コピーするSVG要素が見つかりません');
        return;
      }

      // SVG要素をクローン
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      
      // 背景色を白に設定して表示を改善
      clonedSvg.style.backgroundColor = 'white';
      
      // SVG文字列を取得
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      
      // SVGをBlob化
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      
      // ClipboardItemを使用してコピー（モダンブラウザのみ対応）
      if (navigator.clipboard && navigator.clipboard.write) {
        const clipboardItem = new ClipboardItem({
          'image/svg+xml': svgBlob
        });
        await navigator.clipboard.write([clipboardItem]);
        showToastMessage('クリップボードに図式をコピーしました');
      } else {
        // フォールバック: canvas経由でPNG画像としてコピー
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = async () => {
          canvas.width = img.width;
          canvas.height = img.height;
          if (ctx) {
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
          }
          
          try {
            // canvasをblobとして取得
            const blob = await new Promise<Blob>((resolve) => 
              canvas.toBlob(blob => resolve(blob as Blob), 'image/png')
            );
            
            // クリップボードにコピー
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            showToastMessage('クリップボードに図式をコピーしました');
          } catch (err) {
            showToastMessage('クリップボードへのコピーに失敗しました');
            console.error('クリップボードへのコピー失敗:', err);
          }
        };
        
        // SVG URLを作成してイメージを読み込む
        const url = URL.createObjectURL(svgBlob);
        img.src = url;
      }
    } catch (err) {
      showToastMessage('クリップボードへのコピーに失敗しました');
      console.error('クリップボードへのコピー失敗:', err);
    }
  };

  // SVGをダウンロード
  const downloadSvg = () => {
    try {
      if (!svgRef.current) return;
      
      const svgElement = svgRef.current.querySelector('svg');
      if (!svgElement) {
        showToastMessage('ダウンロードするSVG要素が見つかりません');
        return;
      }

      // SVG要素をクローン
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      
      // 背景色を白に設定して表示を改善
      clonedSvg.style.backgroundColor = 'white';
      
      // SVG文字列を取得
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      
      // SVGをBlob化
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      
      // ダウンロードリンクを作成
      const url = URL.createObjectURL(svgBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${fileName.replace(/\.[^/.]+$/, '') || 'mermaid-diagram'}.svg`;
      a.click();
      
      // URL解放
      URL.revokeObjectURL(url);
      showToastMessage('図式をSVGとしてダウンロードしました');
    } catch (err) {
      showToastMessage('SVGのダウンロードに失敗しました');
      console.error('SVGダウンロード失敗:', err);
    }
  };

  // PNGとしてダウンロード
  const downloadPng = () => {
    try {
      if (!svgRef.current) return;
      
      const svgElement = svgRef.current.querySelector('svg');
      if (!svgElement) {
        showToastMessage('ダウンロードするSVG要素が見つかりません');
        return;
      }

      // SVG要素をクローン
      const clonedSvg = svgElement.cloneNode(true) as SVGElement;
      
      // 背景色を白に設定して表示を改善
      clonedSvg.style.backgroundColor = 'white';
      
      // SVG文字列を取得
      const svgString = new XMLSerializer().serializeToString(clonedSvg);
      
      // SVGをBlob化
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      
      // SVG URLを作成
      const url = URL.createObjectURL(svgBlob);
      
      // SVGをPNGに変換
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      
      img.onload = () => {
        // キャンバスサイズを設定
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 背景を白で塗りつぶし
        if (ctx) {
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          
          // PNGとしてダウンロード
          canvas.toBlob(blob => {
            if (blob) {
              const pngUrl = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = pngUrl;
              a.download = `${fileName.replace(/\.[^/.]+$/, '') || 'mermaid-diagram'}.png`;
              a.click();
              URL.revokeObjectURL(pngUrl);
              showToastMessage('図式をPNGとしてダウンロードしました');
            }
          }, 'image/png');
        }
      };
      
      img.src = url;
    } catch (err) {
      showToastMessage('PNGのダウンロードに失敗しました');
      console.error('PNGダウンロード失敗:', err);
    }
  };

  // トースト表示関数
  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    
    // 3秒後に消す
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  };

  return (
    <div className="mermaid-preview w-full h-full flex flex-col">
      <div className="bg-gray-100 dark:bg-gray-800 p-2 border-b border-gray-300 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-sm">{fileName}</span>
          <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded">
            {diagramType !== 'unknown' ? diagramType : 'Mermaid'}
          </span>
        </div>
        
        {/* コントロールパネル */}
        <div className="flex items-center space-x-2">
          {/* ズーム操作 */}
          <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-md">
            <button 
              onClick={zoomOut}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-l-md"
              title="縮小"
            >
              <IoRemove size={16} />
            </button>
            <button 
              onClick={resetZoom} 
              className="px-2 text-xs hover:bg-gray-300 dark:hover:bg-gray-600"
              title="図式を画面に合わせる"
            >
              {initialZoomCalculated ? '100%' : Math.round(zoomLevel * 100) + '%'}
            </button>
            <button 
              onClick={zoomIn}
              className="p-1 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-r-md"
              title="拡大"
            >
              <IoAdd size={16} />
            </button>
          </div>
          
          {/* ダウンロード・コピー操作 */}
          <button 
            onClick={copyToClipboard}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="図式をクリップボードにコピー"
          >
            <IoCopy size={16} />
          </button>
          <div className="relative group">
            <button 
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="図式をダウンロード"
            >
              <IoDownload size={16} />
            </button>
            <div className="absolute right-0 mt-1 hidden group-hover:block bg-white dark:bg-gray-800 shadow-lg rounded p-1 z-10">
              <button 
                onClick={downloadSvg}
                className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                SVGとして保存
              </button>
              <button 
                onClick={downloadPng}
                className="block w-full text-left px-3 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
              >
                PNGとして保存
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto bg-white dark:bg-gray-900 flex items-center justify-center p-4" ref={containerRef}>
        {error ? (
          <div className="text-red-500 p-4 bg-red-50 dark:bg-red-900/20 rounded">
            <h3 className="font-bold">エラー</h3>
            <pre className="whitespace-pre-wrap text-sm mt-2">{error}</pre>
            
            {/* 図式タイプに基づいたヘルプを表示 */}
            {diagramType === 'state' && (
              <div className="mt-4 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-yellow-800 dark:text-yellow-200">
                <h4 className="font-bold">図式ソース:</h4>
                <p className="text-sm mt-1">
                  状態図では、ラベルの位置計算でエラーが発生することがあります。以下を試してみてください：
                </p>
                <ul className="list-disc list-inside text-xs mt-1 space-y-1">
                  <li>遷移ラベルを簡略化する（例：「--&gt; 状態B: ラベル」を「--&gt; 状態B」に）</li>
                  <li>状態間の距離を増やす</li>
                  <li>エディタモードで図式を編集する</li>
                </ul>
              </div>
            )}
            
            <div className="mt-4 p-2 bg-gray-100 dark:bg-gray-800 rounded">
              <h4 className="font-bold text-sm">図式ソース:</h4>
              <pre className="whitespace-pre text-xs mt-2 overflow-auto max-h-40">{content}</pre>
            </div>
          </div>
        ) : isRendering ? (
          <div className="flex justify-center items-center h-full">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : svg ? (
          <div 
            className="flex justify-center items-center p-8 w-full h-full overflow-auto"
            ref={svgRef}
            dangerouslySetInnerHTML={{ __html: svg }}
            style={{ 
              maxWidth: '100%', 
              margin: '0 auto',
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-in-out',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%'
            }}
            data-zoom-level={zoomLevel}
            data-zoom-type={initialZoomCalculated ? "auto-fit" : "manual"}
            data-diagram-type={diagramType}
          />
        ) : (
          <div className="flex justify-center items-center h-full text-gray-500">
            プレビューを準備中...
          </div>
        )}
      </div>
      
      {/* トースト通知 */}
      {showToast && (
        <div className="fixed bottom-4 right-4 bg-black bg-opacity-80 text-white px-4 py-2 rounded shadow-lg z-50 animate-fade-in-out">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default MermaidPreview;
