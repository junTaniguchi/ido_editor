# コンポーネント構造詳細

## 🏗️ 全体構成

IDO Editor は機能ごとに分離された独立コンポーネントで構成されており、保守性と拡張性を重視した設計になっています。

## 📱 メインレイアウト

### MainLayout.tsx
```typescript
// アプリケーション全体のレイアウト管理
interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  // ファイルエクスプローラ、エディタ、プレビューの配置
  // テーマ管理、状態管理の統合
};
```

**主要機能**:
- 3ペイン レイアウト (Explorer | Editor | Preview)
- レスポンシブ対応
- ダークモード切替
- パネル表示/非表示制御

## 🗂️ ファイル管理

### FileExplorer.tsx
```typescript
interface FileTree {
  name: string;
  kind: 'file' | 'directory';
  children?: FileTree[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}
```

**主要機能**:
- File System Access API 統合
- 階層ファイルツリー表示
- ファイル選択・開く機能
- コンテキストメニュー

### TabBar.tsx
```typescript
interface Tab {
  id: string;
  title: string;
  content: string;
  language: string;
  isDirty: boolean;
  filePath?: string;
}
```

**主要機能**:
- マルチタブ管理
- タブ並び替え (Drag & Drop)
- 未保存状態表示
- タブ閉じる機能

## ✏️ エディタ機能

### Editor.tsx
**使用ライブラリ**: CodeMirror 6

```typescript
interface EditorProps {
  value: string;
  language: string;
  theme: 'light' | 'dark';
  onChange: (value: string) => void;
}
```

**機能**:
- 50+ プログラミング言語対応
- シンタックスハイライト
- 自動インデント
- 検索・置換
- キーボードショートカット

### MarkdownToolbar.tsx
```typescript
interface ToolbarAction {
  icon: React.ReactNode;
  title: string;
  action: () => void;
  shortcut?: string;
}
```

**機能**:
- ビジュアル編集ボタン
- テーブルウィザード
- ヘルプダイアログ
- ショートカットキー対応

## 👁️ プレビュー機能

### MarkdownPreview.tsx
**使用ライブラリ**: react-markdown, mermaid

```typescript
interface MarkdownPreviewProps {
  content: string;
  darkMode: boolean;
}
```

**機能**:
- リアルタイムプレビュー
- 目次自動生成
- Mermaid図表描画
- Word エクスポート

### DataPreview.tsx
**統合プレビューシステム**

```typescript
interface DataPreviewProps {
  data: any[];
  fileType: 'csv' | 'json' | 'yaml' | 'excel' | 'parquet';
  fileName: string;
}
```

**対応形式**:
- CSV/TSV: DataTable コンポーネント
- JSON/YAML: ObjectViewer コンポーネント  
- Excel: ExcelPreview コンポーネント
- Parquet: 簡易対応
- PDF: PdfPreview コンポーネント

### DataTable.tsx
**高機能データテーブル**

```typescript
interface DataTableProps {
  data: Record<string, any>[];
  pageSize?: number;
  sortable?: boolean;
  editable?: boolean;
}
```

**機能**:
- ページネーション
- カラムソート
- データ編集
- 検索・フィルタリング
- CSV エクスポート

## 📊 データ分析コンポーネント

### DataAnalysis.tsx (643行に最適化)
**メインコンポーネント**: 分析機能の統合管理

```typescript
interface DataAnalysisProps {
  data: any[];
  fileName: string;
  fileType: string;
}
```

### AnalysisTabNavigation.tsx (115行)
**タブナビゲーション管理**

```typescript
interface AnalysisTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}
```

**タブ構成**:
- SQL クエリ
- 統計情報
- グラフ作成
- 関係性分析

### AnalysisSettingsPanel.tsx (317行)
**分析設定パネル**

```typescript
interface ChartSettings {
  chartType: ChartType;
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
}
```

**機能**:
- グラフタイプ選択
- 軸設定
- 集計方法設定
- データソース選択
- 折りたたみUI

### AnalysisChartRenderer.tsx (561行)
**チャート描画エンジン**

```typescript
interface ChartRendererProps {
  data: any[];
  settings: ChartSettings;
  darkMode: boolean;
}
```

**対応チャート (7種類)**:
- Bar Chart (Plotly.js)
- Line Chart (Chart.js)  
- Pie Chart (Chart.js)
- Scatter Plot (Plotly.js)
- Stacked Bar (Chart.js)
- Regression (Plotly.js)
- Histogram (Plotly.js)

### MultiFileAnalysis.tsx
**複数ファイル統合分析**

```typescript
interface MultiFileAnalysisProps {
  files: FileData[];
  analysisType: 'union' | 'intersection' | 'join';
}
```

**機能**:
- UNION結合
- INTERSECTION結合  
- JOIN結合
- FROM句指定
- クロス集計

## 🔍 検索機能

### SearchPanel.tsx
**VSCode風全文検索**

```typescript
interface SearchConfig {
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
  includePattern: string;
  excludePattern: string;
}
```

**機能**:
- フォルダ内検索
- 正規表現対応
- ファイルパターンフィルタ
- 一括置換
- 結果ハイライト

## 🎛️ モーダル・ダイアログ

### ConfirmDialog.tsx
```typescript
interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}
```

### InputDialog.tsx
```typescript
interface InputDialogProps {
  isOpen: boolean;
  title: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}
```

### ContextMenu.tsx
```typescript
interface MenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  divider?: boolean;
}
```

## 🔄 状態管理統合

### Zustand Store 連携
```typescript
// 各コンポーネントでの状態管理統合例
const MyComponent: React.FC = () => {
  const { 
    activeTabId, 
    tabs,
    updateTab,
    analysisData,
    setAnalysisData 
  } = useEditorStore();
  
  // コンポーネント固有ロジック
};
```

## 📈 パフォーマンス最適化

### React.memo 適用箇所
```typescript
// 重いコンポーネントのメモ化
const DataTable = React.memo<DataTableProps>(({ data, ...props }) => {
  // 実装
});

const ChartRenderer = React.memo<ChartRendererProps>(({ data, settings }) => {
  // 実装  
});
```

### useMemo/useCallback 最適化
```typescript
const ExpensiveComponent: React.FC = ({ data }) => {
  // 重い計算処理のメモ化
  const processedData = useMemo(() => {
    return heavyDataProcessing(data);
  }, [data]);
  
  // イベントハンドラのメモ化
  const handleClick = useCallback(() => {
    // ハンドラ処理
  }, [dependency]);
  
  return <div>{/* レンダリング */}</div>;
};
```

## 🎨 デザインシステム

### 共通スタイリング
```typescript
// Tailwind CSS クラス統一
const commonStyles = {
  card: 'bg-white dark:bg-gray-900 rounded-lg shadow-md p-4',
  button: 'px-4 py-2 rounded-md font-medium transition-colors',
  input: 'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md',
  table: 'min-w-full divide-y divide-gray-300 dark:divide-gray-700'
};
```

### ダークモード対応
```tsx
// 全コンポーネントでの一貫したダークモード実装
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">
  <button className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700">
    Action
  </button>
</div>
```

## 🔌 拡張性設計

### プラグイン型アーキテクチャ
```typescript
// 将来のプラグインシステム設計
interface Plugin {
  id: string;
  name: string;
  version: string;
  components: {
    [key: string]: React.ComponentType;
  };
  hooks: {
    [key: string]: () => any;
  };
}
```

### コンポーネント登録システム
```typescript
// 動的コンポーネント登録
const ComponentRegistry = {
  register: (name: string, component: React.ComponentType) => void;
  get: (name: string) => React.ComponentType | undefined;
  list: () => string[];
};
```

この設計により、新機能を既存コードに影響を与えずに追加できる拡張性の高いアーキテクチャを実現しています。