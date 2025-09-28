'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TabData, FileTreeItem, EditorSettings, PaneState, ContextMenuTarget, SearchSettings, AnalysisData, SqlResult, ChartSettings, SearchResult, SqlNotebookCell, SqlNotebookSnapshotMeta } from '@/types';

interface EditorStore {
  // タブ管理
  tabs: Map<string, TabData>;
  activeTabId: string | null;
  lastViewMode: 'editor' | 'preview' | 'data-preview' | 'split'; // グローバルな表示モード
  setActiveTabId: (id: string | null) => void;
  addTab: (tab: TabData) => void;
  addTempTab: (type: string, name?: string, initialContent?: string) => void;
  updateTab: (id: string, updates: Partial<TabData>) => void;
  removeTab: (id: string) => void;
  getTab: (id: string) => TabData | undefined;
  
  // 表示モード（'editor', 'preview', または 'split'）
  viewModes: Map<string, 'editor' | 'preview' | 'data-preview' | 'split'>;
  setViewMode: (tabId: string, mode: 'editor' | 'preview' | 'data-preview' | 'split') => void;
  getViewMode: (tabId: string) => 'editor' | 'preview' | 'data-preview' | 'split';
  
  // ファイルエクスプローラー
  rootDirHandle: FileSystemDirectoryHandle | null;
  rootFileTree: FileTreeItem | null;
  rootFolderName: string;
  setRootDirHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setRootFileTree: (tree: FileTreeItem | null) => void;
  setRootFolderName: (name: string) => void;
  
  // コンテキストメニュー
  contextMenuTarget: ContextMenuTarget;
  setContextMenuTarget: (target: ContextMenuTarget) => void;
  
  // エディタ設定
  editorSettings: EditorSettings;
  updateEditorSettings: (settings: Partial<EditorSettings>) => void;
  
  // パネル表示状態
  paneState: PaneState;
  updatePaneState: (state: Partial<PaneState>) => void;
  
  // 検索設定
  searchSettings: SearchSettings;
  updateSearchSettings: (settings: Partial<SearchSettings>) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchResults: SearchResult[];
  setSearchResults: (results: SearchResult[]) => void;
  isSearching: boolean;
  setIsSearching: (searching: boolean) => void;
  replaceText: string;
  setReplaceText: (text: string) => void;
  
  // 分析機能
  analysisEnabled: boolean;
  setAnalysisEnabled: (enabled: boolean) => void;
  analysisData: AnalysisData;
  setAnalysisData: (data: AnalysisData) => void;
  sqlResult: SqlResult | null;
  setSqlResult: (result: SqlResult | null) => void;
  chartSettings: ChartSettings;
  updateChartSettings: (settings: Partial<ChartSettings>) => void;
  sqlNotebook: Record<string, SqlNotebookCell[]>;
  setSqlNotebook: (tabId: string, cells: SqlNotebookCell[]) => void;
  clearSqlNotebook: (tabId: string) => void;
  sqlNotebookMeta: Record<string, SqlNotebookSnapshotMeta | undefined>;
  setSqlNotebookMeta: (tabId: string, meta: SqlNotebookSnapshotMeta | undefined) => void;

  // 複数ファイル分析機能
  selectedFiles: Set<string>;
  setSelectedFiles: (files: Set<string>) => void;
  addSelectedFile: (filePath: string) => void;
  removeSelectedFile: (filePath: string) => void;
  clearSelectedFiles: () => void;
  multiFileAnalysisEnabled: boolean;
  setMultiFileAnalysisEnabled: (enabled: boolean) => void;
}

export const useEditorStore = create<EditorStore>()(
  persist(
    (set, get) => ({
      // タブ管理
      tabs: new Map<string, TabData>(),
      activeTabId: null,
      lastViewMode: 'editor', // グローバルな表示モード
      setActiveTabId: (id) => set({ activeTabId: id }),
      addTab: (tab) => set((state) => {
        const newTabs = new Map(state.tabs);
        newTabs.set(tab.id, tab);
        // 新規タブの viewMode を lastViewMode で初期化
        const newViewModes = new Map(state.viewModes);
        newViewModes.set(tab.id, state.lastViewMode || 'editor');
        return { tabs: newTabs, activeTabId: tab.id, viewModes: newViewModes };
      }),
      addTempTab: (type, name, initialContent = '') => set((state) => {
        // 現在時刻をベースにしたユニークなID
        const timestamp = new Date().getTime();
        const tempId = `temp_${timestamp}`;
        const fileName = name || `未保存のファイル_${timestamp}.${type}`;

        const newTab: TabData = {
          id: tempId,
          name: fileName,
          content: initialContent,
          originalContent: initialContent,
          isDirty: false,
          type: type as any, // タイプキャスト
          isReadOnly: false,
        };

        const newTabs = new Map(state.tabs);
        newTabs.set(tempId, newTab);
        // 新規タブの viewMode を lastViewMode で初期化
        const newViewModes = new Map(state.viewModes);
        newViewModes.set(tempId, state.lastViewMode || 'editor');
        return { tabs: newTabs, activeTabId: tempId, viewModes: newViewModes };
      }),
      updateTab: (id, updates) => set((state) => {
        const newTabs = new Map(state.tabs);
        const tab = newTabs.get(id);
        if (tab) {
          const newContent = updates.content;
          if (
            tab.type === 'pdf' &&
            typeof tab.content === 'string' &&
            tab.content.startsWith('blob:') &&
            typeof newContent === 'string' &&
            newContent.startsWith('blob:') &&
            tab.content !== newContent
          ) {
            URL.revokeObjectURL(tab.content);
          }
          newTabs.set(id, { ...tab, ...updates });
        }
        return { tabs: newTabs };
      }),
      removeTab: (id) => set((state) => {
        const newTabs = new Map(state.tabs);
        const tab = newTabs.get(id);

        if (tab && tab.type === 'pdf' && typeof tab.content === 'string' && tab.content.startsWith('blob:')) {
          URL.revokeObjectURL(tab.content);
        }

        newTabs.delete(id);
        
        // アクティブなタブを削除した場合、別のタブをアクティブにする
        let newActiveTabId = state.activeTabId;
        if (state.activeTabId === id) {
          const tabIds = Array.from(newTabs.keys());
          newActiveTabId = tabIds.length > 0 ? tabIds[0] : null;
        }
        
        return { tabs: newTabs, activeTabId: newActiveTabId };
      }),
      getTab: (id) => get().tabs.get(id),
      
      // 表示モード管理
      viewModes: new Map<string, 'editor' | 'preview' | 'data-preview' | 'split'>(),
      setViewMode: (tabId, mode) => set((state) => {
        const newViewModes = new Map(state.viewModes);
        newViewModes.set(tabId, mode);
        // グローバル lastViewMode を更新
        return { viewModes: newViewModes, lastViewMode: mode };
      }),
      getViewMode: (tabId) => {
        const mode = get().viewModes.get(tabId);
        return mode || get().lastViewMode || 'editor'; // lastViewMode をデフォルトに
      },
      
      // ファイルエクスプローラー
      rootDirHandle: null,
      rootFileTree: null,
      rootFolderName: '',
      setRootDirHandle: (handle) => set({ rootDirHandle: handle }),
      setRootFileTree: (tree) => set({ rootFileTree: tree }),
      setRootFolderName: (name) => set({ rootFolderName: name }),
      
      // コンテキストメニュー
      contextMenuTarget: { path: null, name: null, isFile: false },
      setContextMenuTarget: (target) => set({ contextMenuTarget: target }),
      
      // エディタ設定
      editorSettings: {
        theme: 'light',
        fontSize: 14,
        scrollSyncEnabled: true,
        dataDisplayMode: 'flat',
        lineWrapping: true,
        rectangularSelection: false,
      },
      updateEditorSettings: (settings) => set((state) => ({
        editorSettings: { ...state.editorSettings, ...settings }
      })),
      
      // パネル表示状態
      paneState: {
        activeSidebar: 'explorer',
        isExplorerVisible: true,
        isEditorVisible: true,
        isPreviewVisible: true,
        isTocVisible: true,
        isSearchVisible: false,
        isAnalysisVisible: false,
        isGitVisible: false,
      },
      updatePaneState: (state) => set((prevState) => ({
        paneState: { ...prevState.paneState, ...state }
      })),
      
      // 検索設定
      searchSettings: {
        caseSensitive: false,
        useRegex: false,
        wholeWord: false,
        includePattern: '',
        excludePattern: '',
      },
      updateSearchSettings: (settings) => set((state) => ({
        searchSettings: { ...state.searchSettings, ...settings }
      })),
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),
      searchResults: [],
      setSearchResults: (results) => set({ searchResults: results }),
      isSearching: false,
      setIsSearching: (searching) => set({ isSearching: searching }),
      replaceText: '',
      setReplaceText: (text) => set({ replaceText: text }),
      
      // 分析機能
      analysisEnabled: false,
      setAnalysisEnabled: (enabled) => set({ analysisEnabled: enabled }),
      analysisData: { columns: [], rows: [] },
      setAnalysisData: (data) => set({ analysisData: data }),
      sqlResult: null,
      setSqlResult: (result) => set({ sqlResult: result }),
      chartSettings: {
        type: 'bar',
        xAxis: '',
        yAxis: '',
        aggregation: 'none', // デフォルトは集計なし
        categoryField: '',
        dataSource: 'queryResult', // デフォルトではクエリ結果を使用
        options: {
          bins: 10,
          regressionType: 'linear',
          regressionOrder: 2,
          startDateField: '',
          endDateField: '',
          taskNameField: '',
          vennFields: []
        }
      },
      updateChartSettings: (settings) => set((state) => ({
        chartSettings: { ...state.chartSettings, ...settings }
      })),
      sqlNotebook: {},
      setSqlNotebook: (tabId, cells) => set((state) => ({
        sqlNotebook: { ...state.sqlNotebook, [tabId]: cells }
      })),
      clearSqlNotebook: (tabId) => set((state) => {
        if (!state.sqlNotebook[tabId]) return state;
        const nextNotebook = { ...state.sqlNotebook };
        delete nextNotebook[tabId];
        return { sqlNotebook: nextNotebook };
      }),
      sqlNotebookMeta: {},
      setSqlNotebookMeta: (tabId, meta) => set((state) => ({
        sqlNotebookMeta: { ...state.sqlNotebookMeta, [tabId]: meta }
      })),

      // 複数ファイル分析機能
      selectedFiles: new Set<string>(),
      setSelectedFiles: (files) => set({ selectedFiles: files }),
      addSelectedFile: (filePath) => set((state) => {
        const newSet = new Set(state.selectedFiles);
        newSet.add(filePath);
        return { selectedFiles: newSet };
      }),
      removeSelectedFile: (filePath) => set((state) => {
        const newSet = new Set(state.selectedFiles);
        newSet.delete(filePath);
        return { selectedFiles: newSet };
      }),
      clearSelectedFiles: () => set({ selectedFiles: new Set<string>() }),
      multiFileAnalysisEnabled: false,
      setMultiFileAnalysisEnabled: (enabled) => set({ multiFileAnalysisEnabled: enabled }),
      reorderTabs: (newOrder: string[]) => set((state: EditorStore) => {
        const newTabs = new Map<string, TabData>();
        newOrder.forEach((id: string) => {
          const tab = state.tabs.get(id);
          if (tab) newTabs.set(id, tab);
        });
        state.tabs.forEach((tab: TabData, id: string) => {
          if (!newTabs.has(id)) newTabs.set(id, tab);
        });
        return { tabs: newTabs };
      }),
    }),
    {
      name: 'editor-storage',
      // ブラウザのFile System Access APIのオブジェクトは保存しない
      partialize: (state: EditorStore) => {
        // タブのMapをシリアライズするためオブジェクトに変換
        const tabsObject: Record<string, TabData> = {};
        state.tabs.forEach((value, key) => {
          tabsObject[key] = value;
        });
        // 表示モードのMapをシリアライズするためオブジェクトに変換
        const viewModesObject: Record<string, 'editor' | 'preview' | 'data-preview' | 'split'> = {};
        state.viewModes.forEach((value, key) => {
          viewModesObject[key] = value;
        });
        return {
          tabs: tabsObject,
          viewModes: viewModesObject,
          activeTabId: state.activeTabId,
          lastViewMode: state.lastViewMode,
          editorSettings: state.editorSettings,
          paneState: state.paneState,
          searchSettings: state.searchSettings,
          analysisEnabled: state.analysisEnabled,
          chartSettings: state.chartSettings,
          sqlNotebook: Object.keys(state.sqlNotebook || {}).reduce<Record<string, SqlNotebookCell[]>>((acc, key) => {
            const cells = state.sqlNotebook[key] || [];
            acc[key] = cells.map((cell) => ({
              ...cell,
              status: 'idle',
              error: null,
              result: null,
              originalResult: null,
              columns: [],
              executedAt: null,
            }));
            return acc;
          }, {}),
          sqlNotebookMeta: state.sqlNotebookMeta,
        };
      },
      // デシリアライズ時にMapに戻す処理
      onRehydrateStorage: () => (state) => {
        if (state) {
          // タブオブジェクトをMapに変換
          const tabsMap = new Map<string, TabData>();
          const tabsObj = state.tabs as unknown as Record<string, TabData>;

          if (tabsObj) {
            Object.keys(tabsObj).forEach(key => {
              const tabEntry = tabsObj[key];
              if (!tabEntry) {
                return;
              }
              const rawType = tabEntry.type as string;
              if (rawType === 'json' && tabEntry.name?.toLowerCase().endsWith('.ipynb')) {
                tabEntry.type = 'ipynb';
              } else if (rawType === 'text' && tabEntry.name?.toLowerCase().endsWith('.pdf')) {
                tabEntry.type = 'pdf';
              } else if (rawType === 'geojson' || rawType === 'topojson') {
                tabEntry.type = 'json';
              } else if (rawType === 'wkt') {
                tabEntry.type = 'text';
              }
              tabsMap.set(key, tabEntry);
            });
            state.tabs = tabsMap;
          }

          // 表示モードオブジェクトをMapに変換
          const viewModesMap = new Map<string, 'editor' | 'preview' | 'data-preview' | 'split'>();
          const viewModesObj = state.viewModes as unknown as Record<string, 'editor' | 'preview' | 'data-preview' | 'split'>;

          if (viewModesObj) {
            Object.keys(viewModesObj).forEach(key => {
              viewModesMap.set(key, viewModesObj[key]);
            });
            state.viewModes = viewModesMap;
          }
          // lastViewMode の復元
          if (!state.lastViewMode) {
            state.lastViewMode = 'editor';
          }
          if (!state.sqlNotebook) {
            state.sqlNotebook = {};
          } else {
            Object.keys(state.sqlNotebook).forEach((key) => {
              const cells = state.sqlNotebook[key] || [];
              state.sqlNotebook[key] = cells.map((cell) => ({
                ...cell,
                status: 'idle',
                error: null,
                result: null,
                originalResult: null,
                columns: cell.columns || [],
                executedAt: null,
              }));
            });
          }
          if (!state.sqlNotebookMeta) {
            state.sqlNotebookMeta = {};
          }
          if (!state.paneState) {
            state.paneState = {
              activeSidebar: 'explorer',
              isExplorerVisible: true,
              isEditorVisible: true,
              isPreviewVisible: true,
              isTocVisible: true,
              isSearchVisible: false,
              isAnalysisVisible: false,
              isGitVisible: false,
            };
          } else {
            if (typeof state.paneState.activeSidebar === 'undefined') {
              const inferredSidebar = state.paneState.isExplorerVisible
                ? 'explorer'
                : state.paneState.isGitVisible
                  ? 'git'
                  : null;
              state.paneState = { ...state.paneState, activeSidebar: inferredSidebar };
            }
            if (typeof state.paneState.isGitVisible !== 'boolean') {
              state.paneState = { ...state.paneState, isGitVisible: false };
            }
          }
        }
      }
    }
  )
);
