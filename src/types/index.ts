import type { MermaidDiagramType } from '@/lib/mermaid/types';

// タブに関する型定義
export interface TabData {
  id: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  type:
    | 'text'
    | 'markdown'
    | 'md'
    | 'html'
    | 'json'
    | 'yaml'
    | 'sql'
    | 'csv'
    | 'tsv'
    | 'parquet'
    | 'mermaid'
    | 'mmd'
    | 'geojson'
    | 'kml'
    | 'kmz'
    | 'shapefile'
    | 'excel'
    | 'pdf'
    | 'ipynb'
    | 'git-history'
    | 'git-diff'
    | 'git-commit-diff';
  isReadOnly: boolean;
  file?: FileSystemFileHandle | File;
}

export type PairWritingPurpose = 'translate' | 'rewrite';

export interface PairWritingHistoryEntry {
  id: string;
  tabId: string;
  purpose: PairWritingPurpose;
  originalText: string;
  transformedText: string;
  beforeContent: string;
  afterContent: string;
  rangeFrom: number;
  rangeTo: number;
  targetLanguage?: string | null;
  rewriteInstruction?: string | null;
  createdAt: string;
}

export interface MermaidGenerationHistoryEntry {
  id: string;
  diagramType: MermaidDiagramType;
  prompt: string;
  mermaidCode: string;
  summary?: string;
  createdAt: string;
  appliedAt?: string | null;
}

// ファイルツリーに関する型定義
export interface FileTreeItem {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileTreeItem[];
  fileHandle?: FileSystemFileHandle;
  directoryHandle?: FileSystemDirectoryHandle;
}

// エディタの設定に関する型定義
export interface EditorSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  scrollSyncEnabled: boolean;
  dataDisplayMode: 'flat' | 'nested';
  lineWrapping: boolean;
  rectangularSelection: boolean;
}

// パネル表示状態に関する型定義
export interface PaneState {
  activeSidebar: 'explorer' | 'gis' | 'git' | 'help' | null;
  isExplorerVisible: boolean;
  isGisVisible: boolean;
  isEditorVisible: boolean;
  isPreviewVisible: boolean;
  isTocVisible: boolean;
  isSearchVisible: boolean;
  isAnalysisVisible: boolean;
  isGitVisible: boolean;
  isHelpVisible: boolean;
}

// コンテキストメニューに関する型定義
export interface ContextMenuTarget {
  path: string | null;
  name: string | null;
  isFile: boolean;
}

// 検索設定に関する型定義
export interface SearchSettings {
  caseSensitive: boolean;
  useRegex: boolean;
  wholeWord: boolean;
  includePattern: string;
  excludePattern: string;
}

// 検索結果の型定義
export interface SearchResult {
  filePath: string;
  fileName: string;
  matches: SearchMatch[];
  fileHandle?: FileSystemFileHandle;
}

export interface SearchMatch {
  line: number;
  text: string;
  startCol: number;
  endCol: number;
  matchText: string;
  replaced?: boolean;
}

// チャートビルダーに関する型定義
export type ResultChartType =
  | 'bar'
  | 'line'
  | 'scatter'
  | 'pie'
  | 'histogram'
  | 'stacked-bar'
  | 'regression'
  | 'bubble'
  | 'sunburst'
  | 'gantt'
  | 'treemap'
  | 'streamgraph'
  | 'venn';

export type ResultAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max';

export interface ChartDesignerSettings {
  chartType: ResultChartType;
  title: string;
  xField: string;
  yField: string;
  aggregation: ResultAggregation;
  bins: number;
  categoryField: string;
  vennFields: string[];
  bubbleSizeField: string;
  ganttTaskField: string;
  ganttStartField: string;
  ganttEndField: string;
  sunburstLevel1Field: string;
  sunburstLevel2Field: string;
  sunburstLevel3Field: string;
  pieHole: number;
  sunburstHole: number;
  collapsed: boolean;
}

export interface AnalysisDataset {
  columns: string[];
  rows: any[];
  chartSettings?: ChartDesignerSettings;
}

// 分析データに関する型定義
export type AnalysisData = Record<string, AnalysisDataset>;

// SQLクエリ結果に関する型定義
export interface SqlResult {
  columns: string[];
  rows: any[];
  error?: string;
}

// ノートブックスナップショット Meta
export interface SqlNotebookSnapshotMeta {
  name: string;
  exportedAt?: string;
}

// チャート設定に関する型定義
export interface ChartSettings {
  type:
    | 'bar'
    | 'line'
    | 'pie'
    | 'scatter'
    | 'stacked-bar'
    | 'regression'
    | 'histogram'
    | 'bubble'
    | 'sunburst'
    | 'gantt'
    | 'treemap'
    | 'streamgraph'
    | 'venn';
  xAxis: string;
  yAxis: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none';
  categoryField?: string;
  dataSource: 'originalData' | 'queryResult';  // 元データまたはクエリ結果を使用するかの選択
  options?: {
    bins?: number;
    regressionType?: 'linear' | 'exponential' | 'polynomial' | 'power' | 'logarithmic';
    regressionOrder?: number;
    startDateField?: string;
    endDateField?: string;
    taskNameField?: string;
    vennFields?: string[];
  }
}

// SQLノートブックセルに関する型定義
export interface SqlNotebookCell {
  id: string;
  title: string;
  query: string;
  status: 'idle' | 'running' | 'success' | 'error';
  error: string | null;
  result: any[] | null;
  originalResult: any[] | null;
  columns: string[];
  executedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type HelpMessageRole = 'user' | 'assistant';

export interface HelpMessageMetadata {
  maskedFiles?: { path: string; reason: string }[];
  maskedPatterns?: string[];
}

export interface HelpMessage {
  id: string;
  role: HelpMessageRole;
  content: string;
  createdAt: string;
  metadata?: HelpMessageMetadata;
}

export interface HelpThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: HelpMessage[];
  documentId?: string;
  knowledgeBaseUrl?: string;
}

export type HelpUserRole = 'viewer' | 'editor' | 'admin';

export interface HelpSettings {
  currentRole: HelpUserRole;
  allowedRoles: Record<HelpUserRole, boolean>;
  maskFileContent: boolean;
  defaultDocumentId: string;
  defaultKnowledgeBaseUrl: string;
}
