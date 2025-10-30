'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { IoDownload, IoCopy, IoAdd, IoRemove, IoExpand } from 'react-icons/io5';
import { LuSparkles } from 'react-icons/lu';
import { initializeMermaid } from '@/lib/mermaid/mermaidClient';
import { normalizeMermaidSource } from '@/lib/mermaid/normalize';
import { diagramList } from '@/lib/mermaid/diagramDefinitions';
import type { MermaidDiagramType } from '@/lib/mermaid/types';
import { detectDiagramType } from '@/lib/mermaid/parser';
import { requestMermaidGeneration } from '@/lib/llm/mermaidGenerator';
import { createId } from '@/lib/utils/id';
import { useEditorStore } from '@/store/editorStore';
import MermaidCodePreview from '@/components/mermaid/MermaidCodePreview';
import type { MermaidGenerationHistoryEntry } from '@/types';

const EMPTY_HISTORY: MermaidGenerationHistoryEntry[] = [];

// SVGにパディングを追加して描画範囲を広げる関数
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XLINK_NAMESPACE = 'http://www.w3.org/1999/xlink';
const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/';

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
        const svgNamespace = svgElement.namespaceURI ?? SVG_NAMESPACE;
        const group = svgDoc.createElementNS(svgNamespace, 'g');
        group.setAttribute('transform', `translate(${padding.x}, ${padding.y})`);

        while (svgElement.firstChild) {
          group.appendChild(svgElement.firstChild);
        }

        svgElement.appendChild(group);
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(svgElement);
  } catch (error) {
    console.error('SVG padding addition failed:', error);
    return svgString;
  }
};

interface MermaidPreviewProps {
  content: string;
  fileName: string;
  tabId?: string | null;
  enableAiActions?: boolean;
  historyKey?: string;
}

const MermaidPreview: React.FC<MermaidPreviewProps> = ({
  content,
  fileName,
  tabId,
  enableAiActions = false,
  historyKey,
}) => {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [showToast, setShowToast] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [isLoadingMermaid, setIsLoadingMermaid] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderCounter = useRef<number>(0);

  const defaultDiagramType = useMemo<MermaidDiagramType>(() => {
    try {
      return detectDiagramType(content || '');
    } catch {
      return 'flowchart';
    }
  }, [content]);

  const [isAiPanelOpen, setIsAiPanelOpen] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>('');
  const [aiDiagramType, setAiDiagramType] = useState<MermaidDiagramType>(defaultDiagramType);
  const [aiGeneratedCode, setAiGeneratedCode] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiError, setAiError] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (!isAiPanelOpen) {
      setAiDiagramType(defaultDiagramType);
    }
  }, [defaultDiagramType, isAiPanelOpen]);

  const effectiveHistoryKey = useMemo(() => historyKey ?? (tabId ?? fileName), [historyKey, tabId, fileName]);

  const mermaidHistory = useEditorStore((state) => {
    if (!enableAiActions || !effectiveHistoryKey) {
      return EMPTY_HISTORY;
    }
    return state.mermaidGenerationHistory[effectiveHistoryKey] ?? EMPTY_HISTORY;
  });
  const addHistoryEntry = useEditorStore((state) => state.addMermaidGenerationEntry);
  const updateHistoryEntry = useEditorStore((state) => state.updateMermaidGenerationEntry);
  const updateTabContent = useEditorStore((state) => state.updateTab);
  const getTab = useEditorStore((state) => state.getTab);

  const selectedHistoryEntry = useMemo<MermaidGenerationHistoryEntry | null>(() => {
    if (!selectedHistoryId) return null;
    return mermaidHistory.find((entry) => entry.id === selectedHistoryId) ?? null;
  }, [mermaidHistory, selectedHistoryId]);

  useEffect(() => {
    if (!isAiPanelOpen) {
      setAiPrompt('');
      setAiGeneratedCode('');
      setAiSummary('');
      setAiError(null);
      setSelectedHistoryId(null);
    }
  }, [isAiPanelOpen]);

  useEffect(() => {
    if (selectedHistoryEntry) {
      setAiPrompt(selectedHistoryEntry.prompt);
      setAiDiagramType(selectedHistoryEntry.diagramType);
      setAiGeneratedCode(selectedHistoryEntry.mermaidCode);
      setAiSummary(selectedHistoryEntry.summary ?? '');
      setAiError(null);
    }
  }, [selectedHistoryEntry]);

  useEffect(() => {
    renderDiagram();
  }, [content]);

  const renderDiagram = async () => {
    const normalizedContent = normalizeMermaidSource(content);

    if (!normalizedContent) {
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
      tempDiv.textContent = normalizedContent;

      // DOMに追加
      document.body.appendChild(tempDiv);

      try {
        // mermaidでレンダリング
        const { svg: renderedSvg } = await mermaid.render(
          id + '_svg',
          normalizedContent,
          tempDiv,
        );
        
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

  const handleGenerateAi = useCallback(async () => {
    if (!enableAiActions) {
      return;
    }

    const trimmedPrompt = aiPrompt.trim();
    if (!trimmedPrompt) {
      setAiError('生成する内容を入力してください。');
      return;
    }

    setIsGeneratingAi(true);
    setAiError(null);

    try {
      const response = await requestMermaidGeneration({
        prompt: trimmedPrompt,
        diagramType: aiDiagramType,
        existingCode: content,
      });

      const generatedCode = response.mermaidCode;
      if (!generatedCode) {
        throw new Error('生成結果が空でした。');
      }

      setAiGeneratedCode(generatedCode);
      setAiSummary(response.summary ?? '');

      if (enableAiActions && effectiveHistoryKey) {
        const entry: MermaidGenerationHistoryEntry = {
          id: createId('mermaid_ai'),
          diagramType: response.diagramType ?? aiDiagramType,
          prompt: trimmedPrompt,
          mermaidCode: generatedCode,
          summary: response.summary ?? '',
          createdAt: new Date().toISOString(),
        };
        addHistoryEntry(effectiveHistoryKey, entry);
        setSelectedHistoryId(entry.id);
      }

      showToastMessage('Mermaidコードを生成しました');
    } catch (error) {
      console.error('Mermaid generation error:', error);
      const message = error instanceof Error ? error.message : 'AI生成に失敗しました。';
      setAiError(message);
    } finally {
      setIsGeneratingAi(false);
    }
  }, [addHistoryEntry, aiDiagramType, aiPrompt, content, effectiveHistoryKey, enableAiActions]);

  const handleFixErrorWithAi = useCallback(() => {
    if (!enableAiActions) {
      return;
    }

    setIsAiPanelOpen(true);
    if (error) {
      setAiPrompt((previous) =>
        previous && previous.trim().length > 0
          ? previous
          : `次のMermaidレンダリングエラーを修正してください:\n${error}\n\n修正後のコードを出力してください。`,
      );
    }
  }, [enableAiActions, error]);

  const handleApplyGeneratedCode = useCallback(() => {
    if (!enableAiActions || !aiGeneratedCode || !tabId) {
      return;
    }

    const tab = getTab(tabId);
    updateTabContent(tabId, {
      content: aiGeneratedCode,
      isDirty: aiGeneratedCode !== (tab?.originalContent ?? ''),
    });
    showToastMessage('AI生成結果を適用しました');
    if (effectiveHistoryKey && selectedHistoryId) {
      updateHistoryEntry(effectiveHistoryKey, selectedHistoryId, {
        appliedAt: new Date().toISOString(),
      });
    }
    setIsAiPanelOpen(false);
  }, [aiGeneratedCode, enableAiActions, effectiveHistoryKey, getTab, selectedHistoryId, tabId, updateHistoryEntry, updateTabContent]);

  const handleDiscardGeneratedCode = useCallback(() => {
    setAiGeneratedCode('');
    setAiSummary('');
    setSelectedHistoryId(null);
    setAiError(null);
  }, []);

  const handleSelectHistory = useCallback((entryId: string) => {
    setSelectedHistoryId(entryId || null);
  }, []);

  const canApplyGeneratedCode = enableAiActions && Boolean(aiGeneratedCode && tabId);
  const hasHistory = enableAiActions && mermaidHistory.length > 0;

  const showToastMessage = (message: string) => {
    setToastMessage(message);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  const handleCopyErrorDetails = async () => {
    if (!error) {
      return;
    }

    if (!navigator?.clipboard) {
      showToastMessage('クリップボードAPIが利用できません');
      return;
    }

    try {
      await navigator.clipboard.writeText(error);
      showToastMessage('エラー内容をコピーしました');
    } catch (copyError) {
      console.error('Failed to copy mermaid error message:', copyError);
      showToastMessage('エラー内容のコピーに失敗しました');
    }
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

          {enableAiActions && (
            <button
              onClick={() => setIsAiPanelOpen((prev) => !prev)}
              className={`px-3 py-2 rounded flex items-center gap-1 transition-colors ${
                isAiPanelOpen
                  ? 'bg-purple-600 text-white hover:bg-purple-700'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:hover:bg-purple-900'
              }`}
            >
              <LuSparkles size={16} />
              AI生成
            </button>
          )}

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

      {enableAiActions && isAiPanelOpen && (
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                自然言語説明
              </label>
              <textarea
                className="w-full h-28 border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={aiPrompt}
                onChange={(event) => setAiPrompt(event.target.value)}
                placeholder="例: 営業チームのワークフローをフローチャートで整理し、重要な判断ポイントを強調"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerateAi}
                  disabled={isGeneratingAi}
                  className="px-4 py-2 text-sm rounded-md bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-60"
                >
                  {isGeneratingAi ? '生成中…' : 'AI生成'}
                </button>
                <button
                  type="button"
                  onClick={handleApplyGeneratedCode}
                  disabled={!canApplyGeneratedCode}
                  className="px-4 py-2 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  結果を適用
                </button>
                <button
                  type="button"
                  onClick={handleDiscardGeneratedCode}
                  disabled={!aiGeneratedCode}
                  className="px-4 py-2 text-sm rounded-md bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-60 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                >
                  破棄
                </button>
              </div>
              {aiError && <p className="text-xs text-red-500">{aiError}</p>}
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">図の種類</label>
                <select
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-800"
                  value={aiDiagramType}
                  onChange={(event) => setAiDiagramType(event.target.value as MermaidDiagramType)}
                >
                  {diagramList.map((item) => (
                    <option key={item.type} value={item.type}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              {hasHistory && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">生成履歴</label>
                  <select
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md p-2 text-sm bg-white dark:bg-gray-800"
                    value={selectedHistoryId ?? ''}
                    onChange={(event) => handleSelectHistory(event.target.value)}
                  >
                    <option value="">履歴を選択…</option>
                    {mermaidHistory.map((entry) => {
                      const createdAt = new Date(entry.createdAt);
                      const timestamp = Number.isNaN(createdAt.getTime())
                        ? entry.createdAt
                        : createdAt.toLocaleString();
                      return (
                        <option key={entry.id} value={entry.id}>
                          {`${timestamp}｜${entry.diagramType}`}
                        </option>
                      );
                    })}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    過去のプロンプトと生成結果を呼び出して再利用できます。
                  </p>
                </div>
              )}
            </div>
          </div>

          {aiSummary && (
            <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-md p-3">
              {aiSummary}
            </div>
          )}

          {aiGeneratedCode && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-white dark:bg-gray-900">
                <MermaidCodePreview code={aiGeneratedCode} />
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                  生成されたMermaidコード
                </label>
                <pre className="w-full h-48 overflow-auto border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 p-3 text-xs whitespace-pre-wrap">
                  {aiGeneratedCode}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}

      {/* コンテンツ */}
      <div
        className="flex-1 relative overflow-x-auto overflow-y-auto"
        ref={containerRef}
        style={{ minHeight: 0 }}
      >
        {error && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-red-500 dark:text-red-400 mb-2">
                ⚠️ レンダリングエラー
              </div>
              <p className="text-red-600 dark:text-red-300 text-sm max-w-md">
                {error}
              </p>
              <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <button
                  onClick={renderDiagram}
                  className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  再試行
                </button>
                <button
                  onClick={handleCopyErrorDetails}
                  className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:border-gray-400 hover:text-gray-900 dark:border-gray-600 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:text-white"
                >
                  エラー内容をコピー
                </button>
                {enableAiActions && (
                  <button
                    onClick={handleFixErrorWithAi}
                    className="rounded bg-purple-600 px-4 py-2 text-white hover:bg-purple-700"
                  >
                    AIに修正を依頼
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {!error && svg && (
          <div
            className="p-4"
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
