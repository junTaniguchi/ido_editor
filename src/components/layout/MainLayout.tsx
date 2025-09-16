
/**
 * MainLayout.tsx
 * このファイルは、エディタ・プレビュー・ファイルエクスプローラー・検索・分析などの主要画面レイアウトを構成するReactコンポーネントです。
 * 主な機能:
 * - タブバー・ファイルエクスプローラー・エディタ・プレビュー・検索・分析の表示
 * - パネルの表示切替
 * - 新規ファイル作成ダイアログ
 */
'use client';

import React, { useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import TabBar from '@/components/tabs/TabBar';
import TabBarDnD from '@/components/tabs/TabBarDnD';
import FileExplorer from '@/components/explorer/FileExplorer';
import Editor, { EditorProps } from '@/components/editor/Editor';
import MarkdownPreview, { MarkdownPreviewProps } from '@/components/preview/MarkdownPreview';
import MermaidPreview from '@/components/preview/MermaidPreview';
import DataPreview from '@/components/preview/DataPreview';
import HtmlPreview from '@/components/preview/HtmlPreview';
import DataAnalysis from '@/components/analysis/DataAnalysis';
import MultiFileAnalysis from '@/components/analysis/MultiFileAnalysis';
import SearchPanel from '@/components/search/SearchPanel';
import InputDialog from '@/components/modals/InputDialog';
import { IoMenu, IoSunny, IoMoon, IoSearch, IoAnalytics, IoAddOutline, IoGitMergeOutline } from 'react-icons/io5';
import { createNewFile } from '@/lib/fileSystemUtils';
import { getFileType } from '@/lib/editorUtils';

/**
 * MainLayoutコンポーネント
 * エディタ・プレビュー・ファイルエクスプローラー・検索・分析などの主要画面レイアウトを構成する。
 * - タブバー・ファイルエクスプローラー・エディタ・プレビュー・検索・分析の表示
 * - パネルの表示切替
 * - 新規ファイル作成ダイアログ
 */
const MainLayout = () => {
  const { 
    paneState, 
    updatePaneState, 
    activeTabId, 
    tabs,
    editorSettings,
    updateEditorSettings,
    rootDirHandle,
    addTab,
    addTempTab,
    multiFileAnalysisEnabled,
    setMultiFileAnalysisEnabled,
    selectedFiles
  } = useEditorStore();
  
  // 新規ファイル作成ダイアログの状態
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  
  // パネル表示切り替え
  const togglePane = (pane: keyof typeof paneState) => {
    updatePaneState({ [pane]: !paneState[pane] });
  };
  
  
  // アクティブなタブの取得
  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  // ビューモードの取得
  const { getViewMode } = useEditorStore();
  const activeTabViewMode = activeTabId ? getViewMode(activeTabId) : 'editor';
  const isMarkdown = activeTab?.type === 'markdown' || activeTab?.type === 'md';
  const isMermaid = activeTab?.type === 'mermaid' || activeTab?.type === 'mmd';
  const isHtml = activeTab?.type === 'html';
  const isPreviewableSpecialType = isMarkdown || isMermaid || isHtml;
  const isDataPreviewable = activeTab?.type === 'csv' || activeTab?.type === 'tsv' || 
                          activeTab?.type === 'json' || activeTab?.type === 'yaml' || 
                          activeTab?.type === 'parquet' || activeTab?.type === 'excel';
  const isDataAnalyzable = activeTab?.type === 'csv' || activeTab?.type === 'tsv' || 
                          activeTab?.type === 'json' || activeTab?.type === 'yaml' || 
                          activeTab?.type === 'parquet' || activeTab?.type === 'excel';
  // スクロール同期用
  const editorRef = React.useRef<HTMLDivElement>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);
  const [isScrollSync, setIsScrollSync] = React.useState(false);
  // スクロール同期イベント
  const handleEditorScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isScrollSync || !previewRef.current) return;
    const editorDiv = e.currentTarget;
    const previewDiv = previewRef.current;
    const ratio = editorDiv.scrollTop / (editorDiv.scrollHeight - editorDiv.clientHeight);
    const newScrollTop = ratio * (previewDiv.scrollHeight - previewDiv.clientHeight);
    console.log('[ScrollSync] Editor scroll:', {
      editorScrollTop: editorDiv.scrollTop,
      previewScrollTop: previewDiv.scrollTop,
      ratio,
      newScrollTop
    });
    previewDiv.scrollTop = newScrollTop;
  };
  const handlePreviewScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (!isScrollSync || !editorRef.current) return;
    const previewDiv = e.currentTarget;
    const editorDiv = editorRef.current;
    const ratio = previewDiv.scrollTop / (previewDiv.scrollHeight - previewDiv.clientHeight);
    const newScrollTop = ratio * (editorDiv.scrollHeight - editorDiv.clientHeight);
    console.log('[ScrollSync] Preview scroll:', {
      previewScrollTop: previewDiv.scrollTop,
      editorScrollTop: editorDiv.scrollTop,
      ratio,
      newScrollTop
    });
    editorDiv.scrollTop = newScrollTop;
  };
  
  return (
    <div className="flex flex-col h-screen bg-white text-gray-900">
      {/* ヘッダー */}
      <header className="flex items-center px-4 h-12 bg-white border-b border-gray-300">
        <button 
          className="p-1 mr-2 rounded hover:bg-gray-200"
          onClick={() => togglePane('isExplorerVisible')}
          aria-label="Toggle Explorer"
        >
          <IoMenu size={24} />
        </button>
        <h1 className="text-xl font-semibold flex-1">高機能エディタ</h1>
        {/* フォントサイズ変更UI */}
        <div className="ml-2 flex items-center">
          <label htmlFor="font-size-select" className="text-xs mr-1">フォントサイズ</label>
          <button
            className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs mr-1"
            onClick={() => updateEditorSettings({ fontSize: Math.max(10, editorSettings.fontSize - 1) })}
            title="フォントサイズを小さく"
          >
            −
          </button>
          <span className="text-xs w-10 text-center select-none">{editorSettings.fontSize}px</span>
          <button
            className="px-2 py-0.5 rounded border border-gray-300 bg-white text-xs ml-1"
            onClick={() => updateEditorSettings({ fontSize: Math.min(32, editorSettings.fontSize + 1) })}
            title="フォントサイズを大きく"
          >
            ＋
          </button>
        </div>
        <button 
          className="p-1 rounded hover:bg-gray-200 ml-2"
          onClick={() => setShowNewFileDialog(true)}
          aria-label="Create New File"
        >
          <IoAddOutline size={20} />
        </button>
        <button 
          className="p-1 rounded hover:bg-gray-200 ml-2"
          onClick={() => togglePane('isSearchVisible')}
          aria-label="Toggle Search"
        >
          <IoSearch size={20} />
        </button>
        <button 
          className={`p-1 rounded ml-2 relative ${multiFileAnalysisEnabled ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200'}`}
          onClick={() => setMultiFileAnalysisEnabled(!multiFileAnalysisEnabled)}
          aria-label="Toggle Multi-File Analysis"
          title={`複数ファイル分析モード ${multiFileAnalysisEnabled ? 'ON' : 'OFF'}`}
        >
          <IoGitMergeOutline size={20} />
          {selectedFiles.size > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
              {selectedFiles.size}
            </span>
          )}
        </button>
      </header>
      
      {/* タブバー */}
      <TabBarDnD />
      
      {/* 現在のビューモード表示（デバッグ用） */}
      {activeTab && (
        <div className="bg-gray-100 px-2 py-1 border-b border-gray-300 flex justify-between items-center">
          <div className="text-xs flex items-center">
            <span className="font-medium mr-2">現在のモード:</span>
            <span className={`px-2 py-0.5 rounded ${
              activeTabViewMode === 'editor' ? 'bg-blue-100 text-blue-800' :
              activeTabViewMode === 'preview' ? 'bg-green-100 text-green-800' :
              'bg-purple-100 text-purple-800'
            }`}>
              {activeTabViewMode === 'editor' ? 'エディタ' : 
               activeTabViewMode === 'preview' ? 'プレビュー' : '分割表示'}
            </span>
          </div>
          {(isPreviewableSpecialType || isDataPreviewable) && (
            <div>
              <button 
                className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => {
                  if (activeTabId) {
                    // 次のモードを計算
                    const nextMode = 
                      activeTabViewMode === 'editor' ? 'preview' :
                      activeTabViewMode === 'preview' ? 'split' : 'editor';
                    
                    // モード変更を直接適用
                    useEditorStore.getState().setViewMode(activeTabId, nextMode);
                  }
                }}
              >
                モード切替
              </button>
            </div>
          )}
        </div>
      )}
      
      {/* メインコンテンツ */}
      <div className="flex flex-1 overflow-hidden">
        {/* ファイルエクスプローラ */}
        {paneState.isExplorerVisible && (
          <div className="w-64 flex-shrink-0">
            <FileExplorer />
          </div>
        )}
        
        {/* エディタとプレビュー */}
        <div className="flex-1 flex overflow-hidden">
          
          {/* 検索パネル */}
          {paneState.isSearchVisible && (
            <div className="w-80 flex-shrink-0">
              <SearchPanel />
            </div>
          )}
          
          {/* 複数ファイル分析モードが有効な場合 */}
          {multiFileAnalysisEnabled ? (
            <div className="w-full h-full overflow-hidden">
              <MultiFileAnalysis onClose={() => setMultiFileAnalysisEnabled(false)} />
            </div>
          ) : activeTabId ? (
            <>
              {/* 分析パネルが表示されている場合はそれだけを表示 */}
              {isDataAnalyzable && paneState.isAnalysisVisible ? (
                <div className="w-full h-full overflow-hidden">
                  <DataAnalysis tabId={activeTabId} />
                </div>
              ) : (
                <>
                  {/* 表示モード分岐 */}
                  {isPreviewableSpecialType ? (
                    // Markdown または Mermaid ファイルの表示
                    <>
                      {activeTabViewMode === 'editor' ? (
                        // エディタのみ表示
                        <div className="w-full h-full overflow-hidden">
                          <Editor tabId={activeTabId} />
                        </div>
                      ) : activeTabViewMode === 'preview' ? (
                        // プレビューのみ表示
                        <div className="w-full h-full overflow-hidden">
                          {isMarkdown ? (
                            <MarkdownPreview tabId={activeTabId} />
                          ) : isMermaid && activeTab ? (
                            <div className="h-full w-full overflow-auto">
                              {/* 横スクロールを妨げないよう、幅制限を解除 */}
                              <div className="w-full">
                                <MermaidPreview content={activeTab.content} fileName={activeTab.name} />
                              </div>
                            </div>
                          ) : isHtml ? (
                            <HtmlPreview tabId={activeTabId} />
                          ) : (
                            <DataPreview tabId={activeTabId} />
                          )}
                        </div>
                      ) : (
                        // 分割表示モード (split)
                        <div className="flex w-full h-full overflow-hidden">
                          {/* エディタ部分 */}
                          <div className="w-1/2 h-full overflow-auto border-r border-gray-300 dark:border-gray-700" onScroll={handleEditorScroll}>
                          <Editor tabId={activeTabId} ref={editorRef} onScroll={handleEditorScroll} />
                          </div>
                          {/* プレビュー部分（ボタンを右上に絶対配置） */}
                          <div className="w-1/2 h-full overflow-auto relative" onScroll={handlePreviewScroll}>
                            <button
                              className={`absolute top-2 right-2 z-50 px-3 py-1 rounded border border-gray-400 shadow ${isScrollSync ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-800'}`}
                              onClick={() => setIsScrollSync(v => !v)}
                              title={isScrollSync ? 'スクロール同期ON' : 'スクロール同期OFF'}
                            >
                              {isScrollSync ? '同期ON' : '同期OFF'}
                            </button>
                            {isMarkdown ? (
                              <MarkdownPreview tabId={activeTabId} ref={previewRef} onScroll={handlePreviewScroll} />
                            ) : isMermaid && activeTab ? (
                              <div className="h-full py-2">
                                <div className="w-full mx-auto px-4">
                                  <MermaidPreview content={activeTab.content} fileName={activeTab.name} />
                                </div>
                              </div>
                            ) : isHtml ? (
                              <HtmlPreview tabId={activeTabId} ref={previewRef} onScroll={handlePreviewScroll} />
                            ) : (
                              <DataPreview tabId={activeTabId} />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : isDataPreviewable ? (
                    // CSV, TSV, JSON, YAML, Parquetファイルの表示
                    <>
                      {activeTabViewMode === 'editor' ? (
                        // エディタモード表示
                        <div className="w-full h-full overflow-hidden">
                          <Editor tabId={activeTabId} />
                        </div>
                      ) : activeTabViewMode === 'preview' ? (
                        // プレビューモード表示
                        <div className="w-full h-full overflow-hidden">
                          <DataPreview tabId={activeTabId} />
                        </div>
                      ) : (
                        // 分割表示モード
                        <div className="flex w-full h-full overflow-hidden">
                          <div className="w-1/2 h-full overflow-hidden border-r border-gray-300 dark:border-gray-700">
                            <Editor tabId={activeTabId} />
                          </div>
                          <div className="w-1/2 h-full overflow-hidden">
                            <DataPreview tabId={activeTabId} />
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    // その他のファイルタイプ（エディタのみ表示）
                    <div className="w-full h-full overflow-hidden">
                      <Editor tabId={activeTabId} />
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center w-full text-gray-500">
              <div className="text-center">
                <p className="mb-4">ファイルが開かれていません</p>
                <p className="text-sm">エクスプローラからファイルを選択してください</p>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* フッター */}
      <footer className="h-6 bg-gray-100 dark:bg-gray-800 text-xs px-4 flex items-center border-t border-gray-300 dark:border-gray-700">
        <div className="flex-1">
          {activeTab ? `${activeTab.name}` : 'ファイルが選択されていません'}
        </div>
        <div>
          {editorSettings.theme === 'light' ? 'ライトモード' : 'ダークモード'}
        </div>
      </footer>
      
      {/* 新規ファイル作成ダイアログ */}
      {showNewFileDialog && (
        <InputDialog
          isOpen={showNewFileDialog}
          title="一時ファイル作成"
          label="ファイル名"
          initialValue=""
          showExtensionSelect={true}
          extensions={['md', 'txt', 'json', 'csv', 'tsv', 'yaml', 'html', 'js', 'ts', 'css', 'mmd']}
          validateInput={(value) => {
            if (!value.trim()) {
              return 'ファイル名を入力してください';
            }
            if (value.includes('/') || value.includes('\\')) {
              return 'ファイル名に / や \\ を含めることはできません';
            }
            return null;
          }}
          onConfirm={async (fileName) => {
            setShowNewFileDialog(false);
            
            if (rootDirHandle) {
              try {
                // ルートフォルダが開かれている場合は実際のファイルを作成
                const fileHandle = await createNewFile(rootDirHandle, fileName, '');
                
                if (fileHandle) {
                  // 新しいタブを作成して開く
                  const newTab = {
                    id: fileName,
                    name: fileName,
                    content: '',
                    originalContent: '',
                    isDirty: false,
                    type: getFileType(fileName),
                    isReadOnly: false,
                  };
                  
                  addTab(newTab);
                }
              } catch (error) {
                console.error('Failed to create new file:', error);
                alert(`ファイルの作成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
              }
            } else {
              // ルートフォルダが開かれていない場合は一時ファイルを作成
              // ファイル名から拡張子を抽出
              const parts = fileName.split('.');
              const fileType = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'md';
              
              // 一時ファイルタブを追加
              addTempTab(fileType, fileName);
            }
          }}
          onCancel={() => setShowNewFileDialog(false)}
        />
      )}
    </div>
  );
};

export default MainLayout;
