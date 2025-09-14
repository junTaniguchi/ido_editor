# Electron 版 IDO Editor の起動・ビルド手順

## 開発（ローカル）実行

1. Web サーバを起動
   - `npm run dev:web`
2. 別ターミナルで Electron を起動
   - `npm run dev:electron`

ブラウザ版と同じ UI が Electron ウィンドウで動作します。

## パッケージング（配布用）

- 現在の OS 向けにパッケージング:
  - `npm run dist`
- Windows のビルド（インストーラー + ポータブル）を作成（Windows 環境で実行推奨）:
  - `npm run dist:win`
  - 生成物: NSIS インストーラー（`*.exe`）に加え、ポータブル版（`*-portable.exe` など）も出力されます。
- macOS アプリ（.dmg / .zip）を作成（macOS 上で実行）:
  - `npm run dist:mac`

注意: macOS から Windows 用 EXE をクロスビルドするには、`electron-builder` の要件（Wine など）が必要です。確実に EXE を作るには Windows マシン、もしくは用意済みの GitHub Actions を使ってください。

## GitHub Actions での Windows EXE ビルド

リポジトリには `/.github/workflows/build-desktop.yml` を同梱しています。以下のいずれかでトリガーできます。

- Git タグ `vX.Y.Z` を push
- GitHub から "Run workflow" (workflow_dispatch)

成果物は Actions の Artifacts からダウンロードできます（`dist/` 以下）。タグで実行した場合は GitHub Release にも自動公開されます。

### GH_TOKEN の設定（公開時に必要）

electron-builder が GitHub Release に公開する際は環境変数 `GH_TOKEN` が必要です。以下の手順で PAT（Personal Access Token）を設定してください。

1. GitHub → リポジトリ → Settings → Secrets and variables → Actions → New repository secret
2. Name: `GH_TOKEN`
3. Value: 生成した Personal Access Token（推奨スコープ: `repo`）

ワークフローは `env: GH_TOKEN: ${{ secrets.GH_TOKEN }}` を参照します。

## macOS の署名 / 公証（配布向け）

開発用のローカル配布では未署名アプリでも動きますが、配布時は Gatekeeper を通すために Apple Developer アカウントでのコード署名と公証が必要です。

- 署名/公証の自動化は `electron-builder` の `mac` 設定と環境変数（`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `CSC_LINK` など）で可能です。
- まずは未署名で動作確認 → 必要に応じて署名/公証を追加してください。
