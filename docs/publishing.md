# Vercel公開（2026-10-16）

本番URL：**https://unko-omni.vercel.app/**。Production deployment `dpl_9nNbYhEWBabTmFsVMLs1ckWp7Ldh` はREADY。アプリ実装c186c76を、検証済みPreview `dpl_HPQbLwNKSn259KjFtTB1c47MLTDz` からProductionとして再ビルドしました。全46配布ファイルが期待manifestとsize／SHA256一致です。

## 対象と配布物

既存のteam `team_WAAbwc67azA5nSnKk2XCVrSC`、project `prj_S0n17sRaPgF3RfZKC2ibgB7bRqly`（unko-omni）を使います。追加ログイン・認証・権限・契約・環境変数設定は行いません。本人キーは本人が入力し、各タブのメモリから固定Google APIへ直接送ります。Vercelに動画・プロンプト・キーを送りません。

`node tools/prepare-vercel.mjs /tmp/new-sources.json` で固定19テキストファイル（182,126bytes）の送付物を生成します。アプリdistの固定12ファイル、build用tools4ファイル、license README、root vercel.json／package.jsonだけです。checkout全体・test・動画・診断・.runtime・秘密・Node処理サーバーは送付しません。

Build Step `node tools/build-vercel.mjs` は公式URLからSHA512／SHA256固定のvendorを取得し、固定allowlistをpublic/へ生成します。runtimeはlocalMediaEnabled=true／browserMediaEnabled=true、Mac用local-media-clientは無通信拒否スタブです。公開46ファイルは140,113,005bytesで、うちvendor33ファイルは139,951,345bytes、vendor manifestも配布します。約31MiBのruntimeだけをブラウザが必要時に読み込みます。対応するGPL等のライセンスとソース全件は同じ配信元で取得可能です。generated vendorはGit対象外ですが取得スクリプト・固定lock・license READMEは追跡します。

root vercel.jsonのCSPは最低限のwasm-unsafe-eval／worker-src selfを許可します。Workerの通信はselfのみ、WASMはapplication/wasmです。Google以外の第三者runtimeや分析、Functions、外部rewrite、ユーザー動画保管はありません。本番aliasは公開し、Preview／個別デプロイは既存Vercel認証を保持します。共有バイパスや保護解除は使いません。

## PreviewからProductionへ

直接promote APIはProductionを対象とします。Preview（target:null）を直接promoteした初回要求はHTTP422になりました。公式CLIはPreviewなら新しいProductionを作成します：

- https://vercel.com/docs/deployments/promoting-a-deployment
- https://vercel.com/docs/cli/promote
- https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/promote/request-promote.ts

今回も認証済みcreate_deploymentに既存PreviewのdeploymentId、正しいname／project／teamId、target:productionを指定し、公式CLIと同じ再ビルド手順で成功しました。無再ビルドの同一artifactとは扱わず、READY後に全46ファイルを検証済みmanifestと照合しました。アプリsource19ファイルもPreviewと同一です。権限拒否の回避ではなく、誤った環境向けAPIの手順修正です。API内部の422詳細メッセージは未取得です。

## 確認結果と未確認

認証なしGETで全46ファイルのsize／SHA256一致、root200、CSP／WASM MIME／nosniff／no-referrer／X-Frame-Options DENYを確認。test、fixture、tools、docs、.runtime、.env、server、package、vercel設定等の非公開14パスは全て404です。docs/browser-production-verification.jsonに詳細を保存しています。

Chromeの本番UIで、キー空のまま60秒の音声付き合成動画→末尾10秒／前半50秒のローカル準備が成功し、console errorは0件でした。1／2秒短縮、70秒接続、縦動画、720p、中止／再実行は同じコードの合成fixture検証で成功済みです。オフライン回帰179件成功。Google実API生成・認証付きFiles送信・CORS・全延長・連続性・費用は未検証です。

## 戻し先

旧本番 `dpl_9ttEFGirSXQdKDo738zL7sPiZijz` は削除せず、READYのまま保持しています。rollback候補一覧を取得するAPIだけは403だったため、回避・新認証・権限追加は行わず、候補資格と実行権限は未確認と記録します。rollback操作を成功したものとして報告しません。実際に戻す必要が生じた場合は、既存権限で利用できる正規rollbackの可否を確認します。

Macローカル版 http://127.0.0.1:4317/ のPID99786を停止・再起動せず、runtime true/falseを維持しました。本人の既存タブを再読み込みしていません。
