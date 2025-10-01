
/**
 * Editor.tsx
 * このファイルは、CodeMirrorベースのエディタと、Markdown/データ/Mermaidプレビューを切り替えて表示するReactコンポーネントです。
 * 主な機能:
 * - タブごとのエディタ・プレビュー表示
 * - CodeMirrorによるコード編集
 * - Markdown/データ/Mermaidプレビュー
 * - エディタ設定・保存・分析
 */
'use client';

import React, { useEffect, useState, useRef, forwardRef, useCallback } from 'react';
import type { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useEditorStore } from '@/store/editorStore';
import { getLanguageByFileName, getTheme, getEditorExtensions, getFileType } from '@/lib/editorUtils';
import { TabData } from '@/types';
import { IoCodeSlash, IoEye, IoAnalytics, IoSave, IoGrid, IoDownload } from 'react-icons/io5';
import DataPreview from '@/components/preview/DataPreview';
import MarkdownPreview from '@/components/preview/MarkdownPreview';
import HtmlPreview from '@/components/preview/HtmlPreview';
import MermaidPreview from '@/components/preview/MermaidPreview';
import MarkdownEditorExtension from '@/components/markdown/MarkdownEditorExtension';
import ExportModal from '@/components/preview/ExportModal';
import { parseCSV, parseJSON, parseYAML, parseParquet } from '@/lib/dataPreviewUtils';
import { writeFileContent } from '@/lib/fileSystemUtils';
import type { EditorRefValue } from '@/types/editor';
const SUPPORTED_CLIPBOARD_FILE_TYPES = new Set<TabData['type']>([
  'text',
  'markdown',
  'html',
  'json',
  'yaml',
  'sql',
  'csv',
  'tsv',
  'parquet',
  'mermaid',
  'geojson',
  'kml',
  'kmz',
  'shapefile',
  'excel',
  'ipynb',
  'pdf',
]);

const SUPPORTED_PASTED_FILE_TYPES = new Set<TabData['type']>([
  'text',
  'markdown',
  'html',
  'json',
  'yaml',
  'sql',
  'csv',
  'tsv',
  'parquet',
  'mermaid',
  'geojson',
  'kml',
  'kmz',
  'shapefile',
  'excel',
  'ipynb',
  'pdf',
]);

const MIME_FALLBACK_EXTENSION: Record<string, string> = {
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/html': 'html',
  'application/json': 'json',
  'text/csv': 'csv',
  'text/tab-separated-values': 'tsv',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-excel': 'xls',
};

const ensureNamedFile = (file: File, index: number, timestamp: number): File => {
  if (file.name && file.name.trim()) {
    return file;
  }

  const extension = MIME_FALLBACK_EXTENSION[file.type] || 'txt';
  const generatedName = `clipboard-file-${timestamp}-${index}.${extension}`;
  const options: FilePropertyBag = {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified || Date.now(),
  };

  return new File([file], generatedName, options);
};

export interface EditorProps {
  tabId: string;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

/**
 * Editorコンポーネント
 * CodeMirrorベースのエディタと、Markdown/データ/Mermaidプレビューを切り替えて表示する。
 * - タブごとのエディタ・プレビュー表示
 * - CodeMirrorによるコード編集
 * - Markdown/データ/Mermaidプレビュー
 * - エディタ設定・保存・分析
 * @param tabId 編集対象タブID
 * @param onScroll スクロールイベントコールバック
 */
const Editor = forwardRef<HTMLDivElement, EditorProps>(({ tabId, onScroll }, ref) => {
  const { 
    tabs, 
    updateTab, 
    editorSettings, 
    getViewMode,
    setViewMode,
    paneState,
    updatePaneState,
    rootDirHandle
  } = useEditorStore();

  const [currentTab, setCurrentTab] = useState<TabData | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [parsedDataForExport, setParsedDataForExport] = useState<any[] | null>(null);
  const editorRef = useRef<EditorView | null>(null);
  // CodeMirrorのscroller要素をrefで取得
  const codeMirrorScrollerRef = useRef<HTMLDivElement | null>(null);
  const saveShortcutHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    return () => {
      editorRef.current = null;
    };
  }, []);
  
  // テーマ切替時にCodeMirrorのscroller背景色も同期させる
  // 早期returnの前に配置し、フックの順序が変化しないようにする
  useEffect(() => {
    const scroller = codeMirrorScrollerRef.current;
    const isDark = editorSettings.theme === 'dark';
    if (scroller) {
      if (isDark) {
        scroller.style.background = '#1e1e1e';
        scroller.style.color = '#d4d4d4';
      } else {
        // ライトモードは常に白背景で視認性を確保
        scroller.style.background = '#ffffff';
        scroller.style.color = '#222222';
      }
    }
  }, [editorSettings.theme]);
  
  const viewMode = getViewMode(tabId);

  // 初期化時にタブデータを設定
  useEffect(() => {
    const tab = tabs.get(tabId);
    if (tab) {
      setCurrentTab(tab);
      setIsDirty(tab.isDirty);
      setIsInitialized(true);
    }
  }, [tabId, tabs]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    if (viewMode !== 'editor' && viewMode !== 'split') {
      editorRef.current = null;
      return () => {
        disposed = true;
        if (cleanup) {
          cleanup();
        }
      };
    }

    const attachPasteHandler = () => {
      if (disposed) return;
      const editorInstance = editorRef.current;
      if (!editorInstance) {
        requestAnimationFrame(attachPasteHandler);
        return;
      }

      const handleFilePaste = (event: ClipboardEvent) => {
        if (event.defaultPrevented) return;
        if (!event.clipboardData) return;

        const files = Array.from(event.clipboardData.files || []);
        if (files.length === 0) return;

        const hasImages = files.some(file => file.type.startsWith('image/'));
        if (hasImages) {
          return;
        }

        const timestamp = Date.now();
        const normalizedFiles = files.map((file, index) => ensureNamedFile(file, index, timestamp));
        const supportedFiles = normalizedFiles.filter(file => SUPPORTED_PASTED_FILE_TYPES.has(getFileType(file.name)));

        if (supportedFiles.length === 0) {
          return;
        }

        event.preventDefault();

        void (async () => {
          const state = useEditorStore.getState();
          const baseId = Date.now();

          for (let index = 0; index < supportedFiles.length; index += 1) {
            const file = supportedFiles[index];
            const fileType = getFileType(file.name);

            let content = '';
            try {
              if (fileType === 'excel') {
                content = '';
              } else if (fileType === 'pdf') {
                content = URL.createObjectURL(file);
              } else {
                content = await file.text();
              }
            } catch (error) {
              console.error('Failed to read pasted file:', error);
              alert(`ファイルの読み込みに失敗しました: ${file.name}`);
              continue;
            }

            const existingEntry = Array.from(state.tabs.entries()).find(([, tab]) => {
              if (tab.file instanceof File) {
                return (
                  tab.file.name === file.name &&
                  tab.file.size === file.size &&
                  tab.file.lastModified === file.lastModified
                );
              }
              return false;
            });

            if (existingEntry) {
              const [existingId] = existingEntry;
              state.setActiveTabId(existingId);
              state.updateTab(existingId, {
                content,
                originalContent: content,
                isDirty: false,
                file,
                type: fileType,
              });
              continue;
            }

            const generatedId = `clipboard_${baseId}_${index}_${Math.random().toString(36).slice(2, 8)}`;
            const newTab: TabData = {
              id: generatedId,
              name: file.name,
              content,
              originalContent: content,
              isDirty: false,
              type: fileType,
              isReadOnly: false,
              file,
            };

            state.addTab(newTab);
          }
        })();
      };

      editorInstance.contentDOM.addEventListener('paste', handleFilePaste);
      cleanup = () => {
        editorInstance.contentDOM.removeEventListener('paste', handleFilePaste);
      };
    };

    attachPasteHandler();

    return () => {
      disposed = true;
      if (cleanup) {
        cleanup();
      }
      editorRef.current = null;
    };
  }, [tabId, viewMode]);

  // エディタの変更処理
  const handleChange = (value: string) => {
    if (!currentTab) return;

    // 内容が変更されたかチェック
    const newIsDirty = value !== currentTab.originalContent;
    
    // ストアの状態を更新
    updateTab(tabId, {
      content: value,
      isDirty: newIsDirty,
    });
    
    // ローカルの状態も更新
    setIsDirty(newIsDirty);
    setCurrentTab((prev) => {
      if (!prev) return null;
      return { ...prev, content: value, isDirty: newIsDirty };
    });
  };
  
  const toggleViewMode = () => {
    // エディタ → プレビュー → 分割表示 → エディタ の順に切り替え
    let newMode: 'editor' | 'preview' | 'data-preview' | 'split';
    if (viewMode === 'editor') {
      newMode = 'preview';
    } else if (viewMode === 'preview') {
      newMode = 'data-preview';
    } else if (viewMode === 'data-preview') {
      newMode = 'split';
    } else {
      newMode = 'editor';
    }
    
    // 設定前にログ出力（デバッグ用）
    
    // モード変更を適用（editorStoreに保存）
    setViewMode(tabId, newMode);
    
    // 強制的に状態を更新して再レンダリングを促す
    // これによりモード変更が確実に反映されるようにする
    setTimeout(() => {
      const currentMode = getViewMode(tabId);
      
      // ここで強制的にローカル状態も更新
      if (currentTab) {
        setCurrentTab({...currentTab}); // 新しいオブジェクトを作成して再レンダリングを強制
      }
    }, 50);
  };
  
  const toggleAnalysisMode = () => {
    updatePaneState({ isAnalysisVisible: !paneState.isAnalysisVisible });
  };

  // ファイルの保存処理
  const saveFile = useCallback(async () => {
    if (!currentTab || !currentTab.isDirty) {
      return;
    }

    if (currentTab.isReadOnly) {
      alert('このファイルは読み取り専用のため保存できません。');
      return;
    }

    if (typeof currentTab.content !== 'string') {
      alert('このファイル形式の保存には現在対応していません。');
      return;
    }

    const contentToSave = currentTab.content;
    let fileHandle: FileSystemFileHandle | null = null;
    const existingHandle = currentTab.file;

    if (existingHandle && typeof (existingHandle as FileSystemFileHandle).createWritable === 'function') {
      fileHandle = existingHandle as FileSystemFileHandle;
    } else if (rootDirHandle) {
      const candidatePath = currentTab.id && !currentTab.id.startsWith('temp_')
        ? currentTab.id
        : currentTab.name;

      if (candidatePath) {
        const segments = candidatePath.split('/').filter(Boolean);

        if (segments.length > 0) {
          try {
            let directoryHandle: FileSystemDirectoryHandle = rootDirHandle;

            for (let i = 0; i < segments.length - 1; i += 1) {
              directoryHandle = await directoryHandle.getDirectoryHandle(segments[i]);
            }

            const targetFileName = segments[segments.length - 1];
            fileHandle = await directoryHandle.getFileHandle(targetFileName, { create: true });
          } catch (error) {
            console.error('Failed to resolve file handle for saving:', error);
          }
        }
      }
    }

    if (!fileHandle) {
      alert('ファイルの保存先を特定できませんでした。フォルダを開き直してください。');
      return;
    }

    try {
      const didWrite = await writeFileContent(fileHandle, contentToSave);

      if (!didWrite) {
        throw new Error('ファイルの書き込みに失敗しました');
      }

      const latestTab = useEditorStore.getState().tabs.get(tabId);
      const latestContent = latestTab?.content;
      const hasPendingChanges = typeof latestContent === 'string' && latestContent !== contentToSave;

      // タブの状態を更新して保存済みにする
      updateTab(tabId, {
        originalContent: contentToSave,
        isDirty: hasPendingChanges,
        file: fileHandle,
      });

      // ローカルの状態も更新
      setIsDirty(hasPendingChanges);
      setCurrentTab((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          originalContent: contentToSave,
          isDirty: hasPendingChanges,
          file: fileHandle || prev.file,
        };
      });
    } catch (error) {
      console.error('Failed to save file:', error);
      alert(`ファイルの保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
    }
  }, [currentTab, rootDirHandle, tabId, updateTab]);

  useEffect(() => {
    saveShortcutHandlerRef.current = () => {
      void saveFile();
    };
  }, [saveFile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        saveShortcutHandlerRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // エクスポート用のデータ解析処理
  const handleExportButtonClick = async () => {
    if (!currentTab) return;

    try {
      let parsedData: any[] = [];
      const content = currentTab.content;

      switch (currentTab.type) {
        case 'csv':
          const csvResult = parseCSV(content);
          if (csvResult.error) throw new Error(csvResult.error);
          parsedData = csvResult.data || [];
          break;
        case 'tsv':
          const tsvResult = parseCSV(content, '\t');
          if (tsvResult.error) throw new Error(tsvResult.error);
          parsedData = tsvResult.data || [];
          break;
        case 'json':
          const jsonResult = parseJSON(content);
          if (jsonResult.error) throw new Error(jsonResult.error);
          parsedData = Array.isArray(jsonResult.data) ? jsonResult.data : [jsonResult.data];
          break;
        case 'yaml':
          const yamlResult = parseYAML(content);
          if (yamlResult.error) throw new Error(yamlResult.error);
          parsedData = Array.isArray(yamlResult.data) ? yamlResult.data : [yamlResult.data];
          break;
        case 'parquet':
          const parquetResult = await parseParquet(content);
          if (parquetResult.error) throw new Error(parquetResult.error);
          
          if (parquetResult.headers && parquetResult.rows) {
            parsedData = parquetResult.rows.map((row: any[]) => {
              const obj: any = {};
              parquetResult.headers.forEach((header: string, i: number) => {
                obj[header] = row[i] || null;
              });
              return obj;
            });
          } else {
            parsedData = [];
          }
          break;
        default:
          throw new Error('このファイル形式はエクスポートに対応していません');
      }

      if (parsedData.length === 0) {
        throw new Error('エクスポート可能なデータがありません');
      }

      setParsedDataForExport(parsedData);
      setIsExportModalOpen(true);
    } catch (error) {
      console.error('Export data parsing error:', error);
      alert(error instanceof Error ? error.message : 'データの解析に失敗しました');
    }
  };
  
  // タブデータがなければ何も表示しない
  if (!currentTab || !isInitialized) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        ファイルが選択されていません
      </div>
    );
  }
  
  // 対応するファイルタイプかどうかチェック
  const isPreviewable = currentTab.type === 'csv' || currentTab.type === 'tsv' ||
                          currentTab.type === 'json' || currentTab.type === 'yaml' ||
                          currentTab.type === 'parquet' || currentTab.type === 'mermaid' ||
                          currentTab.type === 'markdown' || currentTab.type === 'md' ||
                          currentTab.type === 'mmd' || currentTab.type === 'html';
  const isMarkdownTab = currentTab.type === 'markdown' || currentTab.type === 'md';
  const isMermaidTab = currentTab.type === 'mermaid' || currentTab.type === 'mmd';
  const isHtmlTab = currentTab.type === 'html';
  
  // エディタ設定
  const { theme, fontSize, lineWrapping, rectangularSelection } = editorSettings;
  const isDarkTheme = theme === 'dark';
  const language = getLanguageByFileName(currentTab.name);
  const themeExtension = getTheme(isDarkTheme);
  const extensions = getEditorExtensions(language, themeExtension, currentTab.isReadOnly, lineWrapping, rectangularSelection);
  
  return (
    <div className="h-full flex flex-col">
      {isPreviewable && (
        <div className="p-2 border-b border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
          <div className="flex items-center">
            <span className="font-medium mr-2">エディタモード</span>
            {isDirty && <span className="text-sm text-amber-500 ml-2">(未保存の変更があります)</span>}
          </div>
          <div className="flex items-center">
            {/* データファイルの場合は常に分析モードボタンを保存ボタンの左隣に表示 */}
            {(currentTab.type === 'csv' || currentTab.type === 'tsv' || 
              currentTab.type === 'json' || currentTab.type === 'yaml' || 
              currentTab.type === 'parquet') && (
              <>
                <button
                  className={`px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 mr-2 flex items-center ${paneState.isAnalysisVisible ? 'bg-blue-100 dark:bg-blue-900' : ''}`}
                  onClick={toggleAnalysisMode}
                  title={paneState.isAnalysisVisible ? '分析モードを閉じる' : '分析モードに切り替え'}
                >
                  <IoAnalytics size={20} className="mr-1" /> 分析
                </button>
                <button
                  className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2 flex items-center"
                  onClick={handleExportButtonClick}
                  title="データエクスポート"
                >
                  <IoDownload className="mr-1" size={16} /> エクスポート
                </button>
              </>
            )}
            <button
              className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 mr-2"
              onClick={() => void saveFile()}
              disabled={!isDirty}
            >
              <IoSave className="inline mr-1" /> 保存
            </button>
            {/* 上部にモード切替ボタンがあるため、ここでの切替は削除 */}
          </div>
        </div>
      )}
      <div 
        className={`flex-1 min-h-0 overflow-auto ${isDarkTheme ? '!bg-[#1e1e1e] !text-[#d4d4d4]' : 'bg-white text-gray-900'}`}
        style={{ fontSize: `${fontSize}px` }}
        ref={ref}
        onScroll={onScroll}
      >
        {/* エディタを表示 - split モードの場合もエディタは表示する */}
        {(viewMode === 'editor' || viewMode === 'split') && (
          <div className="h-full flex flex-col">
            {(currentTab.type === 'markdown' || currentTab.type === 'md') && (
              <MarkdownEditorExtension tabId={tabId} editorRef={editorRef} />
            )}
            <CodeMirror
              value={currentTab.content}
              height="100%"
              extensions={extensions}
              onChange={handleChange}
              readOnly={currentTab.isReadOnly}
              className={`h-full ${isDarkTheme ? 'cm-theme-dark' : ''}`}
              basicSetup={{
                lineNumbers: true,
                highlightActiveLineGutter: true,
                highlightActiveLine: true,
                foldGutter: true,
                indentOnInput: true,
                autocompletion: true,
              }}
              // CodeMirrorのscroller要素にrefを付与
              onCreateEditor={editor => {
                editorRef.current = editor;
                // CodeMirror v6: scroller要素は editor.contentDOM.parentElement
                if (editor && editor.contentDOM && editor.contentDOM.parentElement) {
                  codeMirrorScrollerRef.current = editor.contentDOM.parentElement as HTMLDivElement;
                  // forwardRefで受け取ったrefにもscroller要素をセット
                  if (ref && typeof ref === 'object' && ref !== null) {
                    (ref as React.MutableRefObject<HTMLDivElement | null>).current = codeMirrorScrollerRef.current;
                  }
                  // VSCode風ダーク配色をscrollerに直接適用
                  if (isDarkTheme) {
                    codeMirrorScrollerRef.current.style.background = '#1e1e1e';
                    codeMirrorScrollerRef.current.style.color = '#d4d4d4';
                  } else {
                    codeMirrorScrollerRef.current.style.background = '#fff';
                    codeMirrorScrollerRef.current.style.color = '#222';
                  }
                }
              }}
            />
          </div>
        )}
        
        {/* プレビューモードの場合のみプレビュー表示（分割表示はMainLayoutで処理） */}
        {isPreviewable && (viewMode === 'preview' || viewMode === 'data-preview') && (
          <div className="h-full">
            {viewMode === 'data-preview' ? (
              <div className="h-full">
                <DataPreview tabId={tabId} />
              </div>
            ) : isMarkdownTab ? (
              <div className="h-full">
                <MarkdownPreview tabId={tabId} />
              </div>
            ) : isHtmlTab ? (
              <div className="h-full">
                <HtmlPreview tabId={tabId} />
              </div>
            ) : isMermaidTab ? (
              <MermaidPreview
                content={currentTab.content}
                fileName={currentTab.name}
                tabId={tabId}
                enableAiActions
              />
            ) : (
              <div className="h-full">
                <DataPreview tabId={tabId} />
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* ステータスバー */}
      <div className="h-6 bg-gray-100 dark:bg-gray-800 text-xs flex items-center px-2 border-t border-gray-300 dark:border-gray-700">
        <div className="flex-1">
          {currentTab.name} {isDirty ? '(未保存)' : ''}
        </div>
        <div>
          {currentTab.type.toUpperCase()}
        </div>
      </div>
      
      {/* エクスポートモーダル */}
      {isExportModalOpen && parsedDataForExport && parsedDataForExport.length > 0 && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          data={parsedDataForExport}
          fileName={currentTab.name}
        />
      )}
    </div>
  );
});

Editor.displayName = 'Editor';

export default Editor;
