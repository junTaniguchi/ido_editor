# DataLoom Studio

DataLoom Studio は、ファイル管理・エディタ・プレビュー・データ分析をワンストップで行える統合ワークスペースです。Next.js 15 と React 19 をベースに、Zustand による状態管理と CodeMirror 6 を組み合わせ、Markdown/データ/Notebook のリアルタイムプレビューや単一/複数ファイル分析、Git 連携までブラウザだけで完結します。Electron パッケージによるデスクトップ版も提供しています。

## 📖 ドキュメント
- **[llms.txt](./llms.txt)** / **[llms-full.txt](./llms-full.txt)** – LLM 参照向け技術サマリ
- **[docs/](./docs/)** – アーキテクチャ、機能仕様、開発手順、テスト指針などの詳細ドキュメント
- **[docs/mygpt-knowledge.md](./docs/mygpt-knowledge.md)** – ChatGPT マイGPT に登録するためのナレッジパック

## 🚀 クイックスタート
### 必要環境
- Node.js 18 以上 / npm 8 以上
- File System Access API をサポートする Chromium 系ブラウザ（Chrome、Edge 等）

### セットアップ
```bash
git clone https://github.com/yourusername/dataloom-studio.git
cd dataloom-studio
npm install
npm run dev
```
アプリは [http://localhost:3000](http://localhost:3000) に起動します。ビルド／Lint 用スクリプトは `npm run build`、`npm run start`、`npm run lint` を利用してください。

### Electron デスクトップ版
- 開発: `npm run dev:web`（Next.js）と `npm run dev:electron`
- パッケージング: `npm run dist`、Windows 用 `npm run dist:win`、macOS 用 `npm run dist:mac`
- 署名・配布の詳細は [docs/electron.md](./docs/electron.md) を参照

## 🧭 ワークスペース概要
- **ドラッグ&ドロップ対応マルチタブ**：タブ並び替えや複数ファイル同時編集に対応し、未保存タブはセッションに保持されます。
- **モード切替**：タブごとに「エディタ」「プレビュー」「分割」を循環切替。Markdown/データ系タブは専用 UI を持ち、分割ビューではスクロール同期が可能です。
- **ヘッダー操作群**：フォントサイズ、ライト/ダークテーマ、検索パネル、マルチファイル分析、テンポラリファイル作成をワンクリックで制御。
- **Git パネル**：isomorphic-git によるステージング、コミット、ブランチ切替、履歴確認をアプリ内で実行できます。
- **ドラッグ&ドロップ読込**：ローカルファイル/フォルダをウィンドウへドロップすると自動でタブ生成。フォルダ未選択でもテンポラリファイルを扱えます。

## 📂 ファイルエクスプローラ & 操作
- File System Access API でローカルフォルダをツリー表示。コンテキストメニューから新規作成・リネーム・削除を実行できます。
- Zip / Tar.gz の解凍および選択項目の Zip / Tar.gz 圧縮をブラウザ内で実行。
- 複数ファイル分析モードでは CSV/TSV/JSON/YAML/Excel などのデータファイルを選択キューに保持し、分析ビューに受け渡せます。
- `.exe` や `.dmg` など未対応バイナリは読み込み時にブロックし誤操作を防止します。

## ✍️ エディタ & プレビュー
### CodeMirror ベースのリッチエディタ
- 自動言語判別・シンタックスハイライト・折りたたみ・矩形選択をサポート。
- `Ctrl/Cmd + S` で File System Access API を通じて保存。ルートフォルダ選択時は既存ファイルへ直接書き込みます。
- データタブでは分析ビュー起動や CSV/TSV/JSON/YAML/Parquet*¹/Excel へのエクスポートが可能。

### Markdown と Mermaid
- リアルタイムプレビュー、目次生成、折り畳み、外部リンクの自動新規タブ開を搭載。
- Docx ライブラリを用いた Word 出力、Mermaid コードブロックの自動ダイアグラム化をサポート。
- Mermaid GUI デザインモードは React Flow ベースのノードを採用し、整列やズーム、SVG/PNG 保存、クリップボードコピーに対応します。

### データプレビュー
- **対応形式**：CSV、TSV、JSON、YAML、Parquet*¹、Excel（.xlsx/.xls）、Jupyter Notebook (.ipynb)、PDF*²、HTML/Markdown。
- テーブルデータはフラット/階層表示、ソート、ページネーション、列表示制御、行/列の追加削除を備えています。
- JSON/YAML はツリー表示とフラット変換を切り替え可能。Excel はシート一覧と読込範囲を指定できます。
- `.ipynb` プレビューはセル種別スタイルとリッチ出力表示に対応。PDF プレビューは PDF.js で 1 ページ目を描画します。

## 📊 データ分析
### 単一ファイル分析
- CSV/TSV/JSON/YAML/Parquet*¹/Excel に対し、AlasQL で SQL 実行、結果テーブルとチャートの二画面表示、統計サマリーを提供。
- チャートは棒/折れ線/円/散布/積み上げ/回帰/ヒストグラム/ガントをサポートし、データソースや軸設定を即時切替できます。
- 関係グラフタブでは JSON ライクなデータをノード/エッジに変換し Force Graph で可視化。

### SQL ノートブック
- ノートブックモードで複数 SQL セルを順次実行し、セルごとにテーブル/チャート表示を切替可能。
- 実行結果を含むスナップショットを `.sqlnb.json` としてエクスポート/インポートし、履歴を復元できます。

### 複数ファイル分析
- ヘッダーからマルチファイル分析モードへ切替え、選択した複数データを統合表示。
- UNION / INTERSECTION / JOIN（キー指定可）を選択して統合し、統合結果に対する SQL/Notebook/チャート/関係グラフ機能を利用できます。
- Excel ファイルはシート・範囲単位で読み込み設定を保存し、クエリ内では `combined` もしくは個別ファイル名（拡張子除去）で参照します。

## 🔍 検索・置換
- VS Code 風 UI で大文字小文字、正規表現、単語完全一致、ファイル絞り込みを設定。
- 検索結果はファイルごとに展開し、該当行へジャンプ。選択ヒットのみ/全件の一括置換に対応しています。

## 📦 データエクスポート
- Markdown プレビューから Word (.docx) を生成。
- エディタ/プレビューから CSV、TSV、JSON、YAML、Excel、Parquet*¹（テキストベース）へ変換しダウンロード可能。文字コードは UTF-8 / Shift_JIS に対応。

## ⚠️ 互換性と既知の制限
- File System Access API が利用できない環境ではローカルフォルダ連携や保存機能を使用できません。Chrome / Edge の最新バージョンをご利用ください。
- *¹ Parquet はテキストベースの簡易解析のみ。バイナリ完全対応には追加ライブラリが必要で、読み込み時に警告を表示します。
- *² PDF プレビューは 1 ページ目のみ描画します。
- `.exe` / `.dmg` など未対応バイナリは自動的に除外されます。
- マルチファイル分析の入力は CSV/TSV/JSON/YAML/Excel に限定されています。
- Cypher クエリ入力 UI は将来拡張用のプレースホルダーであり、現行バージョンでは実行しません。

## 📚 サンプルデータ
`/test_data/` ディレクトリに Markdown、Mermaid 図、各種 CSV/TSV/JSON/YAML、複数の Excel シナリオ、Jupyter Notebook、PDF/HTML サンプルを同梱しています。分析機能やプレビュー機能の検証に活用してください。

---
ドキュメントやアーキテクチャの詳細は [docs/](./docs/) を参照してください。バグ報告や機能提案は issue / PR にてお寄せください。
