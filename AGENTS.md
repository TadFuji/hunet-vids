# AGENTS.md — hunet vids

AI エージェント向けの不変条件です。現行仕様は [README](README.md)、[docs/architecture.md](docs/architecture.md)、[docs/security.md](docs/security.md) にあります。

- API キーは `x-goog-api-key` ヘッダーで `https://generativelanguage.googleapis.com` にだけ送る。URL・本文・ログ・画面・保存ファイル・書き出し物に入れない。保存先は localStorage の `my-vids.gemini-key` だけ。
- `fetch` の宛先を応答内容から決めない。生成結果の取得は Files API の `files/...` に限る（`Gemini.download`）。
- 第三者のスクリプト・CDN・Web フォントを追加しない。CSP（`vercel.json`）の `connect-src` は自サイトと Gemini API（と `blob:`/`data:`）だけ。ヘッダーを変えたら `scripts/vercel-config.test.mjs` と `tests/headers.spec.ts` も更新する。
- AI の出力や読み込んだファイルの文字を HTML として解釈しない（`innerHTML`・`dangerouslySetInnerHTML` を使わない）。
- 外部ファイル（`.hunetvids` / `.myvids`）は信用しない入力として `normalizeProject()` と境界検査を通す。
- 有料生成は、同じ生成の二重実行を防ぎ（`runJob` のキー）、中止時は Google 側も取り消す。
- ブラウザ内の保存名（`my-vids` の IndexedDB・localStorage、`MYVIDS1`）を変えない（既存利用者のデータが見えなくなる）。
- モデル ID は `src/lib/gemini.ts` の `MODELS` だけで管理する。
- 検証コマンドは `npm run check` と `npm run test:e2e`。自動テストはダミーキーとモックだけを使い、実 API の確認（`npm run test:live`）とは区別して報告する。実キーや有料生成の成功を、モックの結果から推測して書かない。
