'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createId } from '@/lib/utils/id';
import {
  DEFAULT_GIT_HISTORY_HEIGHT,
  DEFAULT_SIDEBAR_WIDTHS,
} from '@/constants/layout';
import {
  TabData,
  FileTreeItem,
  EditorSettings,
  PaneState,
  ContextMenuTarget,
  SearchSettings,
  AnalysisData,
  AnalysisDataset,
  SqlResult,
  ChartSettings,
  SearchResult,
  SqlNotebookCell,
  SqlNotebookSnapshotMeta,
  PairWritingHistoryEntry,
  MermaidGenerationHistoryEntry,
  HelpThread,
  HelpMessage,
  HelpSettings,
  HelpUserRole,
} from '@/types';

export type EditorViewMode = 'editor' | 'preview' | 'data-preview' | 'analysis' | 'split' | 'gis-analysis';

interface EditorStore {
  // タブ管理
  tabs: Map<string, TabData>;
  activeTabId: string | null;
  lastViewMode: EditorViewMode; // グローバルな表示モード
  setActiveTabId: (id: string | null) => void;
  addTab: (tab: TabData) => void;
  addTempTab: (type: string, name?: string, initialContent?: string) => void;
  updateTab: (id: string, updates: Partial<TabData>) => void;
  removeTab: (id: string) => void;
  getTab: (id: string) => TabData | undefined;
  reorderTabs: (newOrder: string[]) => void;
  
  // 表示モード（'editor', 'preview', または 'split'）
  viewModes: Map<string, EditorViewMode>;
  setViewMode: (tabId: string, mode: EditorViewMode) => void;
  getViewMode: (tabId: string) => EditorViewMode;
  
  // ファイルエクスプローラー
  rootDirHandle: FileSystemDirectoryHandle | null;
  rootFileTree: FileTreeItem | null;
  rootFolderName: string;
  rootNativePath: string | null;
  setRootDirHandle: (handle: FileSystemDirectoryHandle | null) => void;
  setRootFileTree: (tree: FileTreeItem | null) => void;
  setRootFolderName: (name: string) => void;
  setRootNativePath: (path: string | null) => void;
  
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
  setAnalysisData: (tabId: string, data: AnalysisDataset | null) => void;
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

  // ペアライティング履歴
  pairWritingHistory: Record<string, PairWritingHistoryEntry[]>;
  pairWritingHistoryIndex: Record<string, number>;
  recordPairWritingEntry: (tabId: string, entry: PairWritingHistoryEntry) => void;
  undoPairWriting: (tabId: string) => PairWritingHistoryEntry | null;
  redoPairWriting: (tabId: string) => PairWritingHistoryEntry | null;
  clearPairWritingHistory: (tabId: string) => void;

  // Mermaid生成履歴
  mermaidGenerationHistory: Record<string, MermaidGenerationHistoryEntry[]>;
  addMermaidGenerationEntry: (key: string, entry: MermaidGenerationHistoryEntry) => void;
  updateMermaidGenerationEntry: (
    key: string,
    entryId: string,
    updates: Partial<MermaidGenerationHistoryEntry>,
  ) => void;
  clearMermaidGenerationHistory: (key: string) => void;

  // ヘルプチャット
  helpThreads: Record<string, HelpThread>;
  helpThreadOrder: string[];
  activeHelpThreadId: string | null;
  setActiveHelpThread: (threadId: string | null) => void;
  createHelpThread: (payload?: { title?: string; documentId?: string; knowledgeBaseUrl?: string }) => HelpThread;
  updateHelpThread: (
    threadId: string,
    updates: Partial<Omit<HelpThread, 'id' | 'messages'>> & { messages?: HelpMessage[] },
  ) => void;
  addHelpMessage: (threadId: string, message: HelpMessage) => void;
  removeHelpThread: (threadId: string) => void;
  clearHelpThreads: () => void;
  helpSettings: HelpSettings;
  updateHelpSettings: (updates: Partial<HelpSettings>) => void;
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
      viewModes: new Map<string, EditorViewMode>(),
      setViewMode: (tabId, mode) => set((state) => {
        const newViewModes = new Map(state.viewModes);
        newViewModes.set(tabId, mode);

        const isAnalysisMode = mode === 'analysis';
        const shouldUpdatePaneState = state.paneState.isAnalysisVisible !== isAnalysisMode;

        return {
          viewModes: newViewModes,
          lastViewMode: mode === 'analysis' ? state.lastViewMode : mode,
          paneState: shouldUpdatePaneState
            ? { ...state.paneState, isAnalysisVisible: isAnalysisMode }
            : state.paneState,
        };
      }),
      getViewMode: (tabId) => {
        const mode = get().viewModes.get(tabId);
        return mode || get().lastViewMode || 'editor'; // lastViewMode をデフォルトに
      },
      
      // ファイルエクスプローラー
      rootDirHandle: null,
      rootFileTree: null,
      rootFolderName: '',
      rootNativePath: null,
      setRootDirHandle: (handle) => set({ rootDirHandle: handle }),
      setRootFileTree: (tree) => set({ rootFileTree: tree }),
      setRootFolderName: (name) => set({ rootFolderName: name }),
      setRootNativePath: (path) => set({ rootNativePath: path }),
      
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
        isGisVisible: false,
        isEditorVisible: true,
        isPreviewVisible: true,
        isTocVisible: true,
        isSearchVisible: false,
        isAnalysisVisible: false,
        isGitVisible: false,
        isHelpVisible: false,
        sidebarWidths: { ...DEFAULT_SIDEBAR_WIDTHS },
        gitHistoryHeight: DEFAULT_GIT_HISTORY_HEIGHT,
      },
      updatePaneState: (state) =>
        set((prevState) => {
          const mergedPaneState = { ...prevState.paneState, ...state } as PaneState & {
            isBrowserVisible?: boolean;
          };

          if (mergedPaneState.activeSidebar &&
            !['explorer', 'gis', 'git', 'help'].includes(mergedPaneState.activeSidebar)) {
            mergedPaneState.activeSidebar = null;
          }

          if (typeof mergedPaneState.isBrowserVisible !== 'undefined') {
            delete mergedPaneState.isBrowserVisible;
          }

          const nextSidebarWidths = {
            ...DEFAULT_SIDEBAR_WIDTHS,
            ...(mergedPaneState.sidebarWidths ?? {}),
          } as Record<string, number>;
          if ('browser' in nextSidebarWidths) {
            delete nextSidebarWidths.browser;
          }

          mergedPaneState.sidebarWidths = nextSidebarWidths as PaneState['sidebarWidths'];

          return { paneState: mergedPaneState };
        }),
      
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
      analysisData: {},
      setAnalysisData: (tabId, data) =>
        set((state) => {
          const nextData = { ...state.analysisData } as AnalysisData;
          if (!data) {
            delete nextData[tabId];
          } else {
            nextData[tabId] = data;
          }
          return { analysisData: nextData };
        }),
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

      // Mermaid生成履歴
      mermaidGenerationHistory: {},
      addMermaidGenerationEntry: (key, entry) => set((state) => {
        if (!key) {
          return state;
        }
        const history = state.mermaidGenerationHistory[key] ?? [];
        return {
          mermaidGenerationHistory: {
            ...state.mermaidGenerationHistory,
            [key]: [...history, entry],
          },
        };
      }),
      updateMermaidGenerationEntry: (key, entryId, updates) => set((state) => {
        const history = state.mermaidGenerationHistory[key];
        if (!history) {
          return state;
        }
        const index = history.findIndex((item) => item.id === entryId);
        if (index === -1) {
          return state;
        }
        const nextHistory = history.slice();
        nextHistory[index] = { ...nextHistory[index], ...updates };
        return {
          mermaidGenerationHistory: {
            ...state.mermaidGenerationHistory,
            [key]: nextHistory,
          },
        };
      }),
      clearMermaidGenerationHistory: (key) => set((state) => {
        if (!state.mermaidGenerationHistory[key]) {
          return state;
        }
        const nextHistory = { ...state.mermaidGenerationHistory };
        delete nextHistory[key];
        return { mermaidGenerationHistory: nextHistory };
      }),

      // ペアライティング履歴
      pairWritingHistory: {},
      pairWritingHistoryIndex: {},
      recordPairWritingEntry: (tabId, entry) => set((state) => {
        const history = state.pairWritingHistory[tabId] ?? [];
        const currentIndex = state.pairWritingHistoryIndex[tabId];
        const effectiveIndex = typeof currentIndex === 'number' ? currentIndex : history.length - 1;
        const trimmedHistory = history.slice(0, Math.max(effectiveIndex + 1, 0));
        const nextHistory = [...trimmedHistory, entry];
        return {
          pairWritingHistory: { ...state.pairWritingHistory, [tabId]: nextHistory },
          pairWritingHistoryIndex: { ...state.pairWritingHistoryIndex, [tabId]: nextHistory.length - 1 },
        };
      }),
      undoPairWriting: (tabId) => {
        const state = get();
        const history = state.pairWritingHistory[tabId] ?? [];
        const currentIndex = state.pairWritingHistoryIndex[tabId];
        const effectiveIndex = typeof currentIndex === 'number' ? currentIndex : history.length - 1;
        if (effectiveIndex < 0 || effectiveIndex >= history.length) {
          return null;
        }

        const entry = history[effectiveIndex];
        set((storeState) => {
          const newTabs = new Map(storeState.tabs);
          const tab = newTabs.get(tabId);
          if (tab) {
            const newContent = entry.beforeContent;
            newTabs.set(tabId, {
              ...tab,
              content: newContent,
              isDirty: newContent !== tab.originalContent,
            });
          }
          return {
            tabs: newTabs,
            pairWritingHistoryIndex: {
              ...storeState.pairWritingHistoryIndex,
              [tabId]: effectiveIndex - 1,
            },
          };
        });

        return entry;
      },
      redoPairWriting: (tabId) => {
        const state = get();
        const history = state.pairWritingHistory[tabId] ?? [];
        const currentIndex = state.pairWritingHistoryIndex[tabId];
        const nextIndex = (typeof currentIndex === 'number' ? currentIndex : history.length - 1) + 1;
        if (nextIndex < 0 || nextIndex >= history.length) {
          return null;
        }

        const entry = history[nextIndex];
        set((storeState) => {
          const newTabs = new Map(storeState.tabs);
          const tab = newTabs.get(tabId);
          if (tab) {
            const newContent = entry.afterContent;
            newTabs.set(tabId, {
              ...tab,
              content: newContent,
              isDirty: newContent !== tab.originalContent,
            });
          }
          return {
            tabs: newTabs,
            pairWritingHistoryIndex: {
              ...storeState.pairWritingHistoryIndex,
              [tabId]: nextIndex,
            },
          };
        });

        return entry;
      },
      clearPairWritingHistory: (tabId) => set((state) => {
        if (!state.pairWritingHistory[tabId]) {
          return {};
        }
        const nextHistory = { ...state.pairWritingHistory };
        const nextIndex = { ...state.pairWritingHistoryIndex };
        delete nextHistory[tabId];
        delete nextIndex[tabId];
        return {
          pairWritingHistory: nextHistory,
          pairWritingHistoryIndex: nextIndex,
        };
      }),

      // ヘルプチャット
      helpThreads: {},
      helpThreadOrder: [],
      activeHelpThreadId: null,
      setActiveHelpThread: (threadId) =>
        set((state) => {
          if (threadId && !state.helpThreads[threadId]) {
            return state;
          }
          return { activeHelpThreadId: threadId };
        }),
      createHelpThread: (payload) => {
        const id = createId('help');
        const now = new Date().toISOString();
        const baseTitle = payload?.title?.trim() || '新しい問い合わせ';
        const state = get();
        const documentId = payload?.documentId ?? state.helpSettings.defaultDocumentId ?? '';
        const knowledgeBaseUrl = payload?.knowledgeBaseUrl ?? state.helpSettings.defaultKnowledgeBaseUrl ?? '';
        const thread: HelpThread = {
          id,
          title: baseTitle,
          createdAt: now,
          updatedAt: now,
          messages: [],
          documentId,
          knowledgeBaseUrl,
        };
        set((storeState) => ({
          helpThreads: { ...storeState.helpThreads, [id]: thread },
          helpThreadOrder: [id, ...storeState.helpThreadOrder.filter((existing) => existing !== id)],
          activeHelpThreadId: id,
        }));
        return thread;
      },
      updateHelpThread: (threadId, updates) =>
        set((state) => {
          const thread = state.helpThreads[threadId];
          if (!thread) {
            return state;
          }
          const nextMessages = updates.messages ? updates.messages.slice() : thread.messages;
          const nextThread: HelpThread = {
            ...thread,
            ...updates,
            messages: nextMessages,
            updatedAt: updates.updatedAt ?? new Date().toISOString(),
          };
          return {
            helpThreads: { ...state.helpThreads, [threadId]: nextThread },
          };
        }),
      addHelpMessage: (threadId, message) =>
        set((state) => {
          const thread = state.helpThreads[threadId];
          if (!thread) {
            return state;
          }
          const nextMessages = [...thread.messages, message];
          return {
            helpThreads: {
              ...state.helpThreads,
              [threadId]: {
                ...thread,
                messages: nextMessages,
                updatedAt: message.createdAt || new Date().toISOString(),
              },
            },
            helpThreadOrder: [threadId, ...state.helpThreadOrder.filter((id) => id !== threadId)],
            activeHelpThreadId: threadId,
          };
        }),
      removeHelpThread: (threadId) =>
        set((state) => {
          if (!state.helpThreads[threadId]) {
            return state;
          }
          const { [threadId]: _removed, ...rest } = state.helpThreads;
          const nextOrder = state.helpThreadOrder.filter((id) => id !== threadId);
          const nextActive = state.activeHelpThreadId === threadId ? nextOrder[0] ?? null : state.activeHelpThreadId;
          return {
            helpThreads: rest,
            helpThreadOrder: nextOrder,
            activeHelpThreadId: nextActive,
          };
        }),
      clearHelpThreads: () => set({ helpThreads: {}, helpThreadOrder: [], activeHelpThreadId: null }),
      helpSettings: {
        currentRole: 'editor',
        allowedRoles: {
          viewer: false,
          editor: true,
          admin: true,
        },
        maskFileContent: true,
        defaultDocumentId: '',
        defaultKnowledgeBaseUrl: '',
      },
      updateHelpSettings: (updates) =>
        set((state) => {
          const nextAllowedRoles = updates.allowedRoles
            ? { ...state.helpSettings.allowedRoles, ...updates.allowedRoles }
            : state.helpSettings.allowedRoles;
          return {
            helpSettings: {
              ...state.helpSettings,
              ...updates,
              allowedRoles: nextAllowedRoles,
            },
          };
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
        const viewModesObject: Record<string, EditorViewMode> = {};
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
          mermaidGenerationHistory: state.mermaidGenerationHistory,
          helpThreads: state.helpThreads,
          helpThreadOrder: state.helpThreadOrder,
          activeHelpThreadId: state.activeHelpThreadId,
          helpSettings: state.helpSettings,
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
          const viewModesMap = new Map<string, EditorViewMode>();
          const viewModesObj = state.viewModes as unknown as Record<string, EditorViewMode>;

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
          if (!state.pairWritingHistory) {
            state.pairWritingHistory = {};
          }
          if (!state.pairWritingHistoryIndex) {
            state.pairWritingHistoryIndex = {};
          }
          if (!state.mermaidGenerationHistory) {
            state.mermaidGenerationHistory = {};
          }
          if (!state.paneState) {
            state.paneState = {
              activeSidebar: 'explorer',
              isExplorerVisible: true,
              isGisVisible: false,
              isEditorVisible: true,
              isPreviewVisible: true,
              isTocVisible: true,
              isSearchVisible: false,
              isAnalysisVisible: false,
              isGitVisible: false,
              isHelpVisible: false,
              sidebarWidths: { ...DEFAULT_SIDEBAR_WIDTHS },
              gitHistoryHeight: DEFAULT_GIT_HISTORY_HEIGHT,
            };
          } else {
            let nextPaneState = state.paneState as PaneState & {
              isBrowserVisible?: boolean;
              activeSidebar?: PaneState['activeSidebar'] | 'browser';
              sidebarWidths?: PaneState['sidebarWidths'] & Record<string, number> & {
                browser?: number;
              };
            };

            if (nextPaneState.activeSidebar === 'browser') {
              const fallbackSidebar = nextPaneState.isExplorerVisible
                ? 'explorer'
                : nextPaneState.isGitVisible
                  ? 'git'
                : nextPaneState.isGisVisible
                  ? 'gis'
                : nextPaneState.isHelpVisible
                  ? 'help'
                  : null;
              nextPaneState = { ...nextPaneState, activeSidebar: fallbackSidebar };
            } else if (typeof nextPaneState.activeSidebar === 'undefined') {
              const inferredSidebar = nextPaneState.isExplorerVisible
                ? 'explorer'
                : nextPaneState.isGisVisible
                  ? 'gis'
                : nextPaneState.isGitVisible
                  ? 'git'
                : nextPaneState.isHelpVisible
                  ? 'help'
                  : null;
              nextPaneState = { ...nextPaneState, activeSidebar: inferredSidebar };
            }

            if (typeof nextPaneState.isBrowserVisible !== 'undefined') {
              const { isBrowserVisible: _legacyBrowserFlag, ...rest } = nextPaneState;
              nextPaneState = rest;
            }

            if (typeof nextPaneState.isGisVisible !== 'boolean') {
              nextPaneState = { ...nextPaneState, isGisVisible: false };
            }
            if (typeof nextPaneState.isGitVisible !== 'boolean') {
              nextPaneState = { ...nextPaneState, isGitVisible: false };
            }
            if (typeof nextPaneState.isHelpVisible !== 'boolean') {
              nextPaneState = { ...nextPaneState, isHelpVisible: false };
            }

            const nextSidebarWidths = {
              ...DEFAULT_SIDEBAR_WIDTHS,
              ...(nextPaneState.sidebarWidths ?? {}),
            } as Record<string, number>;
            if ('browser' in nextSidebarWidths) {
              delete nextSidebarWidths.browser;
            }

            nextPaneState = {
              ...nextPaneState,
              sidebarWidths: nextSidebarWidths as PaneState['sidebarWidths'],
            };

            if (typeof nextPaneState.gitHistoryHeight !== 'number') {
              nextPaneState = { ...nextPaneState, gitHistoryHeight: DEFAULT_GIT_HISTORY_HEIGHT };
            }

            state.paneState = nextPaneState;
          }

          if (!state.helpThreads) {
            state.helpThreads = {};
          }
          if (!Array.isArray(state.helpThreadOrder)) {
            state.helpThreadOrder = [];
          }
          if (typeof state.activeHelpThreadId === 'undefined') {
            state.activeHelpThreadId = null;
          }
          const defaultHelpSettings: HelpSettings = {
            currentRole: 'editor',
            allowedRoles: {
              viewer: false,
              editor: true,
              admin: true,
            },
            maskFileContent: true,
            defaultDocumentId: '',
            defaultKnowledgeBaseUrl: '',
          };
          if (!state.helpSettings) {
            state.helpSettings = defaultHelpSettings;
          } else {
            state.helpSettings = {
              ...defaultHelpSettings,
              ...state.helpSettings,
              allowedRoles: {
                ...defaultHelpSettings.allowedRoles,
                ...(state.helpSettings.allowedRoles ?? {}),
              },
              maskFileContent:
                typeof state.helpSettings.maskFileContent === 'boolean'
                  ? state.helpSettings.maskFileContent
                  : defaultHelpSettings.maskFileContent,
            };
          }
        }
      }
    }
  )
);
