// タブに関する型定義
export interface TabData {
  id: string;
  name: string;
  content: string;
  originalContent: string;
  isDirty: boolean;
  type: 'text' | 'markdown' | 'md' | 'html' | 'json' | 'yaml' | 'sql' | 'csv' | 'tsv' | 'parquet' | 'mermaid' | 'mmd' | 'excel' | 'pdf' | 'ipynb';
  isReadOnly: boolean;
  file?: FileSystemFileHandle | File;
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
  isExplorerVisible: boolean;
  isEditorVisible: boolean;
  isPreviewVisible: boolean;
  isTocVisible: boolean;
  isSearchVisible: boolean;
  isAnalysisVisible: boolean;
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

// 分析データに関する型定義
export interface AnalysisData {
  columns: string[];
  rows: any[];
}

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

export type MapAggregation = 'sum' | 'avg' | 'count' | 'min' | 'max' | 'none';

export interface MapSettings {
  dataSource: string;
  latitudeColumn?: string;
  longitudeColumn?: string;
  geoJsonColumn?: string;
  wktColumn?: string;
  pathColumn?: string;
  polygonColumn?: string;
  heightColumn?: string;
  categoryColumn?: string;
  colorColumn?: string;
  aggregation: MapAggregation;
  pointRadius: number;
  columnRadius: number;
  elevationScale: number;
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
