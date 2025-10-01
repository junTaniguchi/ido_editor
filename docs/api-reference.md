# API リファレンス（ユーティリティ概要）

DataLoom Studio のユーティリティ層は、ファイル I/O・データ変換・分析・Git 操作・Mermaid レンダリングを支える関数群で構成されています。ここでは主要モジュールと代表的なエクスポートを整理します。

## 🗂️ `src/lib/fileSystemUtils.ts`
| 関数 | 役割 |
| ---- | ---- |
| `readDirectoryContents(dirHandle)` | File System Access API でフォルダ階層を再帰的に走査し、`FileTreeItem` を構築 |
| `findFileHandleByPath(tree, path)` | 読み込んだツリーから指定パスの `FileSystemFileHandle` を取得 |
| `readFileContent(fileHandle)` | テキスト/Excel/Parquet を判定しつつ内容を取得（Excel はプレースホルダーを返す） |
| `readExcelFileContent(fileHandle)` | Excel ファイルを ArrayBuffer で読み込み、プレビュー/分析ユーティリティに委譲 |
| `writeFileContent(fileHandle, content)` | File System Access API を利用してテキストを書き込み |
| `createNewFile(dirHandle, name)` / `createNewDirectory(dirHandle, name)` | 新規ファイル/ディレクトリを生成 |
| `renameFile(dirHandle, oldPath, newPath)` / `renameDirectory(...)` | ツリーを維持したままリネーム |
| `deleteFile(fileHandle)` / `deleteDirectory(dirHandle)` | アイテムを削除（ディレクトリは再帰削除） |
| `extractZipArchive(fileHandle, target)` / `extractTarGzArchive(...)` | Zip/Tar.gz アーカイブを展開し必要に応じてサブディレクトリを作成 |
| `compressToZip(entries)` / `compressToTarGz(entries)` | 選択ファイルを圧縮し Uint8Array を返却 |
| `searchInDirectory(dirHandle, keyword, options)` | include/exclude/regex 対応の全文検索。結果は `SearchResult[]` |
| `replaceInFile(fileHandle, config)` | 正規表現対応の置換を実行し、ヒット数と成功可否を返す |
| `getFileExtension(name)` / `getMimeType(name)` | ファイル種別推定（プレビューの分岐に利用） |

## 📄 `src/lib/dataPreviewUtils.ts`
| 関数 | 役割 |
| ---- | ---- |
| `detectFileType(name, content?)` | 文字列/バイナリからファイルタイプを推定（csv/json/yaml/ipynb/pdf 等） |
| `parseCsvLike(content, delimiter)` | CSV/TSV を共通処理で解析し配列を返す |
| `parseJson(content)` / `parseYaml(content)` | JSON/YAML をパースし、エラー時はスタック情報付きで例外を投げる |
| `loadExcelFromArrayBuffer(buffer, options)` | `xlsx` を利用し任意シート・範囲を抽出 |
| `loadNotebookFromFile(file)` | `.ipynb` を JSON として読み込み、セル情報を正規化 |
| `readPdfFirstPage(file)` | PDF.js 用に ArrayBuffer を返却 |
| `preparePreviewData(fileHandle, options)` | ファイルハンドルを受け取り、プレビュー用の標準化データを返すハイレベル関数 |

## 📊 `src/lib/dataAnalysisUtils.ts`
| 関数 | 役割 |
| ---- | ---- |
| `executeQuery(data, query, enableNestedAccess)` | AlasQL を実行し結果配列を返す（ネストアクセス用のビューも生成） |
| `executeMultiFileQueryAnalysis(datasets, query, options)` | 複数ファイルモードの統合クエリを処理し、結果セット・統計・チャート設定を返却 |
| `calculateStatistics(data)` | jStat を用いて平均/分散/四分位/欠損数などを算出 |
| `calculateInfo(data)` | 各列の型推定とサンプル値を抽出 |
| `aggregateData(data, grouping, aggregations)` | UI で定義した集計設定からグループ化/集約を実行 |
| `prepareChartData(config)` | 棒/折れ線/散布/ヒストグラム/ガント等に必要なデータとレイアウトを生成 |
| `calculateRegressionLine(points, type)` | 回帰分析（線形/指数/対数/二次）を計算しチャートに重ねるデータを返す |
| `combineMultipleFiles(files, mode)` | UNION / INTERSECTION / JOIN 設定を適用し統合データを生成 |
| `convertDataToFormat(data, format, options)` | CSV/TSV/JSON/YAML/Excel/Parquet テキストへの変換 |
| `downloadData(blob, filename)` | ブラウザダウンロードをトリガー（エクスポート UI で使用） |

## 🔑 `src/lib/server/openaiKeyStore.ts` / `src/lib/llm/llmKeyClient.ts`
| 関数 | 役割 |
| ---- | ---- |
| `getOpenAiApiKeyStatus()` | 環境変数 `OPENAI_API_KEY` とローカル設定を判定し、利用元（env/stored/none）を返却 |
| `setStoredOpenAiApiKey(apiKey)` | `~/.dataloom/settings.json`（`DATALOOM_CONFIG_DIR` で変更可）にキーを保存（パーミッション 600） |
| `deleteStoredOpenAiApiKey()` | 設定ファイルからキーを削除し、キャッシュもクリア |
| `getEffectiveOpenAiApiKey()` | 環境変数優先で有効なキーを取得（なければ保存済みキー） |
| `fetchLlmKeyStatus()` | クライアント側から `/api/llm/openai-key` へ GET し、UI 表示用ステータスを取得 |
| `saveLlmKey(apiKey)` / `deleteLlmKey()` | API 経由でキーを保存/削除し、最新ステータスを返却 |

### Next.js API ルート
- `src/app/api/llm/openai-key/route.ts`
  - `GET`: 現在のキー状態を返す
  - `POST`: 入力されたキーを検証し保存
  - `DELETE`: 保存済みキーを削除
- ランタイムは Node.js 固定（`runtime = 'nodejs'`）、レスポンスは `LlmKeyStatus` 互換オブジェクト

## 🔐 `src/lib/git/fileSystemAccessFs.ts`
- File System Access API を isomorphic-git が扱えるようにラップした `FileSystemAccessFs` クラスを提供
- 読み書き/ディレクトリ列挙/メタ情報取得を isomorphic-git の FS インターフェースに合わせて実装

## 🪄 `src/lib/mermaid/*`
- `initMermaid`：Mermaid v11 を遅延ロードしつつグローバル設定（テーマ/フォント/シーケンス図設定）を適用
- `renderMermaidDiagram`：SVG を生成し、エラー時は再試行ロジックを含む
- `exportMermaidDiagram`：PNG/SVG/クリップボードコピーのエクスポートを司る

## 📦 その他の補助
- `src/lib/editorUtils.ts`：CodeMirror 拡張セットの生成、言語判定、差分ハイライト
- `src/lib/dataFormatUtils.ts`：日付推定、ネスト解除、Excel レンジ正規化など分析前処理
- `src/lib/tocUtils.ts`：Markdown から見出し情報を抽出しプレビューの目次に供給

これらのユーティリティはすべて TypeScript で記述され、Zustand ストアや UI コンポーネントから直接呼び出されます。詳細なシグネチャはソースコードを参照してください。
