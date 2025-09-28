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

## 4. よくある質問（想定 Q&A）
- **Q: File System Access API が使えないブラウザは？**
  - A: Firefox/Safari では未サポート。Chrome/Edge 等の Chromium 系ブラウザを利用してください。
- **Q: Parquet は完全対応している？**
  - A: テキスト変換ベースの簡易サポートです。完全なバイナリ解析は未対応で、読み込み時に警告を表示します。
- **Q: Cypher 入力欄は何をする？**
  - A: 将来のグラフ DB 連携向けプレースホルダーです。現行バージョンではクエリ実行は行いません。
- **Q: Notebook の保存形式は？**
  - A: `.sqlnb.json` 形式でセル構成・結果・チャート設定を含めて保存/読み込みできます。
- **Q: 文字コードの扱いは？**
  - A: エクスポート時に UTF-8 / Shift_JIS を選択可能です。

## 5. 参考ドキュメント
- [README.md](../README.md) – 概要と機能紹介
- [docs/](./) – 詳細設計、API リファレンス、開発ガイド
- [docs/features/README.md](./features/README.md) – 機能一覧
- [docs/data-analysis.md](./data-analysis.md) – 分析機能の詳細
- [docs/development-guide.md](./development-guide.md) – 開発手順

このファイルをアップロードしたマイGPT には、上記 FAQ と操作フローをもとに回答するよう指示してください。
