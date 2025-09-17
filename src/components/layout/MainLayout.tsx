/**
 * MainLayout.tsx
 * エディタ全体の骨格を構成するコンテナコンポーネント。
 * ヘッダー・タブバー・ワークスペース・各種モーダルの連携を担う。
 */
'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import TabBarDnD from '@/components/tabs/TabBarDnD';
import InputDialog from '@/components/modals/InputDialog';
import MainHeader from '@/components/layout/MainHeader';
import ViewModeBanner from '@/components/layout/ViewModeBanner';
import Workspace from '@/components/layout/Workspace';
import { createNewFile } from '@/lib/fileSystemUtils';
import { getFileType } from '@/lib/editorUtils';

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
    selectedFiles,
    getViewMode,
    setViewMode,
  } = useEditorStore();

  const [showNewFileDialog, setShowNewFileDialog] = useState(false);

  const activeTab = activeTabId ? tabs.get(activeTabId) : null;
  const activeTabViewMode = activeTabId ? getViewMode(activeTabId) : 'editor';

  const fileTypeFlags = useMemo(() => {
    const type = activeTab?.type?.toLowerCase();
    const isMarkdown = type === 'markdown' || type === 'md';
    const isMermaid = type === 'mermaid' || type === 'mmd';
    const isHtml = type === 'html';
    const isDataPreviewable =
      type === 'csv' ||
      type === 'tsv' ||
      type === 'json' ||
      type === 'yaml' ||
      type === 'parquet' ||
      type === 'excel';

    return {
      isMarkdown,
      isMermaid,
      isHtml,
      isPreviewableSpecialType: isMarkdown || isMermaid || isHtml,
      isDataPreviewable,
    };
  }, [activeTab]);

  const togglePane = useCallback(
    (pane: keyof typeof paneState) => {
      updatePaneState({ [pane]: !paneState[pane] });
    },
    [paneState, updatePaneState]
  );

  const handleDecreaseFont = useCallback(() => {
    updateEditorSettings({ fontSize: Math.max(10, editorSettings.fontSize - 1) });
  }, [editorSettings.fontSize, updateEditorSettings]);

  const handleIncreaseFont = useCallback(() => {
    updateEditorSettings({ fontSize: Math.min(32, editorSettings.fontSize + 1) });
  }, [editorSettings.fontSize, updateEditorSettings]);

  const handleToggleTheme = useCallback(() => {
    updateEditorSettings({ theme: editorSettings.theme === 'dark' ? 'light' : 'dark' });
  }, [editorSettings.theme, updateEditorSettings]);

  const handleToggleMultiFile = useCallback(() => {
    setMultiFileAnalysisEnabled(!multiFileAnalysisEnabled);
  }, [multiFileAnalysisEnabled, setMultiFileAnalysisEnabled]);

  const handleCycleViewMode = useCallback(() => {
    if (!activeTabId) return;

    const nextMode =
      activeTabViewMode === 'editor'
        ? 'preview'
        : activeTabViewMode === 'preview'
          ? 'split'
          : 'editor';

    setViewMode(activeTabId, nextMode);
  }, [activeTabId, activeTabViewMode, setViewMode]);

  const handleConfirmNewFile = useCallback(
    async (fileName: string) => {
      setShowNewFileDialog(false);

      if (rootDirHandle) {
        try {
          const fileHandle = await createNewFile(rootDirHandle, fileName, '');

          if (fileHandle) {
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
        const parts = fileName.split('.');
        const fileType = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'md';
        addTempTab(fileType, fileName);
      }
    },
    [addTab, addTempTab, rootDirHandle]
  );

  const canToggleViewMode = useMemo(() => {
    return Boolean(activeTab && (fileTypeFlags.isPreviewableSpecialType || fileTypeFlags.isDataPreviewable));
  }, [activeTab, fileTypeFlags.isDataPreviewable, fileTypeFlags.isPreviewableSpecialType]);

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 dark:bg-[#0f172a] dark:text-gray-100">
      <MainHeader
        onToggleExplorer={() => togglePane('isExplorerVisible')}
        onDecreaseFont={handleDecreaseFont}
        onIncreaseFont={handleIncreaseFont}
        fontSize={editorSettings.fontSize}
        theme={editorSettings.theme}
        onToggleTheme={handleToggleTheme}
        onNewFile={() => setShowNewFileDialog(true)}
        onToggleSearch={() => togglePane('isSearchVisible')}
        multiFileAnalysisEnabled={multiFileAnalysisEnabled}
        onToggleMultiFileAnalysis={handleToggleMultiFile}
        selectedFileCount={selectedFiles.size}
      />

      <TabBarDnD />

      <ViewModeBanner
        activeTab={activeTab ?? null}
        activeTabViewMode={activeTabViewMode}
        canToggleViewMode={canToggleViewMode}
        onToggleViewMode={handleCycleViewMode}
      />

      <Workspace
        paneState={paneState}
        activeTab={activeTab ?? null}
        activeTabId={activeTabId ?? null}
        activeTabViewMode={activeTabViewMode}
        multiFileAnalysisEnabled={multiFileAnalysisEnabled}
        onCloseMultiFileAnalysis={() => setMultiFileAnalysisEnabled(false)}
      />

      <footer className="h-6 bg-gray-100 dark:bg-gray-800 text-xs px-4 flex items-center border-t border-gray-300 dark:border-gray-700">
        <div className="flex-1">
          {activeTab ? `${activeTab.name}` : 'ファイルが選択されていません'}
        </div>
        <div>{editorSettings.theme === 'light' ? 'ライトモード' : 'ダークモード'}</div>
      </footer>

      {showNewFileDialog && (
        <InputDialog
          isOpen={showNewFileDialog}
          title="一時ファイル作成"
          label="ファイル名"
          initialValue=""
          showExtensionSelect
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
          onConfirm={handleConfirmNewFile}
          onCancel={() => setShowNewFileDialog(false)}
        />
      )}
    </div>
  );
};

export default MainLayout;
