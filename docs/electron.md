# Electron 版 DataLoom Studio の起動・ビルド手順

## 開発モード
1. Next.js 側を起動: `npm run dev:web`
2. 別ターミナルで Electron を起動: `npm run dev:electron`

同じコードベースをブラウザ/Electron で共有しているため、UI の挙動はほぼ一致します。開発時は Next.js 側でホットリロードが有効です。

## パッケージング
- 現在の OS 向け: `npm run dist`
- Windows（インストーラー & ポータブル）: `npm run dist:win`
  - 出力例: `DataLoom Studio-0.1.0-win-x64-installer.exe`, `...-portable.exe`
- macOS（Universal: x64/arm64）: `npm run dist:mac`
  - 出力例: `.dmg`, `.zip`

`package.json` の `build.appId` は `studio.dataloom`、`productName` は `DataLoom Studio` に設定済みです。

> ⚠️ macOS から Windows 用 EXE をクロスビルドする場合は Wine など追加依存が必要です。安定した成果物が必要な場合は該当 OS で実行するか、CI を使用してください。

## CI/CD（GitHub Actions）
リポジトリ付属の `/.github/workflows/build-desktop.yml` を利用すると、Windows/macOS 用ビルドを自動化できます。

- トリガー: `v*` タグの push または GitHub UI からの手動実行
- アーティファクト: Actions の Artifacts / Release に生成
- 公開用には `GH_TOKEN`（`repo` 権限の PAT）をリポジトリシークレットに登録してください

## 署名・公証メモ
- macOS で配布する場合は Apple Developer アカウントでのコード署名と公証が必要
- Windows で SmartScreen を回避するにはコードサイニング証明書を `electron-builder` 設定に追加
- `CSC_LINK`、`CSC_KEY_PASSWORD`、`APPLE_ID` 等の環境変数を GitHub Actions かローカルに設定すると自動署名が可能

## トラブルシューティング
- **白画面が表示される**: Next.js 側が起動しているか確認し、`npm run dev:web` のログをチェック
- **ファイルアクセスができない**: Electron 版では File System Access API に加え Node.js API も利用可能ですが、セキュリティのため基本はブラウザ版と同じ API を使用しています。権限ダイアログが表示されているか確認してください。
- **ビルドサイズが大きい**: `electron-builder` の `asar` 有効化（既定で ON）と不要ファイルの除外設定を見直してください。
