# 機能仕様 - DataLoom Studio

DataLoom Studio に搭載されている主要機能とユーザー向け挙動を整理します。UI 操作の詳細はアプリ内ヘルプと併せて参照してください。

## 🧭 ワークスペース
- **マルチタブ編集**：ドラッグ&ドロップで順序変更、右クリックメニューでタブ一括操作、未保存タブにはインジケータを表示
- **モード切替**：タブ単位で「エディタ」「プレビュー」「分割」を循環。Markdown/データタブは専用のプレビュー UI を持ち、分割ビューではスクロール同期
- **ヘッダー操作**：フォントサイズ調整、ライト/ダークテーマ切替、検索パネル、マルチファイル分析モード、テンポラリファイル作成、Git パネル表示、OpenAI APIキー設定ダイアログの起動

## 📂 ファイル管理
- File System Access API を利用してローカルフォルダを選択し、階層ツリーで表示
- 新規ファイル/フォルダ作成、リネーム、削除、Zip/Tar.gz 圧縮/解凍をブラウザ上で実行
- 未サポートのバイナリ（`.exe` `.dmg` など）はフィルタリングして誤操作を防止
- ドラッグ&ドロップでファイル/フォルダを読み込み、テンポラリタブとして保持

## ✍️ エディタ
- CodeMirror 6 ベースのエディタで 50+ 言語のシンタックスハイライト、折り畳み、矩形選択、差分表示を提供
- `Ctrl/Cmd + S` で保存、`Ctrl/Cmd + P` 相当のクイックコマンド（ファイル切替）を実装
- Notebook モードで SQL セルを追加し、セルごとに実行・チャート表示・結果保持が可能
- Markdown ツールバーからテンプレート挿入、目次ジャンプ、Mermaid デザイナー起動をサポート

## 👁️ プレビュー
- **Markdown**：リアルタイムレンダリング、目次、折り畳み、Word(.docx) エクスポート、Mermaid コードブロックの自動描画
- **Mermaid GUI**：React Flow ベースでノード配置、エッジ接続、レイアウト自動整列、SVG/PNG 書き出し、クリップボードコピー
- **データファイル**：CSV/TSV/JSON/YAML/Excel/Parquet/HTML/Notebook/PDF をそれぞれ最適化したビューで表示。列表示切替、フィルタ、ページネーション、Excel 範囲指定、JSON/ YAML のツリービュー/テーブル変換などを提供
- **Notebook (.ipynb)**：セル種別に応じたスタイル、Markdown レンダリング、画像や HTML 出力をインライン表示
- **PDF**：PDF.js による 1 ページ目のキャンバス描画とズーム操作

## 📊 分析
- 単一ファイル分析: SQL 実行、統計サマリー、Plotly/Chart.js を利用した多彩なチャート、関係グラフ
- 複数ファイル分析: UNION / INTERSECTION / JOIN 設定、統合データに対する SQL/Notebook/チャート/関係グラフを提供
- Notebook: `.sqlnb.json` のスナップショット保存/読込、セルごとの結果保持
- チャート種別: 棒/積み上げ棒/折れ線/円/散布/バブル/回帰/ヒストグラム/ガント

## 🔍 検索・置換
- VS Code スタイルの検索 UI で大文字小文字、正規表現、単語一致、include/exclude パターンをサポート
- ヒット結果から該当行へジャンプし、個別または一括置換

## 🔐 Git 連携
- isomorphic-git を利用したブラウザ内 Git 操作。ステージング、コミット、ブランチ切替、履歴参照に対応
- Git パネルのクローンボタンからリポジトリ URL を入力し、File System Access API で指定したフォルダへクローン

## 🤖 LLM 連携
- ヘッダー右側のキーアイコンから OpenAI APIキー設定ダイアログを開き、ブラウザ/Electron で共通利用するキーを登録
- キーは `~/.dataloom/settings.json`（`DATALOOM_CONFIG_DIR` で変更可）に保存され、環境変数 `OPENAI_API_KEY` が存在する場合はそちらを優先
- ダイアログでは保存済みキーの削除と状態再取得をサポートし、未設定時は AI 生成機能で警告を表示

## 📦 エクスポート
- Markdown → Word (.docx)、データ → CSV/TSV/JSON/YAML/Excel/Parquet (テキスト)
- チャート → PNG/SVG、Mermaid → SVG/PNG/クリップボード
- 文字コードは UTF-8 / Shift_JIS を選択可能

## ⚠️ 制限事項
- File System Access API 非対応ブラウザ（Firefox/Safari 等）ではローカルファイル操作不可
- Parquet はテキスト変換ベース。完全なバイナリ解析は未対応
- Cypher 入力欄は将来拡張向けで、現時点ではクエリ実行しない

## 🧩 キーボードショートカット（抜粋）
| 操作 | Windows / Linux | macOS |
| ---- | ---- | ---- |
| 保存 | `Ctrl + S` | `Cmd + S` |
| 新規タブ | `Ctrl + T` | `Cmd + T` |
| タブを閉じる | `Ctrl + W` | `Cmd + W` |
| タブ切替 | `Ctrl + Tab / Shift + Ctrl + Tab` | `Ctrl + Tab / Shift + Ctrl + Tab` |
| Notebook セル実行 | `Ctrl + Enter` | `Cmd + Enter` |
| 検索パネル | `Ctrl + F` | `Cmd + F` |

## 📚 サンプルデータ
`test_data/` に Markdown、Mermaid、複数形式のデータファイル、Notebook、PDF を同梱。機能検証やデモ用に利用できます。
