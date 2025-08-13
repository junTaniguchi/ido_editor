# IDO Editor - 高機能データ分析エディタ

ReactとNext.jsを使用して構築された高機能エディタアプリケーションです。Zustandによる状態管理、CodeMirrorベースのテキスト編集、Excel/Wordエクスポート、複数データ形式のプレビュー、強力なデータ分析機能など多彩な機能を備えています。

## 🚀 主要機能

### エディタ機能
- **マルチタブエディタ** - 複数ファイルの同時編集
- **ファイルエクスプローラ** - File System Access APIによる直接ファイルアクセス
- **シンタックスハイライト** - 50+のプログラミング言語に対応
- **エディタとプレビューの分割表示** - リアルタイムプレビュー
- **ダークモード対応** - 自動テーマ切り替え

### マークダウン機能
- **リアルタイムプレビュー** - 編集内容を即座に反映
- **目次自動生成** - 階層構造の見出しナビゲーション
- **Mermaidダイアグラム対応** - コードブロック内の図表を自動描画
- **マークダウンツールバー** - ビジュアル編集機能
- **Word(.docx)エクスポート** - 高品質なWord文書出力

### データファイルプレビュー
- **CSV/TSV** - 表形式データの高性能表示、ヘッダー行自動認識
- **JSON/YAML** - 階層構造データの見やすい表示、フラット/ネスト切替
- **Excel(.xlsx/.xls)** - シート別プレビュー、データ範囲指定、ヘッダー設定
- **Parquet** - 列指向データフォーマット対応
- **Jupyter Notebook(.ipynb)** - セル別コンテンツ表示
- **PDF(.pdf)** - PDF.js統合プレビュー

### データ分析機能
- **単一ファイル分析** - ファイル単位での詳細データ分析
- **複数ファイル分析** - ファイル横断的なデータ統合・分析
- **SQLクエリ実行** - AlasQLによる強力なデータ操作
- **統計情報表示** - pandas.describe()相当の統計サマリー
- **多様なグラフ作成** - 棒、線、円、散布図、ヒストグラム、回帰分析、ガントチャート
- **関係性分析** - Cypherクエリによるグラフデータベース機能

### 検索・置換機能
- **フォルダ内全検索** - 正規表現対応
- **一括置換機能** - パターンマッチング置換
- **ファイルパターンフィルタ** - 対象ファイルの絞り込み

## セットアップ方法

### 必要条件

- [Node.js](https://nodejs.org/) 18.0.0以上
- [npm](https://www.npmjs.com/) 8.0.0以上
- **対応ブラウザ**：Chrome 86+、Edge 86+、またはその他のChromiumベースのブラウザ最新版
  - **重要**: ファイルシステムアクセス機能を使用するには、[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)をサポートするブラウザが必要です
  - Firefox、SafariなどではFile System Access APIがサポートされていないため、一部機能が利用できません

### リポジトリのクローン

```bash
git clone https://github.com/yourusername/ido_editor.git
cd ido_editor
```

### パッケージのインストール

```bash
npm install
```

このコマンドで、package.jsonに記載されているすべての依存パッケージがインストールされます。

### 開発用設定

特別な開発環境の設定は不要です。必要なパッケージはすべてnpmでインストールされます。

#### 開発時の注意点

- このアプリケーションはブラウザのFile System Access APIを使用しているため、ローカルファイルシステムへのアクセスには最新のChrome、Edge、またはその他のChromiumベースのブラウザが必要です。
- 開発時にはHTTPS接続またはlocalhost上での実行が必要です（File System Access APIのセキュリティ要件）。

## 起動方法

以下のコマンドを実行して開発サーバーを起動します：

```bash
npm run dev
```

このプロジェクトはnpmでセットアップされていますが、必要に応じて他のパッケージマネージャに移行する場合は追加の設定が必要になる場合があります。

ブラウザで [http://localhost:3000](http://localhost:3000) を開くとアプリケーションが表示されます。

## 使い方

### 基本操作

1. **フォルダを開く**：ファイルエクスプローラの「フォルダを開く」ボタンをクリックして、編集したいフォルダを選択します。
2. **ファイルを開く**：ファイルエクスプローラでファイルをクリックすると、新しいタブでファイルが開きます。
3. **タブ切り替え**：タブバーのタブをクリックすると、開いているファイル間を移動できます。
4. **ファイル編集**：エディタ部分でファイルの内容を編集できます。
5. **表示モード切替**：マークダウンやMermaidなどの特別ファイル形式では、「モード切替」ボタンで「エディタ」→「プレビュー」→「分割表示」の順に切り替えられます。
6. **マークダウンプレビュー**：マークダウンファイルでプレビューモードを有効にすると、リアルタイムプレビューが表示されます。プレビュー時には自動的に目次が表示され、見出しへのジャンプが可能です。
7. **Mermaidダイアグラムプレビュー**：`.mmd`ファイルでプレビューモードを有効にすると、ダイアグラムが表示されます。ズーム操作やSVG/PNG形式での保存、クリップボードへのコピーが可能です。
8. **データプレビュー**：CSV/TSV/JSON/YAML/Parquetファイルを開いた場合、右側にデータのプレビューが表示されます。
9. **データ分析**：CSV/TSV/JSON/YAML/Parquetファイルを開いた場合、上部の分析アイコンをクリックすると、SQLクエリ、統計情報表示、グラフ作成機能が利用できます。ガントチャート作成にはタスク名、開始日、終了日のフィールドが必要です。
10. **テーマ切り替え**：右上のアイコンをクリックすると、ライトモードとダークモードを切り替えられます。
11. **検索機能**：右上の検索アイコンをクリックすると、検索パネルが表示され、フォルダ内のファイルから文字列を検索できます。

### ショートカットキー

- エディタ内では通常のCodeMirrorのショートカットキーが使用できます。
- `Ctrl+S`（Windows/Linux）または `Cmd+S`（Mac）：ファイルの保存
- `Ctrl+Tab`または`Cmd+Tab`：タブ間の移動
- `Ctrl+F`または`Cmd+F`：検索パネルを開く
- `Esc`：検索パネルを閉じる

## 📁 ソースコード構成

アプリケーションのコードは次のように構成されています：

### エディタ・レイアウト

- **`/src/components/editor/Editor.tsx`** - CodeMirrorベースメインエディタ
- **`/src/components/layout/MainLayout.tsx`** - アプリケーション全体レイアウト
- **`/src/components/tabs/TabBar.tsx`** - マルチタブ管理
- **`/src/components/explorer/FileExplorer.tsx`** - ファイルシステムエクスプローラ

### プレビュー機能

- **`/src/components/preview/MarkdownPreview.tsx`** - マークダウンリアルタイムプレビュー
- **`/src/components/preview/MermaidPreview.tsx`** - Mermaid図表プレビュー（ズーム・エクスポート対応）
- **`/src/components/preview/DataPreview.tsx`** - データファイル統合プレビュー
- **`/src/components/preview/DataTable.tsx`** - 高機能データテーブル
- **`/src/components/preview/EditableDataTable.tsx`** - 編集可能データテーブル
- **`/src/components/preview/ObjectViewer.tsx`** - 階層構造データビューア
- **`/src/components/preview/ExcelPreview.tsx`** - Excelシート別プレビュー
- **`/src/components/preview/IpynbPreview.tsx`** - Jupyter Notebookプレビュー
- **`/src/components/preview/PdfPreview.tsx`** - PDFプレビュー

### データ分析機能（リファクタリング済み）

- **`/src/components/analysis/DataAnalysis.tsx`** - 単一ファイル分析メインコンポーネント（643行に最適化）
- **`/src/components/analysis/AnalysisTabNavigation.tsx`** - 分析タブナビゲーション（115行）
- **`/src/components/analysis/AnalysisSettingsPanel.tsx`** - 設定パネル（317行）
- **`/src/components/analysis/AnalysisChartRenderer.tsx`** - チャート描画コンポーネント（561行）
- **`/src/components/analysis/MultiFileAnalysis.tsx`** - 複数ファイル分析機能
- **`/src/components/analysis/QueryResultTable.tsx`** - SQLクエリ結果表示
- **`/src/components/analysis/InfoResultTable.tsx`** - 統計情報表示
- **`/src/components/analysis/RelationshipGraph.tsx`** - 関係性グラフ表示

### マークダウン編集支援

- **`/src/components/markdown/MarkdownToolbar.tsx`** - マークダウン編集ツールバー
- **`/src/components/markdown/MarkdownEditorExtension.tsx`** - エディタ拡張機能
- **`/src/components/markdown/MarkdownHelpDialog.tsx`** - ヘルプダイアログ
- **`/src/components/markdown/TableWizard.tsx`** - テーブル作成ウィザード

### その他

- **`/src/components/search/SearchPanel.tsx`** - 検索・置換パネル
- **`/src/components/modals/`** - 各種ダイアログコンポーネント

### ユーティリティ

- **`/src/lib/editorUtils.ts`**: エディタ関連のヘルパー関数（言語設定、テーマ設定など）
- **`/src/lib/fileSystemUtils.ts`**: ファイルシステム操作用のヘルパー関数（読み込み、検索、置換など）
- **`/src/lib/dataPreviewUtils.ts`**: データプレビュー関連のヘルパー関数（CSV/JSON/YAML/Parquet/Mermaidのパースなど）
- **`/src/lib/dataAnalysisUtils.ts`**: データ分析関連のヘルパー関数（SQLクエリ実行、統計計算、グラフデータ作成、5種類の回帰分析アルゴリズムなど）

### 状態管理

- **`/src/store/editorStore.ts`**: Zustandを使用したアプリケーションの状態管理

### 型定義

- **`/src/types/index.ts`**: アプリケーション全体で使用する型定義
- **`/src/types/file-system.d.ts`**: ファイルシステムAPIの型定義

## 状態管理

Zustandを使用した状態管理システムでは、以下の状態を管理しています：

### タブ管理
- **`tabs`**: 開いているタブのMap（キー: タブID、値: タブデータ）
- **`activeTabId`**: 現在アクティブなタブのID
- **アクション**: `setActiveTabId`, `addTab`, `updateTab`, `removeTab`, `getTab`

### ファイルエクスプローラ
- **`rootDirHandle`**: ルートディレクトリハンドル
- **`rootFileTree`**: ファイルツリー構造
- **`rootFolderName`**: ルートフォルダ名
- **アクション**: `setRootDirHandle`, `setRootFileTree`, `setRootFolderName`

### エディタ設定
- **`editorSettings`**: テーマ、フォントサイズなどの設定
- **アクション**: `updateEditorSettings`

### パネル表示状態
- **`paneState`**: 各パネル（エクスプローラ、エディタ、プレビューなど）の表示状態
- **アクション**: `updatePaneState`

### 検索設定
- **`searchSettings`**: 検索機能の設定（大文字小文字の区別、正規表現など）
- **アクション**: `updateSearchSettings`

### 分析機能
- **`analysisEnabled`**: 分析機能の有効/無効
- **`analysisData`**: 分析データ
- **`sqlResult`**: SQL実行結果
- **`chartSettings`**: チャート設定
- **アクション**: `setAnalysisEnabled`, `setAnalysisData`, `setSqlResult`, `updateChartSettings`

## データプレビュー機能

以下のファイル形式に対応したプレビュー機能を実装しています：

### 表形式データのプレビュー
- **CSV**: カンマ区切りの表形式データをテーブルで表示
- **TSV**: タブ区切りの表形式データをテーブルで表示
- **Parquet**: 列指向データフォーマットファイルをテーブルで表示（簡易対応）
- **Parquet**: 列指向データフォーマットファイルをテーブルで表示（簡易対応）
- **Jupyter Notebook (.ipynb)**: Notebookセル内容を簡易プレビュー表示
- **PDF (.pdf)**: PDFドキュメントをプレビュー表示（PDF.js組み込み）
- **Excel (.xlsx)**: 複数シートの選択・切替が可能なプレビュー。データテーブルとして表示、カラムソート・ページネーション・編集対応。

### 構造化データのプレビュー
- **JSON**: JSON形式のデータを階層構造で表示（json.human.js風の見やすい形式）
- **YAML**: YAML形式のデータを階層構造で表示
- データプレビューは「階層/フラット」表示切替、カラムソート、編集可能テーブル、ページネーション等のUI強化済み

### Mermaidダイアグラムプレビュー
- **mmd**: Mermaid形式のダイアグラムをリアルタイムでプレビュー表示
  - 対応図式タイプ
    - フローチャート（Flowchart）
    - シーケンス図（Sequence Diagram）
    - クラス図（Class Diagram）
    - 状態図（State Diagram）
    - ER図（Entity Relationship Diagram）
    - ガントチャート（Gantt Chart）
    - 円グラフ（Pie Chart）
  - 主な機能
    - ズームイン/アウト（拡大縮小）機能
    - フィットサイズ（自動調整）機能
    - マウスホイールによるズーム操作（Ctrl/Cmd+ホイール）
    - SVG形式でのダウンロード
    - PNG形式でのダウンロード
    - クリップボードへのコピー機能
    - 分割表示モード（エディタとプレビューを同時表示）
- Markdownファイル内のMermaidコードブロックもプレビューで自動描画されます（GitHub風）

プレビュー機能は以下の特徴があります：
- データの並べ替え機能（クリックでカラムソート）
- ページネーション機能（大きなデータセットでもスムーズに閲覧可能）
- ページサイズ変更機能（10/15/25/50/100行表示に対応）
- 階層データの折りたたみ/展開機能
- データ型に応じた色分け表示
- ダークモード対応
- 大きなファイルでのパフォーマンス最適化
- エラーハンドリングの強化
- Excel/Parquet等のバイナリファイルも文字化けせず正しくプレビュー可能

## 検索・置換機能

VSCodeライクな全文検索・置換機能を実装しています：

- ファイルやディレクトリ内のテキスト検索
- 大文字/小文字の区別、正規表現検索のサポート
- 検索結果のハイライト表示
- 一括置換機能
- ファイルパターンによるフィルタリング（includePattern/excludePattern）
- 検索パネルのトグル表示（ヘッダーの検索アイコンをクリック）
- 検索結果からファイルへの直接ジャンプ
- エラーハンドリングの強化

## 📊 データ分析機能

CSV、TSV、JSON、YAML、Excel、Parquetファイルに対して包括的な分析機能を提供しています：

### 🔍 単一ファイル分析モード

#### SQLクエリ機能
- **AlasQL**エンジンによる高性能SQL実行
- SELECT、WHERE、GROUP BY、ORDER BY構文サポート
- クエスチョンマーク（?）による簡易テーブル参照
- クエリ結果の即座テーブル表示
- 階層データの平坦化表示/ネスト表示切り替え

#### 統計情報表示
- **pandas.describe()相当**の詳細統計サマリー
- データ型別統計情報（数値・文字列・null値の分析）
- 各カラムの基本情報（型、非null件数、最大文字数、サンプル値）
- 欠損値の可視化と分析

#### 高度なグラフ作成機能
**対応グラフタイプ（8種類）:**
- **棒グラフ** - カテゴリ別集計値の比較
- **折れ線グラフ** - 時系列データやトレンド分析
- **円グラフ** - 構成比の可視化
- **散布図** - 2変数間の相関関係
- **積立棒グラフ** - カテゴリ別の多次元データ比較
- **回帰分析グラフ** - 5種類の回帰タイプによる予測線表示
- **ヒストグラム** - データ分布の可視化
- **ガントチャート** - プロジェクトスケジュール・タスク管理可視化

**回帰分析機能（5種類の回帰タイプ）:**
- **線形回帰** - y = ax + b の直線フィッティング
- **多項式回帰** - y = a₀ + a₁x + a₂x² + ... + aₙxⁿ の曲線フィッティング
- **指数回帰** - y = ae^(bx) の指数関数フィッティング
- **べき乗回帰** - y = ax^b のべき乗関数フィッティング
- **対数回帰** - y = a ln(x) + b の対数関数フィッティング

**集計・分析機能:**
- **集計方法**: 合計・平均・カウント・最小値・最大値
- **グループ分け**: カテゴリフィールドによる多次元分析
- **データソース選択**: 元データ・クエリ結果からの柔軟な分析
- **リアルタイム更新**: 設定変更時の即座グラフ反映

#### 関係性分析
- **Cypherクエリ**による関係データの探索
- **Force Graphレイアウト**による関係性の可視化
- ノード・エッジの動的操作とズーム機能

### 🔗 複数ファイル分析モード

#### ファイル統合機能
- **UNION結合** - 同じスキーマファイルの縦結合
- **INTERSECTION結合** - 共通データの抽出
- **JOIN結合** - キー項目による横結合

#### FROM句指定機能
- 特定ファイルを指定したSQLクエリ実行
- `FROM filename` 構文による柔軟なデータ操作
- 複数ファイル間の横断的分析

#### Excel多種形式対応
- **シート選択機能** - 複数シートから任意のシートを選択
- **データ範囲指定** - 開始行・列、終了行・列の柔軟な指定
- **ヘッダー設定** - ヘッダー行の有無を設定可能
- **リアルタイム設定** - 設定変更時の即座データ更新

#### クロス集計機能
- ファイル間でのピボットテーブル作成
- 多次元データの統計的比較

### 🛠️ 技術仕様

**使用技術:**
- **AlasQL** - ブラウザ内高速SQL処理
- **jStat** - 統計計算ライブラリ
- **自前実装回帰分析** - 5種類の数学的回帰計算エンジン
- **Plotly.js** - インタラクティブ可視化
- **React Chart.js** - グラフレンダリング
- **React Force Graph** - ネットワーク図表示

**最適化:**
- **コンポーネント分離設計** - メンテナブルなアーキテクチャ
- **レスポンシブUI** - モバイル・デスクトップ対応
- **ダークモード** - 全機能完全対応
- **エラーハンドリング** - 堅牢なエラー処理


## 🔧 技術スタック

### コアフレームワーク
- **[Next.js 15.4.5](https://nextjs.org)** - React Serverフレームワーク
- **[React 19](https://reactjs.org)** - UIライブラリ
- **[TypeScript 5.0+](https://www.typescriptlang.org)** - 型安全JavaScript

### 状態管理・UI
- **[Zustand](https://github.com/pmndrs/zustand)** - 軽量状態管理
- **[CodeMirror 6](https://codemirror.net)** - 高性能テキストエディタ
- **[Tailwind CSS](https://tailwindcss.com)** - ユーティリティファーストCSS
- **[React Icons](https://react-icons.github.io/react-icons/)** - アイコンライブラリ

### データ処理・表示
- **[@tanstack/react-table](https://tanstack.com/table/latest)** - 高性能データテーブル
- **[PapaParse](https://www.papaparse.com/)** - CSV/TSVパーサー
- **[js-yaml](https://github.com/nodeca/js-yaml)** - YAMLパーサー
- **[XLSX](https://sheetjs.com/)** - Excel形式サポート
- **[apache-arrow](https://arrow.apache.org/docs/js/)** - Parquetデータ処理

### マークダウン・ドキュメント
- **[React Markdown](https://github.com/remarkjs/react-markdown)** - マークダウンレンダリング
- **[Mermaid](https://mermaid.js.org/)** - 図表・ダイアグラム描画
- **[PDF.js](https://mozilla.github.io/pdf.js/)** - PDFレンダリング

### データ分析・可視化
- **[AlasSQL](https://github.com/AlaSQL/alasql)** - ブラウザ内SQL実行エンジン
- **[jStat](https://github.com/jstat/jstat)** - 統計計算ライブラリ
- **自前実装回帰分析エンジン** - 線形代数・ガウス消去法による5種類の回帰計算
- **[Plotly.js](https://plotly.com/javascript/)** - インタラクティブグラフライブラリ
- **[Chart.js](https://www.chartjs.org/)** + **[react-chartjs-2](https://react-chartjs-2.js.org/)** - チャート描画
- **[React Force Graph](https://github.com/vasturiano/react-force-graph)** - ネットワーク図可視化

## ✨ 最新実装機能（2025年1月更新）

### 包括的回帰分析システム
- **5種類の回帰アルゴリズム実装** - 線形、多項式、指数、べき乗、対数回帰の完全自前実装
- **数学的厳密性** - ガウス消去法による連立方程式求解、座標変換による非線形回帰
- **高精度計算** - 浮動小数点誤差対策、特異値処理、数値安定性の確保
- **単一・複数ファイル対応** - 全分析モードで統一された回帰機能
- **リアルタイム計算** - 設定変更時の即座予測線更新

### リファクタリング完了
- **DataAnalysis.tsx最適化** - 3,529行→643行（82%削減）
- **コンポーネント分離** - 保守性向上（4つの独立コンポーネントに分割）
- **型安全性強化** - TypeScriptエラーゼロ達成
- **パフォーマンス最適化** - ビルド時間短縮、メモリ効率向上

### 強化されたデータ分析機能
- **8種類のグラフタイプ** - 棒、線、円、散布図、積立棒、回帰、ヒストグラム、ガントチャート
- **5種類の回帰分析** - 線形、多項式、指数、べき乗、対数回帰の自前実装
- **ガントチャート機能** - プロジェクト管理・タスクスケジュール可視化（Plotly.js統合）
- **高度な集計処理** - sum/avg/count/min/max による多次元分析
- **Cypherクエリサポート** - グラフデータベース機能
- **リアルタイムプレビュー** - 設定変更の即座反映

### Excel機能拡充
- **シート別読み込み** - 任意シートの選択的読み込み（単一・複数ファイル分析対応）
- **データ範囲指定** - 開始行・列・終了行・列の柔軟な指定
- **ヘッダー認識強化** - ヘッダー行の自動判定と手動設定
- **プレビュー最適化** - 大容量ファイルの高速表示
- **複数ファイル分析統合** - Excel設定の個別ファイル管理

### UI/UX改善
- **設定パネル折りたたみ** - スクリーン領域の効率活用
- **階層・フラット表示切替** - データ表示形式の柔軟性
- **タブアイコン統一** - 直感的なナビゲーション
- **ダークモード完全対応** - 全機能でのテーマ一貫性

### エラー処理・安定性
- **堅牢なエラーハンドリング** - undefined/null値の安全な処理
- **メモリリーク対策** - 適切なクリーンアップ処理
- **型チェック強化** - ランタイムエラーの事前防止

## 🚀 今後の拡張予定

### 分析機能拡張
- **機械学習モデル統合** - scikit-learn.js等のML機能
- **時系列分析** - ARIMA、季節調整等の高度分析
- **Jupyter Notebookエディタ** - セル実行・出力表示機能

### ファイル形式拡張
- **Parquet完全サポート** - バイナリパース最適化
- **Database接続** - PostgreSQL、MySQL等への直接接続
- **API統合** - REST/GraphQL APIからのデータ取得

### コラボレーション機能
- **リアルタイム共同編集** - WebSocketベース協調編集
- **バージョン管理統合** - Git操作のGUI化
- **コメント・レビュー** - ファイル単位の協調作業

## 📚 サンプルデータ

`/test_data/` ディレクトリに各種形式のテストファイルを同梱：
- **CSV/TSV**: iris.csv, sales_data.csv, weather_data.tsv, project_schedule.csv（ガントチャート用）
- **JSON/YAML**: iris.json, products.yaml, employees.json  
- **Excel**: iris.xlsx, comprehensive_analysis.xlsx, timeseries_sales.xlsx
- **Mermaid**: flowchart.mmd, sequence.mmd, class.mmd, gantt.mmd等
- **Markdown**: mermaid_sample.md（図表含む総合サンプル）
