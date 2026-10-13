# 変更履歴

`0.1.0` は `package.json` の現在のバージョンで、Git のタグを意味しません。

## Unreleased

- GitHub リポジトリを公開用に整備：CI（Node 22/24 のビルド・単体テスト・文書リンク検査・依存関係の脆弱性検査、Chromium のブラウザテスト、全履歴の秘密情報検査）、CodeQL、Dependabot、Issue/PR テンプレート、CODEOWNERS、セキュリティ方針、貢献ガイド、設計・セキュリティ・開発・公開・検証の各文書。
- 本番と同じセキュリティヘッダーで配信する確認用サーバー（`npm start`、http://127.0.0.1:4180/）と、ダブルクリック起動用の `hunet vidsを起動.command` を追加。
- 配信ヘッダーに `X-Frame-Options`、`Cross-Origin-Opener-Policy`、`Strict-Transport-Security` を追加し、`base-uri` を `'none'` に、`Permissions-Policy` で決済機能を無効化。
- ブラウザテスト（Playwright）：体験モードでの作成から MP4 書き出しまで、キーが Google へのヘッダー以外に出ないこと、エラー文、キーの削除、壊れた保存ファイルの拒否、配信ヘッダーと通信先の制限。

## 0.1.0

- 名称を hunet vids に変更し、hunet の色見本（オレンジ #FC9A04、紺 #0D357A）とロゴを適用。動画用テーマ「hunet」を追加。保存ファイルは `.hunetvids`（旧 `.myvids` も読み込み可）。
- Vercel で公開（https://hunet-vids.vercel.app）。Content-Security-Policy で通信先を自サイトと Gemini API に限定。
- 指示文からの絵コンテ作成、ナレーション・画像・動画・人物動画・BGM の生成、編集画面（シーン・テキスト・タイムライン・字幕・録画・アップロード）、MP4 書き出し、体験モード、プロジェクトのバックアップファイル。
- 独立レビューの指摘を反映：中止時に Google 側の生成も取り消す、同じ生成の二重実行防止と同時実行数の制限、ファイル取得先の制限、壊れた保存ファイルの検査、繰り返し背景動画の書き出し、離脱時の自動保存。

モデルの提供状況、料金、利用枠は確認時点によって変わります。
