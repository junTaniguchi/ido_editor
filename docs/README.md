# DataLoom Studio Documentation

DataLoom Studio の技術仕様・設計・開発運用に関するドキュメント集です。主要な観点ごとに Markdown ファイルを整理しており、アーキテクチャ概要から詳細な API、テスト戦略まで横断的に参照できます。

## 📁 ドキュメント構成

### アーキテクチャ & コンポーネント
- [**architecture.md**](./architecture.md) – 全体アーキテクチャとレイヤー構成
- [**component-structure.md**](./component-structure.md) – UI コンポーネントとストアの構成図

### プラットフォームとビルド
- [**nextjs/README.md**](./nextjs/README.md) – Next.js 設定とランタイム挙動
- [**electron.md**](./electron.md) – Electron 版の開発・ビルド・配布手順
- [**development-guide.md**](./development-guide.md) – ローカル環境構築から開発フローまで

### 機能仕様
- [**features/README.md**](./features/README.md) – エディタ/プレビュー/分析/Git などの詳細仕様
- [**data-analysis.md**](./data-analysis.md) – 単一・複数ファイル分析およびノートブック機能の仕様
- [**api-reference.md**](./api-reference.md) – ユーティリティ関数と主要フックの API サマリ

### 品質保証
- [**testing/README.md**](./testing/README.md) – テストストラテジーと推奨ツール

### フロー図
- [**sequence-diagrams/**](./sequence-diagrams/) – Mermaid によるユーザー操作フローと非同期処理図

## 🔄 更新履歴

### 2025 年 1 月
- プロジェクト名称を **DataLoom Studio** に改称し UI/ビルド設定を更新
- マイGPT 連携用ナレッジベース ([docs/mygpt-knowledge.md](./mygpt-knowledge.md)) を追加
- ドキュメント全体を最新機能（マルチファイル分析、Mermaid GUI、Git パネル等）に合わせて改訂

## システム要件
- Node.js 18 以上
- Chromium ベースブラウザ（File System Access API 対応）
- TypeScript 5 以上
