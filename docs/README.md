# IDO Editor Documentation

IDO Editor の技術仕様・設計・機能に関するドキュメント集です。

## 📁 ドキュメント構成

### アーキテクチャ設計
- [**architecture.md**](./architecture.md) - 全体アーキテクチャと設計思想
- [**component-structure.md**](./component-structure.md) - コンポーネント構造詳細
- [**state-management.md**](./state-management.md) - Zustand状態管理仕様

### 機能仕様
- [**data-analysis.md**](./data-analysis.md) - データ分析機能の詳細仕様
- [**file-preview.md**](./file-preview.md) - ファイルプレビュー機能仕様
- [**editor-features.md**](./editor-features.md) - エディタ機能仕様
- [**search-replace.md**](./search-replace.md) - 検索・置換機能仕様

### 技術詳細
- [**tech-stack.md**](./tech-stack.md) - 技術スタック詳細
- [**performance.md**](./performance.md) - パフォーマンス最適化
- [**refactoring-history.md**](./refactoring-history.md) - リファクタリング履歴

### 開発ガイド
- [**development-guide.md**](./development-guide.md) - 開発環境構築・運用
- [**api-reference.md**](./api-reference.md) - ユーティリティ関数API仕様
- [**testing-guide.md**](./testing-guide.md) - テスト方針・実行方法

### シーケンス図
- [**sequence-diagrams/**](./sequence-diagrams/) - 各機能の動作フロー図
  - マークダウンプレビュー
  - データ分析機能
  - ファイルプレビュー
  - モード切替処理

## 🔧 更新履歴

### 2024年12月
- DataAnalysis.tsx リファクタリング完了（3,529行 → 643行）
- コンポーネント分離による保守性向上
- 複数ファイル分析機能追加
- FROM句指定機能実装

### システム要件
- Node.js 18.0.0+
- Chromiumベースブラウザ（File System Access API対応）
- TypeScript 5.0+