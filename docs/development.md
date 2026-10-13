# 開発ガイド

## 環境

- Node.js 22.12 以上（`.nvmrc` は 22。CI は 22 と 24 で検査）
- Google Chrome（ブラウザテストの既定）。Chromium で試すときは `PLAYWRIGHT_BROWSER_CHANNEL=chromium`

```bash
npm ci --ignore-scripts
npx playwright install chromium   # Chromium でテストする場合のみ
```

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm run dev` | 開発サーバー（http://127.0.0.1:5173/、ホットリロード。セキュリティヘッダーなし） |
| `npm run build` | 型チェックと本番ビルド（`dist/`） |
| `npm start` | `dist/` を本番と同じヘッダーで配信（http://127.0.0.1:4180/） |
| `npm test` | 単体テスト（Vitest） |
| `npm run test:e2e` | ブラウザテスト（Playwright。自動で `npm start` を起動。先に `npm run build`） |
| `npm run check` | ビルド＋単体テスト＋文書のリンク検査（CI と同じ） |
| `npm run check:docs` | Markdown のローカルリンク検査（ネット接続なし） |
| `npm run test:live` | 実 API の確認（下記） |
| `node scripts/capture-screenshots.mjs` | README 用の画面写真を体験モードで撮影（先に `npm run build`） |

キーなしで画面を確かめるときは「キーなしで体験する」を使います（`src/lib/mock.ts` が仮の素材を作ります）。

## テストの方針

- **単体テスト**（`src/**/*.test.ts`、`scripts/*.test.mjs`）：時刻計算、字幕、WAV、API クライアント（`fetch` を差し替え）、保存ファイル・絵コンテの補正、配信ヘッダーの内容。
- **ブラウザテスト**（`tests/*.spec.ts`）：本番ビルドを `server.mjs` で配信し、本番と同じ CSP の下で操作します。Google への通信は `context.route('https://generativelanguage.googleapis.com/**')` で偽の応答に置き換え、ダミーキー（`tests/helpers.ts` の `DUMMY_KEY`）だけを使います。
  - `demo.spec.ts`：体験モードで作成→自動生成→再生→MP4 書き出し、Google に通信しないこと、壊れた保存ファイルの拒否
  - `api-key.spec.ts`：キーが Google へのヘッダーにだけ出ること、エラー文、再試行しないこと、キーの削除
  - `headers.spec.ts`：全ヘッダーが `vercel.json` と一致すること、他サイトへの通信が遮断されること、書き込み系メソッドの拒否
- `PLAYWRIGHT_BASE_URL=https://hunet-vids.vercel.app npm run test:e2e` で、公開サイトに対して同じテストを実行できます。
- 不具合を直すときは、先にその不具合で失敗するテストを書いてから直します。

## 実 API の確認

自動テストは実キーを使いません。実際の Gemini API を確かめるときだけ、`.env.local`（git に入らない）に次を書いて実行します。

```bash
GEMINI_API_KEY=（自分のキー）
```

```bash
npm run test:live                          # 無料枠で使える台本・ナレーション
LIVE_PAID=image,music,video npm run test:live   # 有料（目安: 約 $0.05 / $0.04 / $0.40）
```

生成物は `live-output/`（git に入らない）に保存されます。結果は [検証記録](validation.md) に、モックでの確認と区別して記録してください。

## GitHub での保守

- `main` には Pull Request 経由で取り込みます。CI（`Check (Node 22)`、`Check (Node 24)`、`Browser tests (Chromium)`、`Secret scan (full history)`）と CodeQL が通ってから Squash で取り込みます。
- 外部の GitHub Actions はコミット SHA で固定しています。Dependabot が更新の Pull Request を作ります。
- ブランチ保護、秘密情報の検出（secret scanning / push protection）、脆弱性の非公開報告は GitHub のリポジトリ設定です。リポジトリをコピーしても引き継がれません。

## 文書

- 利用者向け: [README](../README.md)
- 構成: [architecture.md](architecture.md) ／ 安全設計: [security.md](security.md) ／ 公開: [deployment.md](deployment.md) ／ 検証記録: [validation.md](validation.md) ／ 調査: [research.md](research.md)
- AI エージェント向けの不変条件: [AGENTS.md](../AGENTS.md)
