'use client';

import React, { useCallback, useMemo, useRef, useState } from 'react';
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
  const editorRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [isScrollSyncEnabled, setIsScrollSyncEnabled] = useState(false);

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
    const dataPreviewable =
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
    const gisData =
      fileType === 'geojson' ||
      fileType === 'kml' ||
      fileType === 'kmz' ||
      fileType === 'shapefile';

    return {
      isMarkdown: markdown,
      isMermaid: mermaid,
      isHtml: html,
      isPreviewableSpecialType: markdown || mermaid || html,
      isDataPreviewable: dataPreviewable,
      isDataAnalyzable: dataPreviewable,
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
  }, [paneState.activeSidebar, paneState.isExplorerVisible, paneState.isGitVisible, paneState.isGisVisible, paneState.isHelpVisible]);

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

      if (sidebar === 'gis' && activeTabId && isGisData) {
        if (isActive) {
          if (activeTabViewMode === 'gis-analysis') {
            setViewMode(activeTabId, 'editor');
          }
        } else {
          setViewMode(activeTabId, 'gis-analysis');
        }
      }
    },
    [aiFeaturesEnabled, activeSidebar, activeTabId, activeTabViewMode, isGisData, setViewMode, updatePaneState]
  );

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

    if (activeTabViewMode === 'gis-analysis' && isGisData) {
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
      />
      {showExplorer && (
        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
          <FileExplorer />
        </div>
      )}
      {showGisSidebar && (
        <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
          <GisSidebar />
        </div>
      )}
      {showGitSidebar && (
        <div className="w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-hidden">
          <GitPanel />
        </div>
      )}
      {showHelpSidebar && (
        <div className="w-96 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 overflow-hidden">
          <HelpSidebar />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        {showSearchPanel && (
          <div className="w-80 flex-shrink-0 border-r border-gray-200 dark:border-gray-800">
            <SearchPanel />
          </div>
        )}
        <div className="flex-1 h-full overflow-hidden">
          {renderMainContent()}
        </div>
      </div>
    </div>
  );
};

export default Workspace;
