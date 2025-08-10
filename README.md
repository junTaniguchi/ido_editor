# 高機能エディタ

ReactとNext.jsを使用して構築された高機能エディタアプリケーションです。Zustandによる状態管理、CodeMirrorベースのテキスト編集、Excel/Wordエクスポート、複数データ形式のプレビュー、Markdown内Mermaid描画など多彩な機能を備えています。

## 機能一覧

- マルチタブエディタ
- ファイルエクスプローラ（ファイルシステムアクセスAPI）
- マークダウンプレビュー
- Mermaidダイアグラムのプレビュー、ズーム、エクスポート機能
- CSV、TSV、JSON、YAML、Parquet、Jupyter Notebook（.ipynb）、PDF（.pdf）ファイルのプレビュー
- データ分析機能（SQL、統計情報、グラフ作成）
- フォルダ内全検索・置換機能
- エディタとプレビューの分割表示
- ダークモード対応
- 各種プログラミング言語のシンタックスハイライト
- Excel（.xlsx）ファイルのプレビュー（複数シート切替対応）
- Excel形式でのエクスポート（分析モード・データプレビューからダウンロード可能）
- Word（.docx）エクスポート（Markdown→Word変換）
- MarkdownプレビューでMermaidコードブロックも描画可能

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
9. **データ分析**：CSV/TSV/JSON/YAML/Parquetファイルを開いた場合、上部の分析アイコンをクリックすると、SQLクエリ、統計情報表示、グラフ作成機能が利用できます。
10. **テーマ切り替え**：右上のアイコンをクリックすると、ライトモードとダークモードを切り替えられます。
11. **検索機能**：右上の検索アイコンをクリックすると、検索パネルが表示され、フォルダ内のファイルから文字列を検索できます。

### ショートカットキー

- エディタ内では通常のCodeMirrorのショートカットキーが使用できます。
- `Ctrl+S`（Windows/Linux）または `Cmd+S`（Mac）：ファイルの保存
- `Ctrl+Tab`または`Cmd+Tab`：タブ間の移動
- `Ctrl+F`または`Cmd+F`：検索パネルを開く
- `Esc`：検索パネルを閉じる

## ソースコード構成

アプリケーションのコードは次のように構成されています：

### コンポーネント

- **`/src/components/editor/Editor.tsx`**: CodeMirrorを使用したメインエディタコンポーネント
- **`/src/components/explorer/FileExplorer.tsx`**: ファイルシステムを表示・操作するエクスプローラコンポーネント
- **`/src/components/preview/MarkdownPreview.tsx`**: マークダウンのリアルタイムプレビューコンポーネント
- **`/src/components/preview/MermaidPreview.tsx`**: Mermaidダイアグラムのプレビュー、ズーム、SVG/PNG保存機能を提供するコンポーネント
- **`/src/components/preview/DataPreview.tsx`**: データファイル（CSV/TSV/JSON/YAML/Parquet）のプレビューコンポーネント
- **`/src/components/preview/DataTable.tsx`**: 表形式データの表示コンポーネント
- **`/src/components/preview/ObjectViewer.tsx`**: 階層構造データの表示コンポーネント
- **`/src/components/analysis/DataAnalysis.tsx`**: データ分析機能（SQL、統計情報、グラフ）を提供するコンポーネント
- **`/src/components/search/SearchPanel.tsx`**: 検索・置換機能を提供するパネルコンポーネント
- **`/src/components/tabs/TabBar.tsx`**: 複数ファイルを管理するタブバーコンポーネント
- **`/src/components/layout/MainLayout.tsx`**: アプリ全体のレイアウトを管理するコンポーネント

### ユーティリティ

- **`/src/lib/editorUtils.ts`**: エディタ関連のヘルパー関数（言語設定、テーマ設定など）
- **`/src/lib/fileSystemUtils.ts`**: ファイルシステム操作用のヘルパー関数（読み込み、検索、置換など）
- **`/src/lib/dataPreviewUtils.ts`**: データプレビュー関連のヘルパー関数（CSV/JSON/YAML/Parquet/Mermaidのパースなど）
- **`/src/lib/dataAnalysisUtils.ts`**: データ分析関連のヘルパー関数（SQLクエリ実行、統計計算、グラフデータ作成など）

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

## データ分析機能

CSV、TSV、JSON、YAML、Parquetファイルに対して以下の分析機能を提供しています：

### SQLクエリ機能
- **AlasQL**を使用したSQL風クエリの実行
- データに対してSELECT文を実行可能
- クエリ結果のテーブル表示
- クエスチョンマーク（?）を使用した簡易クエリ構文

### 統計情報表示
- pandasのdescribe()関数に相当する統計情報の表示
- 数値カラムに対する基本統計量（平均、標準偏差、最小値、最大値、四分位数など）
- 非数値カラムに対するユニーク値のカウント
- 各カラムに対する欠損値のカウント

### グラフ作成機能
- 以下のグラフタイプをサポート
  - 棒グラフ（Bar Chart）
  - 折れ線グラフ（Line Chart）
  - 円グラフ（Pie Chart）
  - 散布図（Scatter Plot）
- 集計方法の選択
  - 合計（sum）
  - 平均（avg）
  - カウント（count）
  - 最小値（min）
  - 最大値（max）
- X軸・Y軸の選択機能
- グラフのリアルタイム更新

主な特徴：
- AlasQLによる強力なSQLクエリ機能
- jStatを使用した正確な統計計算
- Plotlyによるインタラクティブな可視化
- タブ切り替えによる機能分離
- ダークモード対応
- 直感的なUI


## 技術スタック

- [Next.js](https://nextjs.org) - Reactフレームワーク
- [React](https://reactjs.org) - UIライブラリ
- [TypeScript](https://www.typescriptlang.org) - 型付きJavaScript
- [Zustand](https://github.com/pmndrs/zustand) - 状態管理
- [CodeMirror](https://codemirror.net) - テキストエディタ
- [Tailwind CSS](https://tailwindcss.com) - スタイリング
- [React Markdown](https://github.com/remarkjs/react-markdown) - マークダウンレンダリング
- [Mermaid](https://mermaid.js.org/) - ダイアグラム描画
- [PapaParse](https://www.papaparse.com/) - CSV/TSVデータのパース
- [js-yaml](https://github.com/nodeca/js-yaml) - YAMLデータのパース
- [apache-arrow](https://arrow.apache.org/docs/js/) - Parquetデータの処理
- [@tanstack/react-table](https://tanstack.com/table/latest) - データテーブル表示
- [AlasQL](https://github.com/AlaSQL/alasql) - ブラウザ内SQL処理
- [Plotly](https://plotly.com/javascript/) - グラフ描画
- [jStat](https://github.com/jstat/jstat) - 統計計算
- [React Icons](https://react-icons.github.io/react-icons/) - アイコンライブラリ
- [React Force Graph](https://github.com/vasturiano/react-force-graph) - グラフ・ネットワーク可視化

## 実装済み機能

- ファイル作成/削除機能
- コンテキストメニュー（右クリックメニュー）
  - 新規ファイル作成
  - 新規フォルダ作成
  - ファイル/フォルダ名の変更
  - ファイル/フォルダの削除
  - フォルダの更新（リフレッシュ）
- マークダウン目次機能
  - プレビュー時の自動目次表示
  - 見出しへのジャンプ機能
  - 階層表示と折りたたみ/展開
- マークダウンエディタツール
  - 見出し（H1〜H6）
  - テキストスタイル（太字、斜体、取り消し線）
  - リスト（番号付き、箇条書き、タスクリスト）
  - リンクと画像の挿入
  - コードブロック（言語指定可能）
  - 引用ブロック（ネスト対応）
  - テーブル作成ウィザード
  - 選択範囲の一括処理（リスト変換、インデント、コメントなど）
  - 行折り返しのON/OFF切り替え
  - 矩形選択（カラム選択）機能
  - ショートカットキー（Ctrl+B, Ctrl+I, Ctrl+K, Ctrl+1-3 など）
  - ツールバーによる簡単な書式設定
  - マークダウンヘルプ表示
- JSON関係グラフ機能
  - React Force Graphを使用した関係可視化
  - ズーム/パン操作
  - SVG形式でのエクスポート
  - 対話的なノードハイライト
- Markdown→Wordエクスポート機能（.docx形式でダウンロード可能）
- データプレビュー/分析モードからExcelエクスポート（.xlsx形式でダウンロード可能）

## 今後の拡張予定

- データ分析機能の拡張（機械学習モデルの組み込みなど）
- Parquetファイルの完全なバイナリパースサポート
- Mermaidダイアグラムの自動レイアウト最適化
- サイドバイサイドの差分比較ビュー
- Excel/Wordファイルのプレビュー・編集機能の拡張
- サンプルデータ（test_data/）に各種形式のテストファイルを同梱
