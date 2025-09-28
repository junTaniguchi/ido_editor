# データ分析機能 詳細仕様

DataLoom Studio の分析モジュールは、単一/複数のデータファイルに対する SQL 実行・統計集計・チャート可視化・関係性分析をワークスペース内で完結できるように設計されています。本書では主要機能とデータフロー、ユーティリティの役割を整理します。

## 🔍 対応データ形式
- CSV / TSV
- JSON / JSON Lines / YAML
- Excel（.xlsx / .xls）
- Parquet（テキスト変換ベース）
- 統合データセット（複数ファイルを JOIN / UNION した結果）

## 📁 分析モード

### 単一ファイル分析
- `analysis/SingleFileAnalysis` が担当
- 読み込んだデータを自動的にテーブル表示し、AlasQL で任意の SQL を実行
- 結果テーブルはタブで「テーブル」「チャート」「統計」「関係グラフ」を切替
- Notebook モードを有効化すると複数 SQL セルを順次実行し、セルごとにチャート/テーブルを保持

### 複数ファイル分析
- `analysis/MultiFileAnalysis` が担当
- エクスプローラで選択した複数データをキュー化し、モード切替時に統合レイアウトへ遷移
- UNION / INTERSECTION / JOIN（inner/left/right/full）の構成をサイドバーで設定
- 統合結果は `combined` テーブルとして SQL から参照可能。個別ファイルは拡張子を除いたテーブル名でアクセス
- Notebook、チャート、関係グラフタブは単一ファイル時と同じ UI を共有

## 🧮 SQL エンジン
- **AlasQL** を採用しブラウザ内で完全に実行
- サポート構文：SELECT / WHERE / GROUP BY / ORDER BY / JOIN / UNION / INTERSECT / WITH / LIMIT など主要構文
- `RUN ALL` で Notebook 内の全セルを順番に実行。各セルの結果は Zustand ストアに保持され再表示が高速
- クエリ例：
  ```sql
  SELECT region, SUM(amount) AS total
  FROM combined
  WHERE status = 'closed'
  GROUP BY region
  ORDER BY total DESC;
  ```

## 📊 チャートと統計
- チャートタブでは以下のタイプをサポート
  - 棒 / 積み上げ棒 / 折れ線 / 面
  - 円 / ドーナツ
  - 散布 / バブル / 回帰
  - ヒストグラム
  - ガント
- x 軸 / y 軸 / シリーズ / 集計メソッド（sum, avg, count, min, max）を UI から選択
- 統計タブでは各列の型推定、件数、欠損値、平均/中央値/四分位などを自動計算し、数値列には分布ヒストグラムを添付

## 🌐 関係性ビュー
- JSON ライクなデータや SQL 結果からノード/エッジを自動推定し、`react-force-graph` で可視化
- ノードクリックでプロパティをツールチップ表示。ズーム、パン、ドラッグをサポート
- Cypher 入力欄は UI 上に配置済み（将来 Neo4j 等と連携予定）で、現状はヒント/プレースホルダー表示のみ

## 📤 エクスポート & スナップショット
- Notebook は `.sqlnb.json` として保存/読み込み可能。セルの SQL・結果メタデータ・チャート設定を含む
- テーブル/チャートのエクスポートは CSV/TSV/JSON/YAML/Excel/Parquet（テキスト）に対応
- チャートは PNG/SVG（Plotly）としてダウンロード可能

## 🧠 ストア連携
- `editorStore.analysis` スライスが分析状態を管理
  - 選択中データセット、Notebook セル、チャート構成、統計キャッシュなどを保持
  - `persist` ミドルウェアによりブラウザ再訪時にも設定を復元
- 複数ファイルモードで選択したファイル一覧や JOIN 設定は Zustand に保存され、モードを離れても保持

## 🔌 ユーティリティ
- `src/lib/dataAnalysisUtils.ts`
  - AlasQL 実行のラッパー、テーブルスキーマ推定、集計結果のフォーマット
  - 統計サマリー計算（jStat）とヒストグラム用バケット生成
- `src/lib/dataFormatUtils.ts`
  - Excel/Parquet/JSON Lines などの標準化、日時/数値推定
- `src/lib/dataPreviewUtils.ts`
  - プレビューと分析で共通利用するデータ読み込みと変換

## 🔄 処理フロー
```mermaid
graph LR
    A[選択/読み込みファイル] --> B[データ判定 & パース]
    B --> C[Zustand ストア格納]
    C --> D[SQL 実行 (AlasQL)]
    D --> E[結果テーブル]
    E --> F[統計サマリー]
    E --> G[チャート設定]
    E --> H[関係グラフ整形]
    G --> I[Plotly / Chart.js]
    H --> J[Force Graph]
    F --> K[統計ビュー]
```

## ⚠️ 既知の制限
- Parquet はテキストベースのダンプに限定（バイナリ完全解析は未対応）
- Notebook で巨大データを扱う場合、メモリ使用量が増加するためページング設定の利用を推奨
- Cypher 入力欄は UI のみで、現時点でクエリ実行は行わない
