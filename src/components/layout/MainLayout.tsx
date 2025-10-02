/**
 * MainLayout.tsx
 * エディタ全体の骨格を構成するコンテナコンポーネント。
 * ヘッダー・タブバー・ワークスペース・各種モーダルの連携を担う。
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '@/store/editorStore';
import { useGitStore } from '@/store/gitStore';
import TabBarDnD from '@/components/tabs/TabBarDnD';
import InputDialog from '@/components/modals/InputDialog';
import MermaidTemplateDialog from '@/components/modals/MermaidTemplateDialog';
import LlmSettingsDialog from '@/components/modals/LlmSettingsDialog';
import MainHeader from '@/components/layout/MainHeader';
import ViewModeBanner from '@/components/layout/ViewModeBanner';
import Workspace from '@/components/layout/Workspace';
import { createNewFile, readDirectoryContents } from '@/lib/fileSystemUtils';
import { getFileType } from '@/lib/editorUtils';
import { getMermaidTemplate } from '@/lib/mermaid/diagramDefinitions';
import { TabData } from '@/types';
import type { MermaidDiagramType } from '@/lib/mermaid/types';
import GitCloneDialog from '@/components/git/GitCloneDialog';
import LoadingOverlay from '@/components/layout/LoadingOverlay';

const MainLayout = () => {
  const {
    paneState,
    updatePaneState,
    activeTabId,
    tabs,
    editorSettings,
    updateEditorSettings,
    rootDirHandle,
    setRootDirHandle,
    setRootFileTree,
    setRootFolderName,
    addTab,
    addTempTab,
    multiFileAnalysisEnabled,
    setMultiFileAnalysisEnabled,
    selectedFiles,
    getViewMode,
    setViewMode,
    setActiveTabId,
    updateTab,
  } = useEditorStore();

  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showMermaidTemplateDialog, setShowMermaidTemplateDialog] = useState(false);
  const [showLlmSettingsDialog, setShowLlmSettingsDialog] = useState(false);
  const [showGitCloneDialog, setShowGitCloneDialog] = useState(false);
  const [gitCloneError, setGitCloneError] = useState<string | null>(null);
  const [isCloningRepo, setIsCloningRepo] = useState(false);
  const [pendingMermaidFile, setPendingMermaidFile] = useState<{
    fileName: string;
    directoryHandle: FileSystemDirectoryHandle | null;
  } | null>(null);

  const cloneRepository = useGitStore((state) => state.cloneRepository);
  const gitLoading = useGitStore((state) => state.loading);

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
      type === 'excel' ||
      type === 'geojson' ||
      type === 'kml' ||
      type === 'kmz' ||
      type === 'shapefile';

    return {
      isMarkdown,
      isMermaid,
      isHtml,
      isPreviewableSpecialType: isMarkdown || isMermaid || isHtml,
      isDataPreviewable,
      isGisData:
        type === 'geojson' ||
        type === 'kml' ||
        type === 'kmz' ||
        type === 'shapefile',
    };
  }, [activeTab]);

  const togglePane = useCallback(
    (pane: keyof typeof paneState) => {
      if (
        pane === 'isExplorerVisible' ||
        pane === 'isGisVisible' ||
        pane === 'isGitVisible' ||
        pane === 'isHelpVisible' ||
        pane === 'activeSidebar'
      ) {
        return;
      }
      updatePaneState({ [pane]: !paneState[pane] });
    },
    [paneState, updatePaneState]
  );

  const handleToggleExplorerPane = useCallback(() => {
    const isActive = paneState.activeSidebar === 'explorer';
    updatePaneState({
      activeSidebar: isActive ? null : 'explorer',
      isExplorerVisible: !isActive,
      isGisVisible: false,
      isGitVisible: false,
      isHelpVisible: false,
    });
  }, [paneState.activeSidebar, updatePaneState]);

  const handleToggleGitPane = useCallback(() => {
    const isActive = paneState.activeSidebar === 'git';
    updatePaneState({
      activeSidebar: isActive ? null : 'git',
      isGitVisible: !isActive,
      isExplorerVisible: false,
      isGisVisible: false,
      isHelpVisible: false,
    });
  }, [paneState.activeSidebar, updatePaneState]);

  const handleToggleHelpPane = useCallback(() => {
    const isActive = paneState.activeSidebar === 'help';
    updatePaneState({
      activeSidebar: isActive ? null : 'help',
      isHelpVisible: !isActive,
      isExplorerVisible: false,
      isGisVisible: false,
      isGitVisible: false,
    });
  }, [paneState.activeSidebar, updatePaneState]);

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

  const handleOpenGitCloneDialog = useCallback(() => {
    setGitCloneError(null);
    useGitStore.setState({ error: null });
    setShowGitCloneDialog(true);
  }, []);

  const handleCloneRepositoryConfirm = useCallback(
    async ({ url, directoryName, reference }: { url: string; directoryName?: string; reference?: string }) => {
      setIsCloningRepo(true);
      try {
        const result = await cloneRepository({ url, directoryName, reference });
        if (!result) {
          const currentError = useGitStore.getState().error;
          if (currentError && currentError.trim().length > 0) {
            setGitCloneError(currentError);
          } else {
            setGitCloneError(null);
          }
          return;
        }

        const { handle, folderName } = result;
        setRootDirHandle(handle);
        setRootFolderName(folderName);
        try {
          const tree = await readDirectoryContents(handle);
          setRootFileTree(tree);
        } catch (error) {
          console.error('Failed to read cloned repository contents:', error);
        }
        updatePaneState({ activeSidebar: 'explorer', isExplorerVisible: true });
        setShowGitCloneDialog(false);
        setGitCloneError(null);
      } catch (error) {
        console.error('Failed to clone repository from dialog:', error);
        const message = error instanceof Error ? error.message : 'Gitリポジトリのクローンに失敗しました。';
        setGitCloneError(message);
      } finally {
        setIsCloningRepo(false);
      }
    },
    [cloneRepository, setRootDirHandle, setRootFileTree, setRootFolderName, updatePaneState]
  );

  const handleCloneDialogClose = useCallback(() => {
    setShowGitCloneDialog(false);
    setGitCloneError(null);
    useGitStore.setState({ error: null });
  }, []);

  const handleCycleViewMode = useCallback(() => {
    if (!activeTabId) return;

    const nextMode = (() => {
      if (fileTypeFlags.isGisData) {
        if (activeTabViewMode === 'editor') return 'preview';
        if (activeTabViewMode === 'preview') return 'data-preview';
        if (activeTabViewMode === 'data-preview') return 'gis-analysis';
        if (activeTabViewMode === 'gis-analysis') return 'analysis';
        if (activeTabViewMode === 'analysis') return 'split';
        if (activeTabViewMode === 'split') return 'editor';
        return 'editor';
      }

      if (fileTypeFlags.isDataPreviewable) {
        if (activeTabViewMode === 'editor') return 'preview';
        if (activeTabViewMode === 'preview') return 'data-preview';
        if (activeTabViewMode === 'data-preview') return 'analysis';
        if (activeTabViewMode === 'analysis') return 'split';
        if (activeTabViewMode === 'split') return 'editor';
        return 'editor';
      }

      if (activeTabViewMode === 'editor') return 'preview';
      if (activeTabViewMode === 'preview') return 'split';
      if (activeTabViewMode === 'split') return 'editor';
      return 'editor';
    })();

    setViewMode(activeTabId, nextMode);
  }, [activeTabId, activeTabViewMode, fileTypeFlags.isDataPreviewable, fileTypeFlags.isGisData, setViewMode]);

  const handleConfirmNewFile = useCallback(
    async (fileName: string) => {
      setShowNewFileDialog(false);

      const lowerName = fileName.toLowerCase();
      if (lowerName.endsWith('.mmd')) {
        setPendingMermaidFile({ fileName, directoryHandle: rootDirHandle ?? null });
        setShowMermaidTemplateDialog(true);
        return;
      }

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

  const handleMermaidTemplateCancel = useCallback(() => {
    setPendingMermaidFile(null);
    setShowMermaidTemplateDialog(false);
  }, []);

  const handleMermaidTemplateConfirm = useCallback(
    async (diagramType: MermaidDiagramType, generatedCode?: string) => {
      if (!pendingMermaidFile) return;

      const template = generatedCode ?? getMermaidTemplate(diagramType);

      try {
        if (pendingMermaidFile.directoryHandle) {
          const fileHandle = await createNewFile(
            pendingMermaidFile.directoryHandle,
            pendingMermaidFile.fileName,
            template,
          );

          if (!fileHandle) {
            throw new Error('ファイルハンドルを取得できませんでした');
          }

          const newTab: TabData = {
            id: pendingMermaidFile.fileName,
            name: pendingMermaidFile.fileName,
            content: template,
            originalContent: template,
            isDirty: false,
            type: getFileType(pendingMermaidFile.fileName),
            isReadOnly: false,
          };

          addTab(newTab);
        } else {
          const parts = pendingMermaidFile.fileName.split('.');
          const fileType = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : 'mmd';
          addTempTab(fileType, pendingMermaidFile.fileName, template);
        }
      } catch (error) {
        console.error('Failed to create Mermaid file:', error);
        alert(`Mermaidファイルの作成に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`);
      } finally {
        setPendingMermaidFile(null);
        setShowMermaidTemplateDialog(false);
      }
    },
    [addTab, addTempTab, pendingMermaidFile],
  );

  const loadingMessage = useMemo(() => {
    if (isCloningRepo) {
      return 'Gitリポジトリをクローンしています…';
    }
    if (gitLoading) {
      return 'Gitリポジトリを更新しています…';
    }
    return undefined;
  }, [gitLoading, isCloningRepo]);

  const canToggleViewMode = useMemo(() => {
    return Boolean(activeTab && (fileTypeFlags.isPreviewableSpecialType || fileTypeFlags.isDataPreviewable));
  }, [activeTab, fileTypeFlags.isDataPreviewable, fileTypeFlags.isPreviewableSpecialType]);

  const handleDroppedFiles = useCallback(
    async (inputFiles: FileList | File[]) => {
      const filesArray = Array.isArray(inputFiles) ? inputFiles : Array.from(inputFiles);

      for (let index = 0; index < filesArray.length; index += 1) {
        const file = filesArray[index];
        if (!file) continue;

        const lowerName = file.name.toLowerCase();
        let fileType = getFileType(file.name) as TabData['type'];
        if (lowerName.endsWith('.pdf')) {
          fileType = 'pdf';
        } else if (lowerName.endsWith('.ipynb')) {
          fileType = 'ipynb';
        }

        let content = '';
        try {
          if (fileType === 'excel') {
            content = '';
          } else if (fileType === 'pdf') {
            content = URL.createObjectURL(file);
          } else if (fileType === 'shapefile') {
            content = `# Shapefile: ${file.name}\n\nこのファイルはバイナリGISデータです。データプレビューや分析タブから属性情報を参照できます。`;
          } else if (fileType === 'kmz') {
            content = `# KMZ: ${file.name}\n\nKMZの内容はデータプレビューや分析タブで自動的に展開されます。`;
          } else {
            content = await file.text();
          }
        } catch (error) {
          console.error('Failed to read dropped file:', error);
          alert(`ファイルの読み込みに失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
          continue;
        }

        const state = useEditorStore.getState();
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
          setActiveTabId(existingId);
          updateTab(existingId, {
            content,
            originalContent: content,
            isDirty: false,
            file,
            type: fileType,
          });
          continue;
        }

        const tabId = `dropped_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;

        const newTab: TabData = {
          id: tabId,
          name: file.name,
          content,
          originalContent: content,
          isDirty: false,
          type: fileType,
          isReadOnly: false,
          file,
        };

        addTab(newTab);
      }
    },
    [addTab, setActiveTabId, updateTab]
  );

  useEffect(() => {
    const handleDragOver = (event: DragEvent) => {
      if (!event.dataTransfer) return;
      const hasFiles =
        Array.from(event.dataTransfer.items || []).some(item => item.kind === 'file') ||
        event.dataTransfer.files.length > 0;
      if (!hasFiles) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (event: DragEvent) => {
      if (!event.dataTransfer) return;

      const itemList = event.dataTransfer.items;
      const files: File[] = [];

      if (itemList && itemList.length > 0) {
        for (const item of Array.from(itemList)) {
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file) {
              files.push(file);
            }
          }
        }
      } else {
        files.push(...Array.from(event.dataTransfer.files || []));
      }

      if (files.length === 0) {
        return;
      }

      event.preventDefault();
      void handleDroppedFiles(files);
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [handleDroppedFiles]);

  return (
    <div className="flex flex-col h-screen bg-white text-gray-900 dark:bg-[#0f172a] dark:text-gray-100">
      <MainHeader
        onToggleExplorer={handleToggleExplorerPane}
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
        onToggleGit={handleToggleGitPane}
        isGitPaneVisible={paneState.isGitVisible}
        onCloneRepository={handleOpenGitCloneDialog}
        onToggleHelp={handleToggleHelpPane}
        isHelpPaneVisible={paneState.isHelpVisible}
        onOpenLlmSettings={() => setShowLlmSettingsDialog(true)}
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

      {showMermaidTemplateDialog && pendingMermaidFile && (
        <MermaidTemplateDialog
          isOpen={showMermaidTemplateDialog}
          fileName={pendingMermaidFile.fileName}
          historyKey={pendingMermaidFile.fileName}
          onCancel={handleMermaidTemplateCancel}
          onConfirm={handleMermaidTemplateConfirm}
        />
      )}

      {showGitCloneDialog && (
        <GitCloneDialog
          isOpen={showGitCloneDialog}
          onCancel={handleCloneDialogClose}
          onClone={handleCloneRepositoryConfirm}
          isCloning={isCloningRepo}
          errorMessage={gitCloneError ?? undefined}
        />
      )}

      {showLlmSettingsDialog && (
        <LlmSettingsDialog
          isOpen={showLlmSettingsDialog}
          onClose={() => setShowLlmSettingsDialog(false)}
        />
      )}

      <LoadingOverlay visible={gitLoading || isCloningRepo} message={loadingMessage} />
    </div>
  );
};

export default MainLayout;
