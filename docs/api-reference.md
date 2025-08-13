# API Reference - ユーティリティ関数仕様

## 📚 概要

IDO Editor のコア機能を支える各種ユーティリティ関数の詳細API仕様です。

## 🗂️ ファイルシステム関数

### fileSystemUtils.ts

#### `openDirectory(): Promise<FileSystemDirectoryHandle>`
ディレクトリ選択ダイアログを開き、選択されたディレクトリハンドルを取得。

```typescript
const dirHandle = await openDirectory();
console.log(dirHandle.name); // ディレクトリ名
```

#### `buildFileTree(dirHandle: FileSystemDirectoryHandle): Promise<FileTree>`
ディレクトリハンドルから階層ファイルツリー構造を構築。

```typescript
interface FileTree {
  name: string;
  kind: 'file' | 'directory';
  children?: FileTree[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

const fileTree = await buildFileTree(dirHandle);
```

#### `readFileContent(fileHandle: FileSystemFileHandle): Promise<string>`
ファイルハンドルからテキストコンテンツを読み取り。

```typescript
const content = await readFileContent(fileHandle);
```

#### `writeFileContent(fileHandle: FileSystemFileHandle, content: string): Promise<void>`
ファイルハンドルにテキストコンテンツを書き込み。

```typescript
await writeFileContent(fileHandle, "新しいコンテンツ");
```

#### `searchInFiles(dirHandle: FileSystemDirectoryHandle, searchConfig: SearchConfig): Promise<SearchResult[]>`
ディレクトリ内ファイルの全文検索。

```typescript
interface SearchConfig {
  query: string;
  caseSensitive: boolean;
  useRegex: boolean;
  includePattern: string;
  excludePattern: string;
}

interface SearchResult {
  filePath: string;
  lineNumber: number;
  lineContent: string;
  matchIndex: number;
}

const results = await searchInFiles(dirHandle, searchConfig);
```

#### `replaceInFiles(dirHandle: FileSystemDirectoryHandle, replaceConfig: ReplaceConfig): Promise<ReplaceResult[]>`
ディレクトリ内ファイルの一括置換。

```typescript
interface ReplaceConfig extends SearchConfig {
  replacement: string;
}

interface ReplaceResult {
  filePath: string;
  replacementCount: number;
  success: boolean;
}

const results = await replaceInFiles(dirHandle, replaceConfig);
```

## 📊 データプレビュー関数

### dataPreviewUtils.ts

#### `parseCSV(content: string): Promise<any[]>`
CSV文字列をJavaScriptオブジェクト配列に変換。

```typescript
const csvData = await parseCSV(csvContent);
// => [{ col1: "value1", col2: "value2" }, ...]
```

#### `parseTSV(content: string): Promise<any[]>`  
TSV文字列をJavaScriptオブジェクト配列に変換。

```typescript
const tsvData = await parseTSV(tsvContent);
```

#### `parseJSON(content: string): any`
JSON文字列を安全にパース（エラーハンドリング付き）。

```typescript
const jsonData = parseJSON(jsonContent);
```

#### `parseYAML(content: string): any`
YAML文字列をJavaScriptオブジェクトに変換。

```typescript
const yamlData = parseYAML(yamlContent);
```

#### `parseExcel(file: File, options: ExcelParseOptions): Promise<any[]>`
Excelファイルを解析し、指定シートのデータを取得。

```typescript
interface ExcelParseOptions {
  sheetName?: string;
  startRow?: number;
  startCol?: number;
  endRow?: number;
  endCol?: number;
}

const excelData = await parseExcel(excelFile, {
  sheetName: "Sheet1",
  startRow: 1
});
```

#### `parseParquet(file: File): Promise<any[]>`
Parquetファイルを解析（簡易対応）。

```typescript
const parquetData = await parseParquet(parquetFile);
```

#### `detectFileType(fileName: string, content: string): string`
ファイル名と内容からファイルタイプを推定。

```typescript
const fileType = detectFileType("data.csv", content);
// => "csv"
```

## 📈 データ分析関数

### dataAnalysisUtils.ts

#### `executeSQL(data: any[], query: string): Promise<any[]>`
AlasQLエンジンでSQLクエリを実行。

```typescript
const results = await executeSQL(data, "SELECT * FROM ? WHERE age > 25");
```

#### `calculateStatistics(data: any[]): StatsSummary`
データの統計情報を計算（pandas.describe()相当）。

```typescript
interface StatsSummary {
  [column: string]: {
    count: number;
    mean?: number;
    std?: number;
    min?: number;
    '25%'?: number;
    '50%'?: number;
    '75%'?: number;
    max?: number;
  };
}

const stats = calculateStatistics(data);
```

#### `getColumnInfo(data: any[]): ColumnInfo`
各カラムの型・サンプル値・統計情報を分析。

```typescript
interface ColumnInfo {
  [column: string]: {
    type: string;
    nonNullCount: number;
    maxLength?: number;
    sample: any[];
  };
}

const columnInfo = getColumnInfo(data);
```

#### `prepareChartData(data: any[], settings: ChartSettings): ChartData`
グラフ描画用データを準備・集計。

```typescript
interface ChartSettings {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'stacked' | 'regression' | 'histogram';
  xAxis: string;
  yAxis: string;
  groupBy?: string;
  aggregation: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string[];
    borderColor?: string;
  }[];
}

const chartData = prepareChartData(data, settings);
```

#### `performRegression(xData: number[], yData: number[]): RegressionResult`
線形回帰分析を実行。

```typescript
interface RegressionResult {
  slope: number;
  intercept: number;
  rSquared: number;
  equation: string;
  predictions: number[];
}

const regression = performRegression([1,2,3,4], [2,4,6,8]);
```

#### `unionFiles(files: FileData[]): any[]`
複数ファイルをUNION結合。

```typescript
interface FileData {
  name: string;
  data: any[];
}

const unionData = unionFiles([file1Data, file2Data]);
```

#### `intersectionFiles(files: FileData[]): any[]`
複数ファイルのINTERSECTION結合。

```typescript
const intersectionData = intersectionFiles([file1Data, file2Data]);
```

#### `joinFiles(files: FileData[], joinKey: string, joinType: JoinType): any[]`
複数ファイルをJOIN結合。

```typescript
type JoinType = 'inner' | 'left' | 'right' | 'full';

const joinedData = joinFiles([file1Data, file2Data], 'id', 'inner');
```

## ✏️ エディタ関数

### editorUtils.ts

#### `getLanguageFromFileName(fileName: string): string`
ファイル名から言語タイプを推定。

```typescript
const language = getLanguageFromFileName("script.py");
// => "python"
```

#### `getThemeFromSettings(settings: EditorSettings): Extension`
設定からCodeMirrorテーマ拡張を取得。

```typescript
interface EditorSettings {
  theme: 'light' | 'dark';
  fontSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
}

const themeExtension = getThemeFromSettings(settings);
```

#### `createLanguageExtension(language: string): Extension`
指定言語のCodeMirror拡張を作成。

```typescript
const jsExtension = createLanguageExtension('javascript');
```

#### `formatCode(code: string, language: string): string`
コードフォーマッター（基本実装）。

```typescript
const formattedCode = formatCode(rawCode, 'javascript');
```

## 📚 目次生成関数

### tocUtils.ts

#### `generateTOC(markdownContent: string): TOCItem[]`
マークダウンコンテンツから目次を生成。

```typescript
interface TOCItem {
  id: string;
  title: string;
  level: number; // 1-6 (h1-h6)
  children?: TOCItem[];
}

const toc = generateTOC(markdownContent);
```

#### `createTOCTree(items: TOCItem[]): TOCItem[]`
フラットなTOCアイテムを階層ツリー構造に変換。

```typescript
const tocTree = createTOCTree(flatTocItems);
```

## 🔧 データフォーマット関数

### dataFormatUtils.ts

#### `convertToCSV(data: any[]): string`
JavaScript配列をCSV形式に変換。

```typescript
const csvString = convertToCSV(data);
```

#### `convertToJSON(data: any[]): string`
データをJSON形式に変換（整形済み）。

```typescript
const jsonString = convertToJSON(data);
```

#### `convertToYAML(data: any[]): string`
データをYAML形式に変換。

```typescript
const yamlString = convertToYAML(data);
```

#### `downloadAsFile(content: string, fileName: string, mimeType: string): void`
コンテンツをファイルとしてダウンロード。

```typescript
downloadAsFile(csvContent, "export.csv", "text/csv");
```

## 🚨 エラーハンドリング

### 共通エラータイプ
```typescript
interface APIError {
  code: string;
  message: string;
  details?: any;
}

// 使用例
try {
  const result = await executeSQL(data, query);
} catch (error: APIError) {
  console.error(`SQL Error [${error.code}]: ${error.message}`);
}
```

### エラーコード一覧
- `FILE_READ_ERROR`: ファイル読み込み失敗
- `FILE_WRITE_ERROR`: ファイル書き込み失敗
- `PARSE_ERROR`: データ解析失敗
- `SQL_EXECUTION_ERROR`: SQLクエリ実行失敗  
- `CHART_RENDER_ERROR`: グラフ描画失敗
- `PERMISSION_ERROR`: ファイルアクセス権限不足

## 🔄 非同期処理のベストプラクティス

### Promise チェーン
```typescript
// 推奨
await readFileContent(fileHandle)
  .then(content => parseCSV(content))
  .then(data => calculateStatistics(data))
  .catch(error => handleError(error));
```

### エラーハンドリング付きasync/await
```typescript
try {
  const content = await readFileContent(fileHandle);
  const data = await parseCSV(content);
  const stats = calculateStatistics(data);
  return stats;
} catch (error) {
  console.error('処理エラー:', error);
  throw new APIError('DATA_PROCESSING_ERROR', '処理中にエラーが発生しました');
}
```

## 🧪 テスト例

### ユニットテスト例
```typescript
// Jest テスト例
describe('dataAnalysisUtils', () => {
  test('calculateStatistics should return correct stats', () => {
    const testData = [
      { age: 25, salary: 50000 },
      { age: 30, salary: 60000 },
      { age: 35, salary: 70000 }
    ];
    
    const stats = calculateStatistics(testData);
    expect(stats.age.mean).toBe(30);
    expect(stats.age.count).toBe(3);
  });
});
```

この API リファレンスにより、開発者は IDO Editor の各ユーティリティ関数を効率的に活用し、新機能の開発やカスタマイズを行うことができます。