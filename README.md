# DataLoom Studio

DataLoom Studio は、ファイル管理・エディタ・プレビュー・データ分析をワンストップで行える統合ワークスペースです。Next.js 15 と React 19 をベースに、Zustand による状態管理と CodeMirror 6 を組み合わせ、Markdown/データ/Notebook のリアルタイムプレビューや単一/複数ファイル分析、Git 連携までブラウザだけで完結します。Electron パッケージによるデスクトップ版も提供しています。

## 📖 ドキュメント
- **[llms.txt](./llms.txt)** / **[llms-full.txt](./llms-full.txt)** – LLM 参照向け技術サマリ
- **[docs/](./docs/)** – アーキテクチャ、機能仕様、開発手順、テスト指針などの詳細ドキュメント
- **[docs/mygpt-knowledge.md](./docs/mygpt-knowledge.md)** – ChatGPT マイGPT に登録するためのナレッジパック
 # DataLoom Studio

 DataLoom Studio（旧: ido_editor）は、ローカルファイルとクラウドを問わず、Markdown・データ・Notebook を編集・可視化・分析するための統合ワークスペースです。

 本リポジトリは Next.js 15 / React 19 を基盤に、CodeMirror 6、Zustand、isomorphic-git、AlasQL、Mermaid などを組み合わせて次の用途に対応します。

 - 高度なエディタ操作（言語検出、スマート保存、スクロール同期）
 - リッチなプレビュー（Markdown、Mermaid、自動目次、Jupyter Notebook、PDF）
 - 単一・複数ファイルのデータ分析（SQL 実行、チャート、関係グラフ）
 - Git 操作（リポジトリ初期化、ステージング、コミット、差分、ブランチ操作、クローン）
 - Electron によるデスクトップ化（ネイティブ ファイル I/O 対応）

 ## ドキュメント一覧
 - llms.txt / llms-full.txt — LLM 用技術サマリ
 - docs/ — 機能設計、シーケンス図、開発ガイド、Electron 関連の手引き
 - docs/mygpt-knowledge.md — MyGPT に登録するナレッジパック（本 README と合わせて更新推奨）

 ## クイックスタート
 必要環境: Node.js 18+, npm 8+, Chromium 系ブラウザ（File System Access API が必要）

 ```bash
 git clone https://github.com/yourusername/dataloom-studio.git
 cd dataloom-studio
 npm install
 npm run dev
 # Web: http://localhost:3000
 ```

 開発（Electron を同時に立ち上げる）:
 ```bash
 npm run dev:web    # Next.js のみ
 npm run dev:electron  # Electron (ELECTRON_DEV=1 が必要)
 ```

 本番ビルド / 配布:
 - `npm run build` / `npm run start`
 - Electron パッケージング: `npm run dist`（mac/windows 用スクリプトあり）

## OpenAI APIキーの設定
- 画面右上のキーアイコンを押すと「OpenAI APIキー設定」ダイアログが開きます
- キーを保存すると `~/.dataloom/settings.json`（環境変数 `DATALOOM_CONFIG_DIR` で変更可）に平文で書き込まれ、ブラウザ版/Electron 版の両方で再利用できます
- `OPENAI_API_KEY` が設定されている場合はそちらが優先され、ダイアログからも状態を確認できます
- 保存済みのキーは同ダイアログから削除・再読込が可能です

 ## 主要機能（実装済み） — 完全網羅
 以下はソースコード（src/components, src/lib, src/store）をもとに整理した実装済み機能の完全一覧です。MyGPT に取り込む際は、このまま要点を納めてください。

 ### 共通／UI
 - レイアウト: ヘッダー、アクティビティバー、サイドバー（エクスプローラ／検索／分析／Git）、メインエディタ領域
 - テーマ切替（light/dark）、フォントサイズ調整、表示パネルのトグル（paneState）
 - ドラッグ＆ドロップによるタブ並び替えとファイルのドロップ読み込み
 - ヘッダーのキーアイコンから OpenAI APIキー設定ダイアログを起動し、ローカル設定 (`~/.dataloom/settings.json`) への保存/削除/再読込が可能（環境変数 `OPENAI_API_KEY` が優先）

 ### ファイルエクスプローラ（`src/components/explorer/FileExplorer.tsx`）
 - File System Access API によるローカルフォルダの読み込み、ツリー表示
 - コンテキストメニュー操作: 新規ファイル/フォルダ作成、リネーム、削除
 - 圧縮/解凍: Zip / Tar.gz の解凍、選択ファイルの圧縮
 - テンポラリファイル作成（保存前の一時タブ）
 - 複数ファイル選択（マルチファイル分析用）: CSV/TSV/JSON/YAML/Excel を選択して分析に渡す機能
 - ファイルの種類チェックと除外（.exe/.dmg 等）

 ### エディタ（`src/components/editor/Editor.tsx`）
 - CodeMirror 6 ベースのエディタコンポーネント統合（@uiw/react-codemirror）
 - 言語自動判定（拡張子ベース）、シンタックスハイライト、折りたたみ、矩形選択
 - 編集操作: undo/redo、矩形選択、行番号、ラップ、長押しなどの CodeMirror 機能
 - 保存: `Cmd/Ctrl+S` で File System Access API を介してファイルを保存（rootDirHandle がある場合は上書き）
 - クリップボード/ペースト処理: 画像は除外、ファイル貼り付け時に名前を補完してタブ作成
 - Markdown 編集向け拡張（`MarkdownEditorExtension`）: Ctrl/Cmd+Enter 実行などのショートカットを統合

 ### プレビュー
 - Markdown プレビュー（GitHub スタイル）: リアルタイム変換、GFM、目次（TOC）生成、外部リンクは新タブで開く
 - Mermaid プレビュー: Markdown 内 code block の自動レンダリング、個別 Mermaid プレビュー / Designer（GUI）
 - HTML プレビュー: HTML 断片の安全なレンダリング（サンドボックス）
 - PDF プレビュー: `pdfjs-dist` を使い 1 ページ目を表示
 - Jupyter Notebook (`.ipynb`) プレビュー: セル毎の表示、リッチ出力のレンダリング（画像やHTML等）
 - Excel プレビュー: シート一覧選択、範囲指定、読み込み

 ### データプレビュー / 表操作
 - フラット表示 / 階層表示切替（JSON/YAML）、列の表示切替、ソート、ページネーション
 - 行/列の追加・編集・削除（編集可能テーブル）
 - CSV/TSV/JSON/YAML/Excel の読み込みとエクスポート
 - Parquet は簡易テキスト解析（バイナリ完全対応は制約あり）

 ### データ分析（`src/components/analysis/*`）
 - 単一ファイル分析: AlasQL を用いた SQL 実行、クエリ結果のテーブル表示、チャート化
 - サポートされるチャート種別: 棒グラフ、折れ線、円グラフ、散布図、積み上げ、回帰プロット、ヒストグラム、ガント、マトリクス（heatmap）等
 - 統計サマリ（平均、中央値、分散、標準偏差、欠損値カウント等）を自動算出
 - 関係グラフ (Force Graph) 表示: JSON 構造からノード/エッジを生成して可視化
 - SQL ノートブック: セル単位で SQL を実行し、各セルはテーブル/チャートどちらでも表示可能。ノートブックは `.sqlnb.json` へ保存/復元

 ### 複数ファイル分析（MultiFileAnalysis）
 - マルチファイル分析モードで複数のデータファイルを結合
 - 結合モード: UNION / INTERSECTION / JOIN（キー指定可）
 - 結合結果は仮想テーブル `combined` として扱われ、SQL/チャート/関係グラフから参照可能
 - Excel のシート単位や範囲指定の保存・再利用に対応

 ### 検索 / 置換
 - グローバル検索: ファイル名フィルタ、正規表現、大文字小文字、全語一致オプション
 - 検索結果のファイル別展開、該当行ジャンプ、ファイル単位および全体の一括置換

 ### Git 機能（`src/store/gitStore.ts`, `src/components/git/*`）
 - リポジトリ検出（.git の有無）と初期化
 - リフレッシュ: `statusMatrix` に基づくファイル状態取得（unmodified/modified/added/deleted/untracked）
 - ステージング / ステージ解除 / 変更破棄 / コミット
 - ブランチ一覧取得、チェックアウト、ブランチ作成
 - ファイル履歴表示（コミット一覧）
 - 差分表示: isomorphic-git で読み出したコミット内容と作業ツリーの差分生成（`diff` パッケージの `createTwoFilesPatch` を使用）
 - リポジトリのクローン（ブラウザ上でのクローン処理をサポート、CORS プロキシ利用）

 ### エクスポート / インポート
 - Markdown → Word (.docx)（docx ライブラリ利用）
 - 任意データ → CSV/TSV/JSON/YAML/Excel/Parquet（テキストベース）へのエクスポート
 - ノートブック（`.sqlnb.json`）のエクスポート・インポート
 - Mermaid / チャート の画像（SVG/PNG）／クリップボードコピー

 ### その他のユーティリティ
 - HTML → RTF 変換ユーティリティ（utils/htmlToRtf.ts）
 - shapefile ローダーのスタブ、各種データフォーマットユーティリティ（src/lib）

 ## ショートカット（主なもの）
 - Cmd/Ctrl + S : 保存
 - Cmd/Ctrl + B : サイドバーのトグル（実装されているキーは UI 側でカスタム可能）
 - タブ内のモード切替ボタンでエディタ/プレビュー/分割を切替
 - Markdown 編集時の独自ショートカットは `MarkdownEditorExtension` を参照

 ## 開発者向け情報
 - 主要スクリプト（package.json）:
	 - dev: Next.js dev
	 - build: Next.js build
	 - start: Next.js start
	 - dev:electron / dev:web: Electron と Web の同時開発
	 - dist / dist:mac / dist:win: Electron パッケージング
 - 状態管理: Zustand（`src/store/editorStore.ts`, `src/store/gitStore.ts`）
 - データ処理: AlasQL、apache-arrow（Parquet 系）、xlsx（Excel）
 - Git: isomorphic-git + isomorphic-git/http/web

 ## 既知の制限 / 注意点（詳細）
 - File System Access API 非対応ブラウザではローカルフォルダの読み書きは不可（Electron 版ではネイティブ FS を利用）
 - Parquet は限定的サポート（テキスト抽出中心）
 - PDF プレビューは 1 ページ目のみ（PDF.js による簡易表示）
 - 大容量ファイル（数十MB〜）や多数タブ開放時はブラウザのメモリ制約によりパフォーマンス劣化が発生する可能性あり
 - `diff` の出力はテキストベース。バイナリ差分は未サポート

 ## 既存ドキュメントと今後の補足候補（MyGPT 向け）
 現状 `docs/mygpt-knowledge.md` は概要と主要ワークフローをカバーしていますが、MyGPT に入れると便利な情報として以下を追加することを推奨します:
 - コンポーネント一覧と各コンポーネントの責務（例: `FileExplorer`, `Editor`, `MultiFileAnalysis`, `MermaidDesigner`）
 - サポートされる全ファイル拡張子の完全リスト
 + ショートカットとキーボード操作の一覧
 + Git 操作ワークフロー（ステージング→コミット→ブランチ作成→クローン）
 + SQL ノートブックの保存フォーマット仕様（`.sqlnb.json` の schema）
 + Mermaid Designer の GUI 操作（ノードの追加、整列、グループ化、SVG/PNG 保存手順）
 + トラブルシューティング（一般的なエラーとその対処法）

 ## サンプルとテストデータ
 - `/test_data/` に Markdown、Mermaid、CSV/TSV/JSON/YAML、Excel、ipynb、PDF、HTML のサンプルを収録しています。

 ---
 バグ報告・機能要望は issue を作成してください。ドキュメントや MyGPT 向けの補足情報の追加作業を行う場合は PR を歓迎します。
