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
- Windows の EXE を作成（Windows 環境で実行するのが確実）:
  - `npm run dist:win`
- macOS アプリ（.dmg / .zip）を作成（macOS 上で実行）:
  - `npm run dist:mac`

注意: macOS から Windows 用 EXE をクロスビルドするには、`electron-builder` の要件（Wine など）が必要です。確実に EXE を作るには Windows マシン、もしくは用意済みの GitHub Actions を使ってください。

## GitHub Actions での Windows EXE ビルド

リポジトリには `/.github/workflows/build-windows.yml` を同梱しています。以下のいずれかでトリガーできます。

- Git タグ `vX.Y.Z` を push
- GitHub から "Run workflow" (workflow_dispatch)

成果物は Actions の Artifacts からダウンロードできます（`dist/` 以下）。

## macOS の署名 / 公証（配布向け）

開発用のローカル配布では未署名アプリでも動きますが、配布時は Gatekeeper を通すために Apple Developer アカウントでのコード署名と公証が必要です。

- 署名/公証の自動化は `electron-builder` の `mac` 設定と環境変数（`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `CSC_LINK` など）で可能です。
- まずは未署名で動作確認 → 必要に応じて署名/公証を追加してください。
