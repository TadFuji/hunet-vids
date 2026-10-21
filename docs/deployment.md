# 公開手順と記録

## 公開先

- URL: https://hunet-vids.vercel.app
- Vercel プロジェクト: `hunet-vids`（チーム tadfuji's projects、スコープ `tadfujis-projects`）
- ビルド: `vercel.json` の `framework: vite`、`buildCommand: npm run build`、`outputDirectory: dist`。セキュリティヘッダーも `vercel.json` で付けます。
- GitHub と Vercel は**接続していません**（所有者の判断、2026-10-13）。`main` に取り込んでも公開サイトは変わりません。

## 公開のしかた

公開は、依頼があったときだけ行います。

```bash
npm run check
npm run build
npm run test:e2e
npx vercel@latest deploy --prod --scope tadfujis-projects
```

- Vercel CLI はグローバルにインストールしていないため `npx` で実行します。初回はこのフォルダで `npx vercel@latest link --project hunet-vids --scope tadfujis-projects` が必要です（`.vercel/` が作られ、git には入りません）。
- `vercel link` は一時的な認証トークンを `.env.local` に書きます。このファイルは `.gitignore` と `.vercelignore` で、git と公開の両方から除外しています。
- 公開後の確認：

```bash
curl -sI https://hunet-vids.vercel.app | grep -i -E "content-security|x-frame|referrer"
PLAYWRIGHT_BASE_URL=https://hunet-vids.vercel.app npm run test:e2e
```

## 記録

| 日付 | 内容 | 確認 |
|---|---|---|
| 2026-10-13 | 初回公開。新規プロジェクトの初回公開は Vercel の仕様で本番扱いになり、プレビューでの事前確認は行っていない | 公開サイトで体験モードの作成→MP4 書き出し（1920×1080）成功。CSP の下で Gemini API へは届き、他サイトへの通信は遮断されることを確認 |
| 2026-10-13 | 名称を hunet vids に変更し、ブランド色とロゴを適用 | 公開サイトで設定・一覧・編集画面の表示を確認 |
| 2026-10-21 | 図解取扱説明書（`/guide.pdf`）、配信ヘッダーの強化（`X-Frame-Options`、`Cross-Origin-Opener-Policy`、HSTS、`base-uri 'none'`、`payment=()`）、生成キャンセル・動画切り替え・バックアップ検査・不要素材削除の強化を本番公開 | 公開サイト（`https://hunet-vids.vercel.app`）でセキュリティヘッダーとブラウザテスト 13 件（＋ローカル 14 件・単体テスト 31 件）成功 |
