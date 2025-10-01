# コンポーネント構造詳細

DataLoom Studio の UI は Next.js App Router 上で構築され、Zustand ストアを介した状態同期とコンポーネント分離によって拡張性と再利用性を確保しています。ここでは主要なコンポーネントと責務を整理します。

## 🧱 レイアウト

### `src/app/layout.tsx`
- メタデータやテーマ初期化 Script を注入
- `ThemeController` により Cookie/LocalStorage を参照してライト/ダークテーマを決定

### `src/components/layout/MainLayout.tsx`
- ヘッダー、エクスプローラ、タブ、プレビュー/分析領域を 3 ペイン構成で描画
- ブラウザ幅に応じてエクスプローラ/分析パネルの開閉を制御

### `src/components/layout/MainHeader.tsx`
- アプリ名（DataLoom Studio）とヘッダー操作（フォントサイズ、テーマ切替、検索、マルチファイル分析、Git パネル、OpenAI APIキー設定ダイアログの起動など）を提供

## 📁 ファイル & タブ

### `src/components/explorer`
- `FileExplorer`：File System Access API から取得したディレクトリツリーを仮想 DOM に展開
- `ExplorerToolbar`：フォルダ選択、Zip/Tar.gz 解凍、選択ノード作成を制御
- `useDirectoryLoader`（lib）と連携し、非同期読み込み時はスケルトン表示を行う

### `src/components/tabs`
- `TabBar`：ドラッグ&ドロップによる順序入れ替えと未保存タブのインジケータ表示
- `TabContentSwitcher`：アクティブタブの種別に応じてエディタ/プレビュー/分析コンポーネントを切替

## ✍️ エディタ

### `src/components/editor`
- `CodeEditor`：@uiw/react-codemirror をベースに、言語自動判別・矩形選択・折り畳みなどの拡張を適用
- `EditorToolbar`：モード切替、エクスポート、Notebook モード起動などのアクションを提供
- `NotebookPanel`：SQL セルの追加、順次実行、結果のテーブル/チャート表示切替を管理

## 👁️ プレビュー

### `src/components/preview`
- `MarkdownPreview`：react-markdown + remark/rehype プラグインでライブプレビューと目次生成を実装
- `MermaidPreview` & `MermaidDesigner`（`src/components/mermaid`）: Mermaid コードブロック描画と React Flow を利用した GUI 編集
- `DataPreview`：CSV/TSV/JSON/YAML/Excel/Parquet/HTML のレンダリングを統合。Plotly/Chart.js を遅延ロードしてチャート描画を行う
- `NotebookPreview`：`.ipynb` をセル単位にレンダリングし、画像や HTML 出力をそのまま表示
- `PdfPreview`：PDF.js で 1 ページ目のキャンバス描画を行いズーム操作に対応

## 📊 分析

### `src/components/analysis`
- `SingleFileAnalysis`：単一ファイルの SQL 実行、統計サマリー、チャート、関係グラフをまとめたタブ UI
- `MultiFileAnalysis`：複数ファイルキュー、UNION/INTERSECTION/JOIN の構成、統合結果に対する SQL/Notebook/チャートを提供
- `AnalysisSidebar`：データセットやチャートテンプレートの選択、Notebook 実行履歴の保存/復元をサポート

## 🔍 検索 & Git

### `src/components/search`
- `SearchPanel`：VS Code 風の検索 UI。正規表現、除外パターン、ヒットごとのジャンプ/置換を実装

### `src/components/git`
- `GitPanel`：isomorphic-git を利用してステージング、コミット、ブランチ操作、履歴確認を行う
- `CloneRepositoryModal`：URL 入力からローカルフォルダへのクローンをブラウザ内で完結

## 🔐 モーダル

### `src/components/modals/LlmSettingsDialog.tsx`
- ヘッダーのキーアイコンから呼び出される OpenAI APIキー設定モーダル
- `/api/llm/openai-key` 経由でキーの保存/削除/状態確認を行い、ローカル設定ファイル (`~/.dataloom/settings.json` または `DATALOOM_CONFIG_DIR`) を更新
- 環境変数 `OPENAI_API_KEY` が存在する場合は読み取り専用状態として案内し、保存済みのローカルキーがあれば併記

## 🎨 テーマ

### `src/components/theme/ThemeController.tsx`
- Zustand の `editorSettings.theme` を監視し、`data-theme` 属性と Cookie (`dataloom-theme`) を同期
- ダークモードでは Tailwind の `dark` クラスを `<html>` に付与

## 🧠 ストア

### `src/store/editorStore.ts`
- File System Access ハンドル、タブ状態、分析設定、Notebook セル、Git ステータスなどを一元管理
- `persist` ミドルウェアで IndexedDB に保存し、再訪時の状態復元を実現
- セレクターを細分化し、パフォーマンスを確保

## 🔌 ユーティリティ連携

- `src/lib/fileSystemUtils.ts`：ディレクトリ走査、Zip/Tar.gz 展開、バイナリフィルタリング
- `src/lib/dataAnalysisUtils.ts`：AlasQL 実行、統計集計、チャート用データ生成
- `src/lib/dataPreviewUtils.ts`：ファイル種別の自動判定とプレビュー用データ整形
- `src/lib/git/*`：isomorphic-git の高レベルラッパーとステータス差分整形
- `src/lib/mermaid/*`：Mermaid 初期化とダイアグラムエクスポート

これらのコンポーネントは、Zustand ストアとユーティリティ層を介して疎結合に連携し、マルチタブ・マルチモードの編集体験を実現しています。
