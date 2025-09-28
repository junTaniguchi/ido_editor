# テスト戦略 - DataLoom Studio

## 方針
- **ユーティリティの信頼性確保**：データ変換やファイル操作など副作用の大きい処理を単体テストで担保
- **UI の回帰防止**：React Testing Library で主要フロー（ファイル読み込み→分析→エクスポートなど）を検証
- **統合確認**：Electron 版を含めた E2E テストは Playwright 導入を前提に段階的に整備

## 推奨テクノロジー
| レイヤー | 推奨ツール | 対象 |
| ---- | ---- | ---- |
| Unit | [Vitest](https://vitest.dev/) | `src/lib/**` のユーティリティ、Zustand セレクター |
| Integration | React Testing Library + Vitest | エディタ/分析/プレビューコンポーネント |
| E2E | Playwright | ブラウザ/ Electron での操作フロー（将来拡張） |

## コマンド
```bash
npm run test          # Vitest 実行（watch モード）
npm run test -- --run # CI 向け一括実行
npm run lint          # ESLint による静的解析
npm run build         # ビルド確認（型エラー/バンドルエラー検出）
```

## テスト対象の優先順位
1. **データ処理**：`dataAnalysisUtils` / `dataPreviewUtils` / `fileSystemUtils`
   - 例: CSV→JSON 変換の精度、統計集計、検索/置換機能
2. **状態管理**：`editorStore` のアクション／セレクター
   - 例: タブ追加・削除、複数ファイル分析の選択状態、テーマ設定
3. **UI フロー**：
   - ファイルを開く → プレビュー表示 → エクスポート
   - データ読み込み → SQL 実行 → チャート描画 → Notebook 保存
   - Markdown 編集 → Word エクスポート → Mermaid プレビュー

## モックとスタブ
- File System Access API は `vitest-mock-extended` などで `FileSystemDirectoryHandle` / `FileSystemFileHandle` をスタブ化
- Chart.js / Plotly / Mermaid は JSDOM 非対応のため、テストではダミーコンポーネントに差し替え
- `window.showOpenFilePicker` など未実装 API は `vi.stubGlobal` で定義

## カバレッジ目標
| 項目 | 目標 |
| ---- | ---- |
| ユーティリティ | 80% 以上 |
| クリティカル UI フロー | 主要パスを最低 1 ケース |
| Electron 特有ロジック | `electron/` ディレクトリの IPC ラッパーをユニットテスト |

## CI への組み込み例
```yaml
name: test
on: [push, pull_request]
jobs:
  vitest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npm run lint
      - run: npm run test -- --run
      - run: npm run build
```

## 今後の課題
- Playwright による Electron 自動テストのサンプル整備
- 大規模データセットを用いたパフォーマンス計測とベンチマーク
- LLM ナレッジ（`docs/mygpt-knowledge.md`）とテストケースを連携し、ドキュメント駆動の QA を実現
