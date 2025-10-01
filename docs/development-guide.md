# DataLoom Studio 開発ガイド

## 🚀 開発環境構築

### 前提条件
- Node.js 18 以上
- npm 8 以上
- Git（推奨: VS Code などのモダンエディタ）
- Chromium 系ブラウザ（File System Access API 対応）

### 初回セットアップ
```bash
# リポジトリの取得
git clone https://github.com/yourusername/dataloom-studio.git
cd dataloom-studio

# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev
# http://localhost:3000 でアプリを確認
```

## 🔑 OpenAI APIキーの永続化
- ヘッダー右上のキーアイコンから「OpenAI APIキー設定」ダイアログを開き、生成系機能で利用するキーを登録できます
- 保存したキーは `~/.dataloom/settings.json`（環境変数 `DATALOOM_CONFIG_DIR` で保存先を変更可）に平文で書き込まれ、ブラウザ版と Electron 版の両方で共有されます
- 環境変数 `OPENAI_API_KEY` が設定されている場合はそちらが優先され、ダイアログ上では状態確認とローカルキーの削除のみが可能です
- 機密保持のため、保存先ディレクトリのパーミッション（既定 700/ファイル 600）を維持し、不要になったキーは削除してください

## 📂 プロジェクト構造
```
src/
├── app/                  # Next.js App Router エントリ
├── components/           # 機能別 React コンポーネント
├── lib/                  # ファイル I/O / データ処理ユーティリティ
├── store/                # Zustand ストア
├── types/                # 型定義
└── test_data/            # サンプルデータセット
```
主な設定ファイル: `next.config.ts`、`tailwind.config.ts`、`tsconfig.json`、`eslint.config.mjs`。

## 🔧 利用可能な npm スクリプト
```bash
npm run dev          # Next.js 開発サーバー
npm run build        # 本番ビルド
npm run start        # 本番ビルドのローカル起動
npm run lint         # ESLint 実行
npm run test         # Vitest 実行（必要に応じて作成）

# Electron 関連
npm run dev:web      # Next.js のみの開発サーバー（Electron と併用）
npm run dev:electron # Electron プロセスを起動
npm run dist         # クロスプラットフォームビルド
npm run dist:win     # Windows 用ビルド
npm run dist:mac     # macOS 用ビルド
```

## 🏗️ 推奨ワークフロー
1. **ブランチ作成**：`git checkout -b feature/xxxx`
2. **開発**：`npm run dev` で UI を確認しながら実装
3. **自己確認**：`npm run lint` / `npm run test`（任意）で静的チェック
4. **ビルド検証**：`npm run build`
5. **コミット & PR**：コミットメッセージは Conventional Commits を推奨（例: `feat: add csv preview filters`）

## 🧪 テスト指針
- 重要ロジック（データ変換、ファイル I/O ラッパー）は Vitest での単体テストを推奨
- UI の回帰確認は Storybook 代替として `npm run dev` + Playwright/E2E テストの導入を検討
- Electron 版は `npm run dev:web` + `npm run dev:electron` で同時起動し、ブラウザ版と挙動差異がないか確認

## 🛠️ デバッグ Tips
- **ブラウザ DevTools**：Application タブで `editor-storage`（Zustand persist）を確認
- **ログ**：`src/lib/*` のユーティリティには `console.debug` を必要最小限で配置。不要になったログは `cleanup_console_logs.py` で除去可能
- **Git パネル**：アプリ内 Git でステージングした内容はブラウザ内に保持されるため、外部ツールとの同期時は `git status` で差分確認

## 🤝 コントリビュート指針
- Issue / PR テンプレートは未設定のため、再現手順・期待値・スクリーンショットを記載
- 大規模変更時は `docs/` 配下の関連資料も更新し、MyGPT ナレッジ（`docs/mygpt-knowledge.md`）との整合性を保つ
- 依存関係を追加する際は `npm install <pkg>` 実行後に `package-lock.json` をコミット

## 📦 Electron ビルドメモ
- `npm run dist` は既定で Windows/macOS 用アーティファクトを生成（mac は ARM64/x64）
- `build.appId` は `studio.dataloom`、`productName` は `DataLoom Studio`
- 署名は別途プラットフォーム固有の証明書を用意し、`electron-builder` の設定で拡張する
