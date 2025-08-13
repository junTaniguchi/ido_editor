# IDO Editor 開発ガイド

## 🚀 開発環境構築

### 前提条件
- **Node.js**: 18.0.0 以上
- **npm**: 8.0.0 以上  
- **Git**: バージョン管理
- **VSCode**: 推奨エディタ（拡張機能設定済み）

### 対応ブラウザ
- **Chrome**: 86+ (推奨)
- **Edge**: 86+
- **その他Chromiumベース**: 最新版
- **重要**: File System Access API 必須のため、Firefox・Safari非対応

### 初回セットアップ

```bash
# 1. リポジトリクローン
git clone https://github.com/yourusername/ido_editor.git
cd ido_editor

# 2. 依存関係インストール
npm install

# 3. 開発サーバー起動
npm run dev

# 4. ブラウザでアクセス
# http://localhost:3000
```

## 📂 プロジェクト構造詳細

### 重要ディレクトリ
```
src/
├── components/          # React コンポーネント
│   ├── analysis/       # データ分析機能
│   ├── editor/         # テキストエディタ
│   ├── preview/        # ファイルプレビュー
│   └── ...
├── lib/                # ユーティリティ関数
├── store/              # Zustand状態管理  
├── types/              # TypeScript型定義
└── hooks/              # カスタムフック
```

### 設定ファイル
```
├── next.config.ts      # Next.js設定
├── tailwind.config.ts  # Tailwind CSS設定
├── tsconfig.json       # TypeScript設定
└── package.json        # 依存関係・スクリプト
```

## 🔧 開発コマンド

### 基本コマンド
```bash
# 開発サーバー起動
npm run dev

# 本番ビルド
npm run build

# 本番プレビュー
npm run start

# 型チェック
npm run type-check

# リンター実行
npm run lint

# フォーマッター実行
npm run format
```

### 開発時推奨コマンド
```bash
# 型チェック + ウォッチモード
npm run type-check -- --watch

# リンター修正
npm run lint -- --fix
```

## 🏗️ 開発ワークフロー

### 1. 機能開発手順
```bash
# 1. 開発ブランチ作成
git checkout -b feature/new-feature

# 2. 開発 & テスト
npm run dev
# 実装・テスト・修正の繰り返し

# 3. 型チェック & リント
npm run type-check
npm run lint

# 4. ビルドテスト
npm run build

# 5. コミット & プッシュ
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### 2. リファクタリング手順
```bash
# 1. 現状確認
git status
npm run type-check

# 2. 段階的リファクタリング
# - 小さな単位での変更
# - 各段階での型チェック確認

# 3. 動作確認
npm run dev
# 全機能の動作テスト

# 4. 最終検証
npm run build
npm run type-check
npm run lint
```

## 🧪 テスト戦略

### 現在のテスト方針
- **手動テスト**: ブラウザでの機能確認
- **型安全性**: TypeScript による静的チェック
- **ビルドテスト**: 本番ビルド成功確認

### 将来のテスト拡張
```bash
# Jest + React Testing Library 導入予定
npm test                    # ユニットテスト
npm run test:integration   # 統合テスト  
npm run test:e2e          # E2Eテスト (Playwright)
```

## 🎨 コーディング規約

### TypeScript規約
```typescript
// ✅ Good: 明確な型定義
interface UserData {
  id: string;
  name: string;
  email?: string;
}

// ✅ Good: 関数型コンポーネント
const MyComponent: React.FC<Props> = ({ data }) => {
  // 実装
};

// ❌ Bad: any型の使用
const handleData = (data: any) => { /* ... */ };
```

### React規約
```tsx
// ✅ Good: フックのカスタム化
const useFileData = (fileId: string) => {
  return useQuery(['file', fileId], () => fetchFile(fileId));
};

// ✅ Good: メモ化でパフォーマンス最適化
const ExpensiveComponent = React.memo(({ data }) => {
  const computed = useMemo(() => heavyComputation(data), [data]);
  return <div>{computed}</div>;
});
```

### CSS/Tailwind規約
```tsx
// ✅ Good: 一貫した spacing
<div className="p-4 m-2 space-y-2">

// ✅ Good: ダークモード対応
<div className="bg-white dark:bg-gray-900 text-black dark:text-white">

// ✅ Good: レスポンシブデザイン  
<div className="w-full md:w-1/2 lg:w-1/3">
```

## 🔍 デバッグ手法

### ブラウザ開発者ツール
1. **Console**: エラーログ・デバッグ出力確認
2. **Network**: ファイル読み込み・API通信確認
3. **Application**: LocalStorage・状態確認
4. **Performance**: レンダリング性能分析

### React Developer Tools
- **Components**: コンポーネント階層・Props確認
- **Profiler**: レンダリング性能分析

### VS Code デバッグ設定
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Next.js: debug server-side",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/node_modules/.bin/next",
      "args": ["dev"],
      "console": "integratedTerminal"
    }
  ]
}
```

## 📈 パフォーマンス最適化

### 開発時チェックポイント
1. **バンドルサイズ**: `npm run build` でサイズ確認
2. **重複インポート**: 不要なライブラリ削除
3. **メモリリーク**: 大容量ファイル処理時の確認
4. **レンダリング**: React DevTools Profiler活用

### ビルド最適化
```javascript
// next.config.ts での最適化例
const nextConfig = {
  experimental: {
    optimizeCss: true,
    swcMinify: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production',
  }
};
```

## 🚨 トラブルシューティング

### よくある問題

#### 1. File System Access API エラー
```
Solution: HTTPS または localhost での実行確認
```

#### 2. TypeScript型エラー
```bash
# 詳細エラー確認
npm run type-check

# キャッシュクリア
rm -rf .next
npm run build
```

#### 3. メモリ不足エラー
```bash
# Node.js メモリ制限拡張
export NODE_OPTIONS="--max-old-space-size=4096"
npm run build
```

#### 4. Hot Reload が効かない
```bash
# 開発サーバー再起動
npm run dev

# ブラウザキャッシュクリア
Ctrl+Shift+R (Windows/Linux)
Cmd+Shift+R (Mac)
```

## 🔄 継続的インテグレーション

### GitHub Actions (将来実装)
```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run type-check
      - run: npm run lint  
      - run: npm run build
```

## 📚 推奨リソース

### 学習資料
- [Next.js Documentation](https://nextjs.org/docs)
- [React 19 Migration Guide](https://react.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

### 開発ツール
- **VSCode拡張機能**:
  - ES7+ React/Redux/React-Native snippets
  - Tailwind CSS IntelliSense  
  - TypeScript Hero
  - Prettier
  - ESLint

## 🤝 貢献ガイドライン

### プルリクエスト手順
1. **Issue作成**: 機能要求・バグ報告
2. **ブランチ作成**: `feature/` または `fix/` プレフィックス  
3. **実装**: コーディング規約遵守
4. **テスト**: 手動テスト・型チェック・ビルド確認
5. **PR作成**: 詳細な説明・変更内容記載

### コミットメッセージ規約
```
feat: 新機能追加
fix: バグ修正  
docs: ドキュメント更新
style: コードフォーマット
refactor: リファクタリング
test: テスト追加
chore: その他タスク
```