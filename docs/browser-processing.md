## 2026-10-16 06:26 JST 本番反映の最新状態

本人の「バーセルへの反映もお願いします。」という直接指示を受け、重複防止のためVercel APIと対象プロジェクト管理画面を確認した。旧本番はReady、候補はPreview／Readyで、進行中昇格表示はなかった。承認審査を通過した同一のpromoteを1回実行したが、Vercel APIがHTTP422 `unprocessable_entity`を返した。現在の障害はこのAPIエラーであり、新たな本人承認待ちではない。詳細理由はconnector応答に含まれず未確定。同じ要求の再送、UI昇格、alias差替え、再デプロイによる回避は行っていない。

- 操作：`POST /v10/projects/prj_S0n17sRaPgF3RfZKC2ibgB7bRqly/promote/dpl_HPQbLwNKSn259KjFtTB1c47MLTDz`
- teamId：`team_WAAbwc67azA5nSnKk2XCVrSC`
- Request ID：`cle1:sfo1::gl75l-1792099543403-18d2b5be447f`
- 再確認：本番aliasは旧 `dpl_9ttEFGirSXQdKDo738zL7sPiZijz`、候補はREADY・target:null・aliasなし。
- アプリ実装は `c186c768dbd7ed71b5a240e08057a9bd9fd4fd81`。実API生成、キー操作、課金検証は未実施。本番候補の実配信ヘッダー／加工検証は昇格未完了につき未実施。

以下の「明示承認待ち」「自動承認レビュー拒否」は、この更新前の履歴として読むこと。

---

# ブラウザ動画処理の検証済み候補

2026-10-16版。公開用のブラウザ処理とMacのローカル処理を分けています。Mac版のruntimeは `localMediaEnabled=true / browserMediaEnabled=false` を維持し、既存のffmpeg処理と起動中サーバーを停止・再起動していません。

## 現在の配信状態

本番：https://unko-omni.vercel.app/ はブラウザ処理版（2026-10-16.12）です。Production deployment `dpl_9nNbYhEWBabTmFsVMLs1ckWp7Ldh` がREADYで、本番aliasと一致します。アプリはc186c76の検証済みコード、公開46ファイルのsize/SHA256全件一致です。旧本番 `dpl_9ttEFGirSXQdKDo738zL7sPiZijz` はREADYで残しています。rollback候補一覧APIの取得は403のため、候補資格・実行権限は未確認です。

初回のdirect promoteは対象がPreviewだったためHTTP422となりました。公式CLIと同じcreate_deployment(deploymentId,target:production)でProductionとして再ビルドして解消しました。承認審査は通過済みで、権限や保護の回避はしていません。内部422詳細文はAPI応答にありませんでした。

## 対応範囲

文章から1〜10秒の初回生成と延長、動画取込、末尾10秒以下の抽出、1・2秒への短縮、前半との接続、短縮済み版からの再アップロード延長を提供します。Google API自体の最小指定は3秒で、1・2秒は3秒分を生成してブラウザで短縮します。加工前出力を保存し、加工失敗時には確認用に保持します。

ブラウザ処理は初回素材60秒・50MiB以下、継続する完成版90秒・100MiB以下、720p以下、横16:9／縦9:16です。接続入力の合計150MiB、出力100MiB、1操作240秒を上限とします。720p以下でも端末メモリやコーデックにより失敗する場合があります。スマートフォンの安定動作は未検証です。1080p／4Kの通常native生成は残しますが、ブラウザ加工が必要な指定は送信前に拒否します。

この展開の予定上限40秒を維持します。持ち込み60秒の前半50秒は別扱いのため、全体の保存動画は最大約90秒になり得ます。Googleへ送り直すのは末尾10秒以下だけです。末尾の一部フレームはモデルにより調整され、映像・音声の完全な接続は保証しません。

## キーと動画の扱い

本人だけがキーを入力し、各タブのメモリだけに保持します。固定Google Originへ直接送信し、VercelやMacの処理サーバーへ渡しません。生成以外のブラウザ加工は同じ配信元のWorker内で行い、ファイルをサーバーへアップロードしません。元BlobはWORKERFSへ読み取り専用マウントし、汎用ファイル名だけを使います。処理ごとにマウントと作業ファイルを解放し、中止・失敗・タイムアウト時はWorkerごと終了します。動画由来のログやメタデータ文字列を画面・ログへ出しません。

加工が必要な生成はPOST前に自己検査します。自己検査・入力制約・中止検査で失敗した場合はGoogleへ送りません。POST直前にも取消状態を再検査します。課金後の加工中止はGoogleの取消・返金ではありません。加工失敗・通信失敗から生成を自動再送せず、既存ジョブとraw出力を保ちます。

## 固定エンジンと配布

wrapper `@ffmpeg/ffmpeg@0.12.15` とST core `@ffmpeg/core@0.12.10` を公式npmのSHA512固定で取得します。初回runtime取得は約31MiBです。外部CDN・外部Workerを使わず、全URLを同じ配信元へ明示指定します。既定unpkg URLは使われず、CSPでも拒否されます。SharedArrayBuffer／クロスオリジン隔離は必要ありません。

MIT wrapperとGPL-2.0-or-later coreのライセンス、および公式releaseと18依存ソースのアーカイブを同じ配信元で配布します。全33ファイルは139,951,345bytes、SHA256検証済みです。対応ソースの根拠・残る確認範囲は `dist/vendor/ffmpeg/licenses/README.md` に記録しています。独立リビルドや法的適合の断定は行っていません。

vendorの生成物はGitに入れず、取得スクリプト・source lock・ライセンス記録を追跡します。新しいcheckoutでは先に `node tools/vendor-ffmpeg.mjs` を実行してください。取得は公開公式URLのみ、認証なし、redirect拒否、ハッシュ不一致で停止し、パッケージのスクリプトは実行しません。

coreのffprobeはC戻り値をJSが捨てるため、正常でもsentinel -1になります。毎回前回metadataを削除して不在を確認し、新しい完全UTF-8 JSON、error節なし、尺・寸法等の検証をすべて通す場合だけ採用します。-1だけで成功にしません。

## 再現する

```sh
node tools/vendor-ffmpeg.mjs
npm run check
npm test
python3 test/make-browser-fixtures.py
node test/loopback-harness-server.mjs
```

ハーネスは http://127.0.0.1:4318/ の専用ページです。Googleへの通信をCSPで禁止し、キー／プロンプトを扱いません。自作合成fixtureだけを選びます。テスト専用素材・ハーネスを公開buildへ入れません。

`node tools/prepare-vercel.mjs /tmp/new-omni-sources.json` は固定19テキストファイル（182,126bytes）の送付物を生成します。VercelのBuild Stepで `node tools/build-vercel.mjs` が固定vendorを取得し、検証済みallowlistだけをpublic/へ生成します。rootのvercel.jsonがCSP／Worker CSP／WASM MIME等を設定します。Functions、外部rewrite、分析、ユーザー動画保管はありません。新規契約・ログイン・権限追加は行いません。

## 実測と未確認

- オフライン回帰179件成功。APIのPOST回数、40秒制約、二重送信、WASM失敗／中止、raw保持、誤った尺・寸法、古いprobe結果の再利用防止を含みます。自動テストは外向きfetchを禁止します。
- Chrome実WASMで自己検査、60秒音声付き素材→末尾10秒、前半50秒＋20秒→全体70秒、1・2秒短縮、縦無音素材→末尾10秒、縦無音前半2秒＋音声付き13秒→15秒、720p抽出、中止後の明示再実行、回転タグ付き横データの縦360×640への正規化を確認。
- 保存した横動画を別のnative ffprobeで検査し、映像・音声・containerがそれぞれ10／70／1／2秒と確認。70秒接続の1／49秒地点は元パターン、51／69秒地点は続編の青画面で、各地点の音声RMSも非ゼロでした。数値はbrowser-media-evidence.jsonに記録。
- 保護付きVercelプレビューの実UIで60秒取込、中止、720p再取込が成功。キーは空のまま、Googleへは送信していません。追加認証・保護解除なし。送付ファイルとvendorの固定ハッシュは独立レビュー済み。
- 公開Originでの認証付きGoogle生成、Files upload CORS、1・2秒生成からの実加工、以降の全延長、連続性、費用は未検証。本人がキーを入力して行う確認が必要です。エージェントはキーを取得・入力せず、有料APIを実行していません。
- 本番の46配布ファイルが全件ハッシュ一致、CSP／WASM MIME／安全ヘッダーが適合、非公開14パスが全件404でした。Chromeの本番UIでも音声付き60秒の合成素材から末尾10秒の抽出が成功し、console errorは0件です。キーは空でGoogleへ送信していません。証跡はbrowser-production-verification.jsonに記録しています。
