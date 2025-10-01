# DataLoom Studio - MyGPT ナレッジパック

ChatGPT のマイGPT に DataLoom Studio の知識を組み込むための要約ドキュメントです。以下の情報をそのままアップロードすることで、プロジェクトの概要・操作手順・FAQ への回答に利用できます。

## 1. プロジェクト概要
- **名称**: DataLoom Studio（旧: ido_editor）
- **用途**: Markdown/データファイル/Notebook を編集・プレビューし、単一/複数ファイルのデータ分析を行う統合ワークスペース
- **技術スタック**: Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, CodeMirror 6, Electron（デスクトップ版）
- **主な機能**:
  - File System Access API によるローカルファイル連携
  - Markdown リアルタイムプレビュー + Mermaid GUI エディタ
  - CSV/TSV/JSON/YAML/Excel/Parquet/Notebook/PDF プレビュー
  - AlasQL ベースの SQL 実行、Plotly/Chart.js によるチャート、関係グラフ描画
  - 複数ファイルの UNION/INTERSECTION/JOIN 分析
  - isomorphic-git を使った Git パネル（ステージング/コミット/ブランチ/履歴）
  - ヘッダー右上から開く OpenAI APIキー設定ダイアログ（ローカル保存・削除・状態確認、環境変数優先）

## 2. セットアップと起動
```bash
git clone https://github.com/yourusername/dataloom-studio.git
cd dataloom-studio
npm install
npm run dev
# http://localhost:3000 でアクセス
```
- Electron 版を併用する場合: `npm run dev:web` と `npm run dev:electron`
- 本番ビルド: `npm run build` → `npm run start`
- Lint / Test: `npm run lint`, `npm run test`

## 3. 代表的な操作フロー
1. **フォルダを開く**: ヘッダー左のフォルダアイコンからローカルフォルダを選択 → エクスプローラにツリー表示
2. **Markdown を編集・プレビュー**: タブのモードボタンでエディタ/プレビュー/分割を切替。Mermaid コードは自動描画。Word (.docx) エクスポートボタンあり
3. **データ分析（単一ファイル）**: CSV/Excel などを開き「分析モード」に切替 → SQL を実行 → 結果テーブル/チャート/統計/関係グラフを閲覧
4. **複数ファイル分析**: ヘッダーで「マルチファイル分析」を有効化 → エクスプローラで複数ファイルを選択 → UNION/INTERSECTION/JOIN を設定 → `combined` テーブルに対して SQL/Notebook/チャートを操作
5. **Git 管理**: ヘッダーのブランチアイコンで Git パネルを開く → 変更のステージング/コミット/履歴確認。クローンはダウンロードアイコンから実行
6. **エクスポート**: Markdown → Word、データ → CSV/TSV/JSON/YAML/Excel/Parquet (テキスト)、チャート → PNG/SVG、Mermaid → SVG/PNG/クリップボード
7. **OpenAI APIキーを設定**: ヘッダーのキーアイコンからダイアログを開き、`~/.dataloom/settings.json`（`DATALOOM_CONFIG_DIR` で変更可）にキーを保存。`OPENAI_API_KEY` が指定されている場合は状態確認とローカルキー管理のみ可能

````markdown
# DataLoom Studio - MyGPT ナレッジパック (完全版)

このファイルは MyGPT（ChatGPT のマイGPT）へ DataLoom Studio に関する全体知識を登録するための完全版ナレッジパックです。
ユーザの問い合わせに正確かつ詳細に答えられるよう、実装済み機能・ワークフロー・トラブルシューティング・開発者情報を含めています。

## 1. プロジェクト概要
- 名称: DataLoom Studio（旧: ido_editor）
- 用途: Markdown/データファイル/Notebook の編集・プレビュー・データ分析を1つのワークスペースで行う
- 技術スタック: Next.js 15, React 19, TypeScript, Tailwind CSS, Zustand, CodeMirror 6, Electron

### 1.1 主な実装済み機能（サマリ）
- ファイルエクスプローラ（File System Access API）: ローカルディレクトリのツリー表示、作成/リネーム/削除、圧縮/解凍
- リッチエディタ: CodeMirror 6 ベース、言語自動判別、矩形選択、ショートカット、保存（File System Access API）
- Markdown/HTML/Mermaid/Jupyter/PDF/Excel プレビュー
- データプレビュー・編集: CSV/TSV/JSON/YAML/Excel の読み込み、テーブル編集、フラット/ツリー表示
- データ分析: AlasQL による SQL 実行、チャート作成（Plotly/Chart.js）、統計サマリ、関係グラフ（Force Graph）
- 複数ファイル分析: 複数データの UNION/INTERSECTION/JOIN（キー指定可）と仮想 `combined` テーブル
- Git 統合: isomorphic-git を用いたリポジトリ操作（ステータス/ステージ/コミット/差分/ブランチ/クローン）
- Mermaid Designer（GUI）: ノード/エッジの編集、整列、エクスポート（SVG/PNG）
- エクスポート: Word(.docx), CSV/TSV/JSON/YAML/Excel/Parquet(テキスト), 画像出力
- LLM 設定: OpenAI APIキーを `/api/llm/openai-key` 経由で保存/削除し、`~/.dataloom/settings.json`（`DATALOOM_CONFIG_DIR`）に永続化。`OPENAI_API_KEY` を優先

## 2. セットアップと起動
```bash
git clone https://github.com/yourusername/dataloom-studio.git
cd dataloom-studio
npm install
npm run dev
# http://localhost:3000 にアクセス
```

- Electron 開発: `npm run dev:web`（Next.js）と `npm run dev:electron`
- 本番ビルド: `npm run build` → `npm run start`
- テスト/リンティング: `npm run test`, `npm run lint`

推奨ブラウザ: Chromium 系（Chrome/Edge）。File System Access API が必要です。

## 3. 実装済み機能の詳細（網羅）
以下はソースコードベースで確認できる実装済み機能を、機能ごとに細かく示したリストです。MyGPT の回答テンプレートとしてそのまま利用できます。

### 3.1 ファイルエクスプローラ（src/components/explorer）
- ルートフォルダ選択: `window.showDirectoryPicker()` を通して `rootDirHandle` を保存
- ツリー構築: `readDirectoryContents` を呼び出して `FileTreeItem` 構造を構築
- ファイル操作: 新規ファイル/フォルダ作成、リネーム、削除（`createNewFile`, `createNewDirectory`, `renameFile` 等）
- 圧縮/解凍: Zip / Tar.gz の作成・展開（`compressToZip`, `compressToTarGz`, `extractZipArchive`, `extractTarGzArchive`）
- マルチ選択: `selectedFiles` を管理して複数ファイル分析の入力を保持

注意点:
- `.exe` / `.dmg` 等のバイナリは読み込み時にブロックする実装がある

### 3.2 エディタ（src/components/editor/Editor.tsx）
- CodeMirror 6 のラッパーを利用して編集 UI を提供（@uiw/react-codemirror）
- 自動言語判別は `getLanguageByFileName` を参照
- 保存: `Ctrl/Cmd+S` で `writeFileContent` を通じて保存。rootDirHandle がある場合は既存ファイルに上書き
- クリップボード/貼り付け処理: ファイル貼り付けを処理し、MIME ベースで拡張子を補完（`ensureNamedFile`, `MIME_FALLBACK_EXTENSION`）
- PDF/Excel などのバイナリは専用処理を行い、PDF は Blob URL で表示

### 3.3 プレビュー系
- MarkdownPreview: GFM、ハイライト、目次（TOC）生成、リンクのターゲット制御
- MermaidPreview / MermaidDesigner: markdown codeblock の Mermaid をレンダリング、Designer は GUI 操作（ノード追加/削除/整列/グループ）
- HtmlPreview: サンドボックス内で HTML をレンダリング
- IpynbPreview: `.ipynb` のセルを解析して順に描画（コード/Markdown/出力のハンドリング）
- PdfPreview: `pdfjs-dist` を使用して1ページ目を描画

### 3.4 データプレビューと編集
- サポート形式: CSV, TSV, JSON, YAML, Excel (.xlsx/.xls), Parquet (限定), Jupyter (.ipynb)
- テーブルUI: 列表示制御、ソート、ページネーション、セル編集、行/列の追加削除
- Excel: シート選択・読み込み範囲指定対応
- Parquet: apache-arrow 等を使った限定的テキスト解析（完全バイナリ解析は限定）

### 3.5 データ分析（src/components/analysis）
- 単一ファイル分析: AlasQL による SQL 実行。`sqlResult` に格納
- チャート: Chart.js / Plotly を用いた複数種のチャート生成（棒/線/円/散布/積み上げ/回帰/ヒストグラム/ガント など）
- 統計: 基本統計量（平均、中央値、分散、標準偏差、欠損数等）の自動計算
- 関係グラフ: JSON 構造をノード/エッジ化して Force Graph に表示
- SQL ノートブック: 複数セルの実行・結果保持。ノートブックは `.sqlnb.json` 形式で保存/復元可能

### 3.6 複数ファイル分析
- マルチファイル分析モードで `selectedFiles` の集合を `combined` として統合
- 統合方法: UNION / INTERSECTION / JOIN（JOIN 時はキー指定）
- Excel のシート単位や読み込み設定を再利用可能

### 3.7 検索 / 置換（src/components/search）
- 全文検索: 正規表現、大小比較、ファイルフィルタ（include/exclude）、ヒットのジャンプ
- 一括置換: ファイル単位または複数ファイルに対する一括置換

### 3.8 Git 機能（src/store/gitStore.ts, src/components/git）
- リポジトリ初期化、存在確認（.git の存在）
- `statusMatrix` を元にファイル状態を整形して UI に提供
- ステージ/アンステージ、破棄、コミット機能
- ブランチ一覧 / チェックアウト / ブランチ作成
- 履歴参照（コミットログ）
- 差分生成: コミット blob を読み出し作業ツリーと比較、`diff` の `createTwoFilesPatch` を用いたパッチ生成
- リポジトリのクローン: ブラウザベース（isomorphic-git + http/web + CORS proxy）

### 3.9 エクスポート / インポート
- Markdown → Word (.docx)
- データ: CSV/TSV/JSON/YAML/Excel/Parquet（テキストベース）へのエクスポート
- ノートブック（`.sqlnb.json`）エクスポート・インポート
- Mermaid / Chart の画像（SVG/PNG）エクスポート

### 3.10 LLM 設定（src/components/modals/LlmSettingsDialog.tsx, src/lib/server/openaiKeyStore.ts）
- ヘッダーのキーアイコンからモーダルを開き、OpenAI APIキーを入力
- `saveLlmKey` / `deleteLlmKey` が `/api/llm/openai-key` を呼び出し、`~/.dataloom/settings.json` へ保存または削除（`DATALOOM_CONFIG_DIR` で保存先変更可）
- 環境変数 `OPENAI_API_KEY` が設定されている場合はそれを優先し、ダイアログ上で状態を案内

## 4. ファイル形式と取り扱い（完全リスト）
- テキスト系: .txt, .md, .markdown, .html, .json, .yaml, .yml, .sql
- データ系: .csv, .tsv, .xlsx, .xls, .parquet
- Notebook: .ipynb, .sqlnb.json (ノートブック専用保存形式)
- その他: .pdf (1ページ目プレビュー), .rtf (生成), 画像は基本表示・取り込み除外の分別あり

Parquet は限定サポートの旨を明記してください（バイナリ処理は限定的）。

## 5. 保存・スナップショット形式（`.sqlnb.json` の概略スキーマ）
ノートブックは JSON で保存され、最低限以下を持ちます（スキーマ例）:

```json
{
  "meta": { "name": "notebook-name", "createdAt": 1690000000000 },
  "cells": [
    {
      "id": "cell-1",
      "type": "sql",
      "source": "SELECT * FROM combined LIMIT 10;",
      "result": null,
      "status": "idle",
      "chartSettings": null
    }
  ]
}
```

（詳細スキーマは `src/types` の型定義を参照のこと）

## 6. ショートカットと UX ヒント
- Cmd/Ctrl + S: 保存
- タブモード切替ボタン: エディタ / プレビュー / 分割
- Markdown 内: Ctrl/Cmd+Enter で実行補助（MarkdownEditorExtension に依存）

## 7. 開発者向け情報
- 主要ディレクトリ: `src/components`, `src/lib`, `src/store`, `src/hooks`
- 状態管理: `src/store/editorStore.ts`, `src/store/gitStore.ts`（Zustand）
- 依存主要: isomorphic-git, @uiw/react-codemirror, mermaid, alasql, apache-arrow, xlsx, pdfjs-dist
- ビルド/実行: `npm run dev`, `npm run build`, `npm run start`, `npm run dev:electron`

## 8. トラブルシューティング（よくある問題と対処）
- Module not found: Can't resolve 'diff' → `npm install diff`（プロジェクト依存に追加）
- React の Maximum update depth exceeded → Zustand のセレクタで毎回新しいオブジェクトを返している箇所を修正（セレクタはプリミティブか個別プロパティを取得するように）
- File System Access API が動作しない（Safari/Firefox）→ Chromium 系ブラウザを利用するか Electron 版を使用
- isomorphic-git のクローンで CORS エラー → `corsProxy` オプションを設定するかサーバー側で CORS 対策を行う

## 9. MyGPT に取り込むときのガイドライン
- 各セクションは Q&A スニペットとして登録する（例: "How to open folder", "How to run SQL notebook", "Supported file formats"
- トラブルシューティングは FAQ として細かいエラーメッセージ例と回避手順を登録
- 開発者向けコマンド一覧（依存追加、ビルド、Electron packaging）を登録

---
このドキュメントは MyGPT に登録することを前提に作成されています。取り込み後は、ユーザからの操作手順、実装詳細、トラブルシューティングに即時応答できるようになります。
````
