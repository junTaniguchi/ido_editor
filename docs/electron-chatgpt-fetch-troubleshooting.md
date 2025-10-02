# Electron版でChatGPT呼び出しが失敗する場合の確認ポイント

Electronビルドでは、チャット生成や翻訳などの機能は Next.js の API ルート経由で ChatGPT (OpenAI API) を呼び出しています。このとき、`OPENAI_API_KEY` が設定されていないと API ルート側で 500 エラーを返し、フロントエンドでは `fetch` が失敗したように見えます。

## 仕組みの概要

- `src/app/api/llm/chat/route.ts` などの API ルートは、リクエストを受け取った後に `getEffectiveOpenAiApiKey()` で OpenAI の API キーを探します。【F:src/app/api/llm/chat/route.ts†L31-L37】
- `getEffectiveOpenAiApiKey()` は `OPENAI_API_KEY` 環境変数、または `~/.dataloom/settings.json` に保存されたキーを順番にチェックし、見つからなければ `null` を返します。【F:src/lib/server/openaiKeyStore.ts†L63-L85】
- API キーが `null` の場合は `OPENAI_API_KEY が設定されていません。` というエラーメッセージとともに 500 応答を返すため、フロント側の `fetch` は「失敗した」と判断します。【F:src/app/api/llm/chat/route.ts†L31-L37】【F:src/app/api/llm/chat/route.ts†L64-L72】

## 解決方法

1. OpenAI の API キーを準備する。
2. 以下のどちらかの方法でキーをアプリに認識させる。
   - Electron 実行前に `OPENAI_API_KEY` を環境変数として設定する。
   - アプリ内の「設定」画面から API キーを保存して、`~/.dataloom/settings.json` に書き込む。
3. キーが正しく読み込まれると API ルートは OpenAI へリクエストを転送できるようになり、`fetch` のエラーは解消される。

## API キーを設定しても失敗する場合（HTTP 429）

API キーを登録済みでも、サーバーから `429 Too Many Requests` が返ってくるケースがあります。`hook.js` やコンソールに
`You exceeded your current quota, please check your plan and billing details.` と表示される場合は、OpenAI 側が「利用枠（クォータ）を
使い切った」と判断してリクエストを拒否しています。【F:src/app/api/llm/chat/route.ts†L83-L86】

解決策としては次のようなものがあります。

1. OpenAI の [usage ダッシュボード](https://platform.openai.com/usage) で、当日・当月の利用状況が上限に達していないか確認する。
2. 上限に達している場合は時間を置くか、請求上限を引き上げる（有料プランでの上限変更や追加クレジット購入）。
3. 組織で複数人が同じキーを共有している場合は、アクセスが集中していないか・個別キーを発行できないか検討する。

429 が解消されるまで API はレスポンスを返さないため、フロントエンドでは `fetch` が失敗したように見えます。利用枠を回復させ
た後に再度リクエストすると、通常どおり応答が返るようになります。

## 中学生にもわかる説明

ChatGPT を使うには「合言葉（API キー）」が必要です。Electron アプリはまずこの合言葉を探して、見つかったら ChatGPT に話しかけます。でも合言葉が設定されていないと、アプリは ChatGPT に話しかける前に「合言葉がないよ！」とエラーを返してしまいます。その結果、パソコン側では「fetch に失敗した」と表示されるのです。先に合言葉を設定してあげれば、fetch はちゃんと成功します。
