'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PaneState, TabData } from '@/types';
import { useEditorStore } from '@/store/editorStore';
import FileExplorer from '@/components/explorer/FileExplorer';
import SearchPanel from '@/components/search/SearchPanel';
import GitPanel from '@/components/git/GitPanel';
import MultiFileAnalysis from '@/components/analysis/MultiFileAnalysis';
import DataAnalysis from '@/components/analysis/DataAnalysis';
import GisAnalysisView from '@/components/analysis/GisAnalysisView';
import GisSidebar from '@/components/analysis/GisSidebar';
import Editor from '@/components/editor/Editor';
import MarkdownPreview from '@/components/preview/MarkdownPreview';
import DataPreview from '@/components/preview/DataPreview';
import HtmlPreview from '@/components/preview/HtmlPreview';
import MermaidPreview from '@/components/preview/MermaidPreview';
import ActivityBar from '@/components/layout/ActivityBar';
import GitHistoryView from '@/components/git/GitHistoryView';
import GitDiffView from '@/components/git/GitDiffView';
import GitCommitDiffView from '@/components/git/GitCommitDiffView';
import HelpSidebar from '@/components/help/HelpSidebar';
import ResizableSidebar from '@/components/layout/ResizableSidebar';
import { DEFAULT_SIDEBAR_WIDTHS } from '@/constants/layout';
import { ensureHandlePermission, resolveNativeDirectoryPath, promptForNativeDirectoryPath } from '@/lib/fileSystemUtils';

interface WorkspaceProps {
  paneState: PaneState;
  activeTab: TabData | null;
  activeTabId: string | null;
  activeTabViewMode: 'editor' | 'preview' | 'data-preview' | 'analysis' | 'split' | 'gis-analysis';
  multiFileAnalysisEnabled: boolean;
  onCloseMultiFileAnalysis: () => void;
  onToggleMultiFileAnalysis: () => void;
  aiFeaturesEnabled: boolean;
}

const Workspace: React.FC<WorkspaceProps> = ({
  paneState,
  activeTab,
  activeTabId,
  activeTabViewMode,
  multiFileAnalysisEnabled,
  onCloseMultiFileAnalysis,
  onToggleMultiFileAnalysis,
  aiFeaturesEnabled,
}) => {
  const updatePaneState = useEditorStore((state) => state.updatePaneState);
  const setViewMode = useEditorStore((state) => state.setViewMode);
  const rootDirHandle = useEditorStore((state) => state.rootDirHandle);
  const rootFolderName = useEditorStore((state) => state.rootFolderName);
  const rootNativePath = useEditorStore((state) => state.rootNativePath);
  const setRootNativePath = useEditorStore((state) => state.setRootNativePath);
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(false);
  const [sidebarWidths, setSidebarWidths] = useState({
    explorer: paneState.sidebarWidths?.explorer ?? DEFAULT_SIDEBAR_WIDTHS.explorer,
    gis: paneState.sidebarWidths?.gis ?? DEFAULT_SIDEBAR_WIDTHS.gis,
    git: paneState.sidebarWidths?.git ?? DEFAULT_SIDEBAR_WIDTHS.git,
    help: paneState.sidebarWidths?.help ?? DEFAULT_SIDEBAR_WIDTHS.help,
    search: paneState.sidebarWidths?.search ?? DEFAULT_SIDEBAR_WIDTHS.search,
  });

  useEffect(() => {
    const nextExplorer = paneState.sidebarWidths?.explorer ?? DEFAULT_SIDEBAR_WIDTHS.explorer;
    const nextGis = paneState.sidebarWidths?.gis ?? DEFAULT_SIDEBAR_WIDTHS.gis;
    const nextGit = paneState.sidebarWidths?.git ?? DEFAULT_SIDEBAR_WIDTHS.git;
    const nextHelp = paneState.sidebarWidths?.help ?? DEFAULT_SIDEBAR_WIDTHS.help;
    const nextSearch = paneState.sidebarWidths?.search ?? DEFAULT_SIDEBAR_WIDTHS.search;

    setSidebarWidths((previous) => {
      if (
        previous.explorer === nextExplorer &&
        previous.gis === nextGis &&
        previous.git === nextGit &&
        previous.help === nextHelp &&
        previous.search === nextSearch
      ) {
        return previous;
      }
      return {
        explorer: nextExplorer,
        gis: nextGis,
        git: nextGit,
        help: nextHelp,
        search: nextSearch,
      };
    });
  }, [
    paneState.sidebarWidths?.explorer,
    paneState.sidebarWidths?.gis,
    paneState.sidebarWidths?.git,
    paneState.sidebarWidths?.help,
    paneState.sidebarWidths?.search,
  ]);

  type SidebarKey = keyof typeof DEFAULT_SIDEBAR_WIDTHS;

  const handleSidebarResize = useCallback((key: SidebarKey, width: number) => {
    setSidebarWidths((previous) => ({ ...previous, [key]: width }));
  }, []);

  const handleSidebarResizeEnd = useCallback(
    (key: SidebarKey, width: number) => {
      setSidebarWidths((previous) => ({ ...previous, [key]: width }));
      const nextSidebarWidths = {
        ...paneState.sidebarWidths,
        [key]: width,
      };
      updatePaneState({ sidebarWidths: nextSidebarWidths });
    },
    [paneState.sidebarWidths, updatePaneState],
  );

  const {
    isMarkdown,
    isMermaid,
    isHtml,
    isPreviewableSpecialType,
    isDataPreviewable,
    isDataAnalyzable,
    isGisData,
  } = useMemo(() => {
    const fileType = activeTab?.type?.toLowerCase();
    const markdown = fileType === 'markdown' || fileType === 'md';
    const mermaid = fileType === 'mermaid' || fileType === 'mmd';
    const html = fileType === 'html';
    const pdf = fileType === 'pdf';
    const pptx = fileType === 'pptx';
    const docx = fileType === 'docx';
    const ipynb = fileType === 'ipynb';
    const googleWorkspace = fileType === 'gdoc' || fileType === 'gsheet' || fileType === 'gslides';
    const structuredDataPreviewable =
      fileType === 'csv' ||
      fileType === 'tsv' ||
      fileType === 'json' ||
      fileType === 'yaml' ||
      fileType === 'parquet' ||
      fileType === 'excel' ||
      fileType === 'geojson' ||
      fileType === 'kml' ||
      fileType === 'kmz' ||
      fileType === 'shapefile';
    const dataPreviewable = structuredDataPreviewable || mermaid || pdf || pptx || docx || ipynb || googleWorkspace;
    const gisData =
      fileType === 'geojson' ||
      fileType === 'kml' ||
      fileType === 'kmz' ||
      fileType === 'shapefile';

    return {
      isMarkdown: markdown,
      isMermaid: mermaid,
      isHtml: html,
      isPreviewableSpecialType: markdown || mermaid || html || pdf || pptx || docx || ipynb || googleWorkspace,
      isDataPreviewable: dataPreviewable,
      isDataAnalyzable: structuredDataPreviewable,
      isGisData: gisData,
    };
  }, [activeTab]);

  const activeSidebar = useMemo(() => {
    if (paneState.activeSidebar !== undefined && paneState.activeSidebar !== null) {
      return paneState.activeSidebar;
    }
    if (paneState.isExplorerVisible) {
      return 'explorer';
    }
    if (paneState.isGitVisible) {
      return 'git';
    }
    if (paneState.isGisVisible) {
      return 'gis';
    }
    if (paneState.isHelpVisible) {
      return 'help';
    }
    return null;
  }, [
    paneState.activeSidebar,
    paneState.isExplorerVisible,
    paneState.isGitVisible,
    paneState.isGisVisible,
    paneState.isHelpVisible,
  ]);

  const showExplorer = activeSidebar === 'explorer';
  const showGitSidebar = activeSidebar === 'git';
  const showGisSidebar = activeSidebar === 'gis';
  const showHelpSidebar = aiFeaturesEnabled && activeSidebar === 'help';

  const handleSidebarSelect = useCallback(
    (sidebar: 'explorer' | 'gis' | 'git' | 'help') => {
      if (sidebar === 'help' && !aiFeaturesEnabled) {
        return;
      }
      const isActive = activeSidebar === sidebar;
      updatePaneState({
        activeSidebar: isActive ? null : sidebar,
        isExplorerVisible: sidebar === 'explorer' ? !isActive : false,
        isGisVisible: sidebar === 'gis' ? !isActive : false,
        isGitVisible: sidebar === 'git' ? !isActive : false,
        isHelpVisible: sidebar === 'help' ? !isActive : false,
      });

      if (sidebar === 'gis' && activeTabId) {
        if (isActive) {
          if (activeTabViewMode === 'gis-analysis') {
            setViewMode(activeTabId, 'editor');
          }
        } else {
          setViewMode(activeTabId, 'gis-analysis');
        }
      }
    },
    [aiFeaturesEnabled, activeSidebar, activeTabId, activeTabViewMode, setViewMode, updatePaneState]
  );

  const handleOpenTerminal = useCallback(async () => {
    if (!rootDirHandle) {
      alert('フォルダが選択されていません。');
      return;
    }

    try {
      let granted = await ensureHandlePermission(rootDirHandle, 'readwrite');
      if (!granted) {
        granted = await ensureHandlePermission(rootDirHandle, 'read');
      }

      if (!granted) {
        alert('フォルダへのアクセスが許可されませんでした。');
        return;
      }

      let nativePath = rootNativePath ?? null;
      if (!nativePath) {
        nativePath = await resolveNativeDirectoryPath(rootDirHandle);
      }

      if (!nativePath) {
        const fallbackPath = await promptForNativeDirectoryPath({
          title: 'ターミナルで開くフォルダを選択',
          message: rootFolderName ? `「${rootFolderName}」フォルダを選択してください。` : 'ターミナルで開きたいフォルダを選択してください。',
        });
        if (!fallbackPath) {
          alert('フォルダの場所を取得できませんでした。');
          return;
        }
        nativePath = fallbackPath;
      }

      if (rootNativePath !== nativePath) {
        setRootNativePath(nativePath);
      }

      const dlsNative = (window as typeof window & {
        dlsNative?: { openTerminal?: (path: string) => Promise<void> };
      }).dlsNative;

      if (!dlsNative?.openTerminal) {
        alert('ターミナルの起動がサポートされていません。');
        return;
      }

      await dlsNative.openTerminal(nativePath);
    } catch (error) {
      console.error('Failed to open terminal:', error);
      alert(`ターミナルの起動に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [rootDirHandle, rootNativePath, rootFolderName, setRootNativePath]);

  const showSearchPanel = paneState.isSearchVisible;

  const handleEditorScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!isScrollSyncEnabled || !previewRef.current) return;

      const editorDiv = event.currentTarget;
      const previewDiv = previewRef.current;
      const editorScrollableHeight = editorDiv.scrollHeight - editorDiv.clientHeight;
      const previewScrollableHeight = previewDiv.scrollHeight - previewDiv.clientHeight;

      if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

      const ratio = editorDiv.scrollTop / editorScrollableHeight;
      previewDiv.scrollTop = ratio * previewScrollableHeight;
    },
    [isScrollSyncEnabled]
  );

  const handlePreviewScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!isScrollSyncEnabled || !editorRef.current) return;

      const previewDiv = event.currentTarget;
      const editorDiv = editorRef.current;
      const previewScrollableHeight = previewDiv.scrollHeight - previewDiv.clientHeight;
      const editorScrollableHeight = editorDiv.scrollHeight - editorDiv.clientHeight;

      if (previewScrollableHeight <= 0 || editorScrollableHeight <= 0) return;

      const ratio = previewDiv.scrollTop / previewScrollableHeight;
      editorDiv.scrollTop = ratio * editorScrollableHeight;
    },
    [isScrollSyncEnabled]
  );

  const renderMarkdownOrMermaid = () => {
    if (activeTabViewMode === 'editor') {
      return (
        <div className="w-full h-full overflow-hidden">
          <Editor tabId={activeTabId} />
        </div>
      );
    }

    if (activeTabViewMode === 'preview') {
      return (
        <div className="w-full h-full overflow-hidden">
          {isMarkdown ? (
            <MarkdownPreview tabId={activeTabId} />
          ) : isMermaid ? (
            <MermaidPreview
              content={activeTab.content}
              fileName={activeTab.name}
              tabId={activeTabId}
              enableAiActions={aiFeaturesEnabled && Boolean(activeTabId && isMermaid)}
            />
          ) : isHtml ? (
            <HtmlPreview tabId={activeTabId} />
          ) : (
            <div className="h-full">
              <DataPreview tabId={activeTabId} />
            </div>
          )}
        </div>
      );
    }

    if (activeTabViewMode === 'data-preview') {
      return (
        <div className="w-full h-full overflow-hidden">
          <DataPreview tabId={activeTabId} />
        </div>
      );
    }

    return (
      <div className="flex w-full h-full overflow-hidden">
        <div
          className="w-1/2 h-full overflow-auto border-r border-gray-300 dark:border-gray-700"
          onScroll={handleEditorScroll}
          ref={editorRef}
        >
          <Editor tabId={activeTabId} onScroll={handleEditorScroll} />
        </div>
        <div
          className="w-1/2 h-full overflow-auto relative"
          onScroll={handlePreviewScroll}
          ref={previewRef}
        >
          <button
            className={`absolute top-2 right-2 z-50 px-3 py-1 rounded border border-gray-400 shadow ${
              isScrollSyncEnabled ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-800'
            }`}
            onClick={() => setIsScrollSyncEnabled((value) => !value)}
            title={isScrollSyncEnabled ? 'スクロール同期ON' : 'スクロール同期OFF'}
          >
            {isScrollSyncEnabled ? '同期ON' : '同期OFF'}
          </button>
          {isMarkdown ? (
            <MarkdownPreview tabId={activeTabId} onScroll={handlePreviewScroll} />
          ) : isMermaid ? (
            <MermaidPreview
              content={activeTab.content}
              fileName={activeTab.name}
              tabId={activeTabId}
              enableAiActions={aiFeaturesEnabled && Boolean(activeTabId && isMermaid)}
            />
          ) : isHtml ? (
            <HtmlPreview tabId={activeTabId} onScroll={handlePreviewScroll} />
          ) : (
            <div className="h-full">
              <DataPreview tabId={activeTabId} />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDataPreviewable = () => {
    if (!activeTabId) {
      return null;
    }

    if (activeTabViewMode === 'gis-analysis') {
      return (
        <div className="w-full h-full overflow-hidden">
          <GisAnalysisView tabId={activeTabId} />
        </div>
      );
    }

    if (activeTabViewMode === 'editor') {
      return (
        <div className="w-full h-full overflow-hidden">
          <Editor tabId={activeTabId} />
        </div>
      );
    }

    if (activeTabViewMode === 'preview' || activeTabViewMode === 'data-preview') {
      return (
        <div className="w-full h-full overflow-hidden">
          <DataPreview tabId={activeTabId} />
        </div>
      );
    }

    return (
      <div className="flex w-full h-full overflow-hidden">
        <div className="w-1/2 h-full overflow-hidden border-r border-gray-300 dark:border-gray-700">
          <Editor tabId={activeTabId} />
        </div>
        <div className="w-1/2 h-full overflow-hidden">
          <DataPreview tabId={activeTabId} />
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isPreviewableSpecialType) {
      return renderMarkdownOrMermaid();
    }

    if (isDataPreviewable) {
      return renderDataPreviewable();
    }

    return (
      <div className="w-full h-full overflow-hidden">
        <Editor tabId={activeTabId} />
      </div>
    );
  };

  const renderMainContent = () => {
    if (multiFileAnalysisEnabled) {
      return (
        <div className="w-full h-full overflow-hidden">
          <MultiFileAnalysis onClose={onCloseMultiFileAnalysis} />
        </div>
      );
    }

    if (!activeTabId || !activeTab) {
      return (
        <div className="flex h-full items-center justify-center text-gray-500">
          <div className="text-center">
            <p className="mb-4">ファイルが開かれていません</p>
            <p className="text-sm">エクスプローラからファイルを選択してください</p>
          </div>
        </div>
      );
    }

    if (activeTab.type === 'git-history') {
      return <GitHistoryView tab={activeTab} />;
    }

    if (activeTab.type === 'git-diff') {
      return <GitDiffView tab={activeTab} />;
    }

    if (activeTab.type === 'git-commit-diff') {
      return <GitCommitDiffView tab={activeTab} />;
    }

    const shouldShowAnalysis =
      isDataAnalyzable && (paneState.isAnalysisVisible || activeTabViewMode === 'analysis');

    if (shouldShowAnalysis) {
      return (
        <div className="w-full h-full overflow-hidden">
          <DataAnalysis tabId={activeTabId} />
        </div>
      );
    }

    return renderContent();
  };

  return (
    <div className="flex flex-1 overflow-hidden bg-white dark:bg-gray-900">
      <ActivityBar
        activeItem={activeSidebar}
        onSelect={handleSidebarSelect}
        helpEnabled={aiFeaturesEnabled}
        multiFileAnalysisAvailable
        multiFileAnalysisEnabled={multiFileAnalysisEnabled}
        onToggleMultiFileAnalysis={onToggleMultiFileAnalysis}
        onOpenTerminal={handleOpenTerminal}
      />
      {showExplorer && (
        <ResizableSidebar
          width={sidebarWidths.explorer}
          minWidth={200}
          maxWidth={480}
          onResize={(width) => handleSidebarResize('explorer', width)}
          onResizeEnd={(width) => handleSidebarResizeEnd('explorer', width)}
          className="border-r border-gray-200 dark:border-gray-800"
          handleClassName="hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
        >
          <FileExplorer />
        </ResizableSidebar>
      )}
      {showGisSidebar && (
        <ResizableSidebar
          width={sidebarWidths.gis}
          minWidth={240}
          maxWidth={520}
          onResize={(width) => handleSidebarResize('gis', width)}
          onResizeEnd={(width) => handleSidebarResizeEnd('gis', width)}
          className="border-r border-gray-200 dark:border-gray-800"
          handleClassName="hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
        >
          <GisSidebar />
        </ResizableSidebar>
      )}
      {showGitSidebar && (
        <ResizableSidebar
          width={sidebarWidths.git}
          minWidth={320}
          maxWidth={640}
          onResize={(width) => handleSidebarResize('git', width)}
          onResizeEnd={(width) => handleSidebarResizeEnd('git', width)}
          className="border-r border-gray-200 dark:border-gray-800 overflow-hidden"
          handleClassName="hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
        >
          <GitPanel />
        </ResizableSidebar>
      )}
      {showHelpSidebar && (
        <ResizableSidebar
          width={sidebarWidths.help}
          minWidth={320}
          maxWidth={640}
          onResize={(width) => handleSidebarResize('help', width)}
          onResizeEnd={(width) => handleSidebarResizeEnd('help', width)}
          className="border-r border-gray-200 dark:border-gray-800 overflow-hidden"
          handleClassName="hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
        >
          <HelpSidebar />
        </ResizableSidebar>
      )}
      <div className="flex-1 flex overflow-hidden">
        {showSearchPanel && (
          <ResizableSidebar
            width={sidebarWidths.search}
            minWidth={260}
            maxWidth={520}
            onResize={(width) => handleSidebarResize('search', width)}
            onResizeEnd={(width) => handleSidebarResizeEnd('search', width)}
            className="border-r border-gray-200 dark:border-gray-800"
            handleClassName="hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
          >
            <SearchPanel />
          </ResizableSidebar>
        )}
        <div className="flex-1 h-full overflow-hidden">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
};

export default Workspace;
