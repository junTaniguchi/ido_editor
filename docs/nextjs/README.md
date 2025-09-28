# Next.js アプリケーション仕様

## 概要
DataLoom Studio は Next.js 15.4.5（App Router）と React 19 をベースに構築されています。ブラウザの File System Access API を活用する都合上、主要な画面はクライアントコンポーネントとして実装されています。

## ディレクトリ構成
```
src/app/
├── layout.tsx      # メタデータとテーマ初期化
├── page.tsx        # ルートエントリ（MainLayout を描画）
├── globals.css     # Tailwind ベースの共通スタイル
└── api/            # 現状は未使用（将来の拡張用）
```

## 主要設定ファイル
### `next.config.ts`
- `webpack.resolve.fallback` で `fs` / `path` / `stream` / `react-native-*` を無効化（AlasQL や isomorphic-git をブラウザで扱うため）
- Mermaid を専用チャンクに分割し、初期ロードを軽量化
- `typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds` は現在 `true`（CI での段階的移行を想定）

### `tsconfig.json`
- `baseUrl` と `paths` を設定し `@/components/...` 形式のエイリアスを利用
- `strict` を有効化し型安全性を確保

### `tailwind.config.ts`
- Tailwind CSS v4 preview 構成。`@tailwindcss/typography` を利用して Markdown プレビューのスタイルを拡張

## レンダリング戦略
- `src/app/page.tsx` は `'use client'` を指定し、Zustand ストアを直接参照
- SSR を行わないことで File System Access API・isomorphic-git 等のブラウザ API をシンプルに扱う
- Electron 版でも同じビルドを読み込むため、サーバー依存の機能は避ける方針

## メタデータとテーマ
- `src/app/layout.tsx` の `metadata` で `title`/`description`/`applicationName` を DataLoom Studio に統一
- Cookie 名を `dataloom-theme` に変更し、`ThemeController` と同期
- `<Script strategy="beforeInteractive">` でローディング前にテーマを適用（Flicker 防止）

## Dynamic Import とバンドル最適化
- Plotly、Mermaid、PDF.js、Excel 解析など重量ライブラリはコンポーネント側で `dynamic(() => import(...), { ssr: false })` を用いて遅延ロード
- `next.config.ts` で Mermaid チャンクを分離し、初回ロード時の JS サイズを削減

## グローバル状態
- Zustand ストア（`src/store/editorStore.ts`）は `zustand/middleware` の `persist` を使用し IndexedDB に保存
- `cookies()` からテーマ初期値を取得し、レイアウトで `<html data-theme>` をセット

## ビルド & デプロイ
- `npm run build` で Next.js の静的ビルドを生成。Electron 版では `.next` ディレクトリを同梱
- ブラウザ版のホスティングは静的ファイルサーバーで提供可能（File System Access API は HTTPS か `localhost` が必須）

## 環境変数
- 現状 `.env` は不要。Electron 版の DEV フラグは `ELECTRON_DEV=1 npm run dev:electron` で指定
- 将来的に API 連携を追加する場合は `NEXT_PUBLIC_***` 系環境変数を定義

## テスト
- Next.js 側のユニットテストは Vitest + React Testing Library を想定（`npm run test`）。現状はモック環境を利用してブラウザ API をスタブ化

## トラブルシューティング
| 症状 | 対処 |
| ---- | ---- |
| ビルドで `fs` が見つからない | `next.config.ts` の fallback が適用されているか確認。外部ライブラリ追加時は同様の fallback を追加 |
| File System Access API エラー | `https://` または `http://localhost` でアクセスしているか、ブラウザが対応しているか確認 |
| テーマが初期表示で切り替わらない | Cookie `dataloom-theme` が存在するか、`ThemeController` が Zustand ストアから正しい値を取得しているか確認 |
