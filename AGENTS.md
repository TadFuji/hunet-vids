# 2026-10-28 3〜10秒仕様・ナレーション統合・Lyria 3.5音楽統合・Vercel本番公開（最新）

ご本人の明示依頼に基づき、以下の4点を実装・検証し、Vercel本番へ公開します：
1. **動画生成の最小秒数を3秒に変更**：「1秒・2秒を選んで3秒生成後に切り詰める」方式を廃止し、初回・延長とも整数 `3..10` 秒（既定10秒、最大40秒）に統一しました。
2. **「やさしい音声づくり」（Gemini 3.8 Flash TTS）のフル統合**：`dist/narration.js` を新設し、1人読み上げ・2人の会話（相づち対応）・30種プリセット＋約2,000種拡張音声ライブラリ・21種の話し方＋3段階の速度＋文中スタイル切替・全36種の表現タグ・声のデザイン（Voice Design）・声の複製（Voice Replication：10〜30秒サンプル＋同意音声の24kHzモノラルWAV変換）・冒頭約10秒試聴を統合しました。
3. **「音楽・BGMスタジオ」（Lyria 3.5 / Lyria 3 Clip）のフル統合**：`dist/music.js` を新設し、BGM・インスト（歌なし背景音楽・ナレーション帯域配慮設定つき）とボーカル曲（6種の歌声スタイル・歌詞・10種のセクション構成タグ `[Intro]`〜`[Outro]`）の切り替え、17種のジャンル、12種のムード、16種の楽器チップ選択、テンポ/BPM・12種の調性（キー）・目標秒数（10〜180秒・動画長同期）・エンディング指定、さらに動画の現在フレームや画像から作曲するマルチモーダル入力と、Lyriaが返した歌詞・構成テキストの表示に対応しました。
4. **動画の元音声・ナレーション・BGMの音量調整つきミックス・復元**：`local-media.mjs` および `dist/browser-media.js` に `mixAudio`（FFmpeg `adelay` + `amix` + `alimiter` + `-c:v copy`）を追加し、開始秒数・元動画音量（0%〜200%）・ナレーション/BGM音量（10%〜200%）・ナレーションとBGMの重ね録り・元の動画音声への復元（`restoreAudio`）に対応しました。ナレーション・BGM合成後の動画を再アップロード延長する際は、Googleへ送る末尾10秒に合成前の `cleanBlob` を自動使用し、ローカル前半結合で合成済み動画を保持します。

---

# 2026-10-16 表示・再生・延長のローカル修正（履歴）

本人の限定承認により、2026-10-16.13をローカルで実装・検証しました。「表示」は中央プレビューへ移動＋focus、「再生」は履歴三角/タイムライン共に実play、延長は動画情報の検証通過後に許可し再生終了を必須にしません。実尺・画角等の採用検査、busy/pending、キー必須、40秒、明示分岐、課金再送防止は維持しています。全185テスト成功、独立UI/core58件成功・重大指摘なし、合成3→6秒と実再生をChromeで確認。実Google APIは0件、本人タブ/動画/キーに触れていません。

この修正版のVercel本番反映は、公開の明示確認が必要として自動承認レビューで拒否されました。今回の許可はローカル修正・検証までです。公開・promote・alias操作・別経路の公開回避を行わないでください。公開版は5cab7fb / dpl_9iUmkx8HhJ5KQRsCmqfMekgnNjHdのままです。

PDFも未公開のローカル修正候補として整合させ全7ページ確認、公開済みPDF/文案はdocs/archiveへ保全しています。公開版のmanifest/検査証跡は履歴として保持し、候補版はdocs/playback-local-public-manifest-20261016.jsonおよびdocs/playback-local-verification.jsonを参照してください。詳細はdocs/playback-local-fix-20261016.md。

既存4317サーバーと本人の既存タブは再起動・再読込・閉じる・状態消去をしないこと。10:00 JSTからMac作業停止の指示を維持します。以下は過去の経過です。

---

# 2026-10-16 PDF利用ガイド公開完了（履歴）

本番 https://unko-omni.vercel.app/ はProduction `dpl_9iUmkx8HhJ5KQRsCmqfMekgnNjHd`（READY）を参照しています。リリースcommitは5cab7fbbb7505b6d4984962c5f81e8cdfb1fe180。アプリ処理JSはc186c76のまま、PDFとダウンロード案内・本人指定の取込ベータ注意だけを追加しました。

PDFは `/manuals/omni-continue-user-guide-20261016.pdf`（7ページ・187056bytes）。全ページを描画して確認し、公開GET・Chrome実ダウンロードのSHA256が同一でした。公開47ファイルのsize/hash、安全ヘッダー、WASM MIME、Worker CSP、非公開14パス404を確認。既存テスト179件成功。SSO/password/trustedIPsの設定は変更していません。詳細はdocs/manual-production-verification.json。

本人の新しい報告では実API3秒→6秒に成功しています。こちらは実APIを実行せず、本人キーを取得・入力していません。再生終了まで延長が無効なのは明示視聴ゲートです。履歴三角印は装飾、「表示」とタイムラインの「再生」はプレビュー選択だけで、自動再生・移動をしないUI不一致を合成動画で再現しました。今回は機能変更禁止のため修正せず、原因・限定修正案をdocs/playback-diagnosis-20261016.md、現行操作をPDF3/6ページに記録しました。本人タブ・動画を再読込/消去していません。

旧PDFの所在は検索で見つからず照会中。日付付き新規PDFとして保存し、旧ファイルの上書き・削除はしていません。添付の私人診断JSON/画像は非公開入力フォルダのみで扱い、Git/配布物には含めません。診断専用4371サーバーは終了し、既存4317/PID99786には触れていません。

以下は過去の経過です。

---

# 2026-10-16 本番反映完了（PDF公開前の履歴）

本番 https://unko-omni.vercel.app/ はブラウザ動画処理版です。Production deployment `dpl_9nNbYhEWBabTmFsVMLs1ckWp7Ldh` はREADY。get_aliasで本番ドメインがこのIDを指すことを確認しました。アプリ実装は `c186c768dbd7ed71b5a240e08057a9bd9fd4fd81` で、再ビルド後の公開46ファイルが検証済みmanifestと全件一致しています。

HTTP422の手順上の不一致を確認しました。対象はPreview（target:null）であり、直接のpromote APIはProduction向けでした。公式CLI `packages/cli/src/commands/promote/request-promote.ts` はtargetがproduction以外なら `/v13/deployments` にdeploymentId＋target:productionを送って新しいProductionを作ります。その正規手順で再ビルドし、本番反映に成功しました。Vercel内部の422詳細文はconnectorから返されていません。契約・認証・権限・保護設定は変更せず、同じ422の盲目的再送やalias直接差替えは行っていません。

本番GET監査は46/46ファイルのsize/SHA256一致、安全ヘッダー、Worker CSPの同一origin制限、WASM MIME、非公開14パス404で指摘0件。Chrome本番UIでキー空のまま、音声付き60秒の合成動画→前半50秒＋末尾10秒の準備に成功し、console errorは0件でした。実API生成・Files実送信・課金・実出力の連続性は未検証です。本人キーを取得・入力していません。

旧本番 `dpl_9ttEFGirSXQdKDo738zL7sPiZijz` 自体はREADYのまま保持しています。rollback候補一覧APIのみHTTP403だったため、それを回避せず候補資格・実行権限は未確認としています。rollback操作は実行していません。MacのPID99786／4317および本人の既存タブは停止・再読み込みしていません。

公式資料：
- https://vercel.com/docs/deployments/promoting-a-deployment
- https://vercel.com/docs/cli/promote
- https://github.com/vercel/vercel/blob/main/packages/cli/src/commands/promote/request-promote.ts
- https://vercel.com/docs/rest-api/deployments/create-a-new-deployment

詳細な本番HTTP証跡は docs/browser-production-verification.json。以下の未反映・承認待ち・422停止の記述は過去の経過です。

---

## 2026-10-16 06:26 JST 本番反映の状態（履歴）

本人の「バーセルへの反映もお願いします。」という直接指示を受け、重複防止のためVercel APIと対象プロジェクト管理画面を確認した。旧本番はReady、候補はPreview／Readyで、進行中昇格表示はなかった。承認審査を通過した同一のpromoteを1回実行したが、Vercel APIがHTTP422 `unprocessable_entity`を返した。現在の障害はこのAPIエラーであり、新たな本人承認待ちではない。詳細理由はconnector応答に含まれず未確定。同じ要求の再送、UI昇格、alias差替え、再デプロイによる回避は行っていない。

- 操作：`POST /v10/projects/prj_S0n17sRaPgF3RfZKC2ibgB7bRqly/promote/dpl_HPQbLwNKSn259KjFtTB1c47MLTDz`
- teamId：`team_WAAbwc67azA5nSnKk2XCVrSC`
- Request ID：`cle1:sfo1::gl75l-1792099543403-18d2b5be447f`
- 再確認：本番aliasは旧 `dpl_9ttEFGirSXQdKDo738zL7sPiZijz`、候補はREADY・target:null・aliasなし。
- アプリ実装は `c186c768dbd7ed71b5a240e08057a9bd9fd4fd81`。実API生成、キー操作、課金検証は未実施。本番候補の実配信ヘッダー／加工検証は昇格未完了につき未実施。

以下の「明示承認待ち」「自動承認レビュー拒否」は、この更新前の履歴として読むこと。

---

# Project instructions

## Purpose

Japanese BYOK video generation studio. Text → desired initial 1..10s → extensions using Gemini Omni 1.1 Flash Interactions previous_interaction_id, max 40s. Optional user-selected upload with local tail preparation; no external login, no paid generation by an agent.

## Structure and commands

- `dist/`: deployment-ready, dependency-free HTML/CSS/ES modules with no sample media or demonstration mode.
- `dist/core.js`: session state machine, version lineage, exclusive operation lock, duration acceptance, failure recovery.
- `dist/google.js`: fixed-origin Google REST adapter only. The fetch default must be a wrapper function to preserve browser fetch binding.
- `dist/local-media-client.js`: chosen bytes to same-origin local processor only; never send a key, prompt, ID or URI there.
- `local-media.mjs`: existing ffmpeg/ffprobe, temporary bounded bytes-only processing, no shell/network protocols/user paths.
- `dist/media.js`: detached video metadata validation; unknown durations wait for durationchange and remain recoverable on timeout.
- `dist/app.js`: DOM UI, ephemeral key, Blob URLs, video metadata validation and playback gating. User-controlled values use textContent.
- `server.mjs`: loopback static server plus strictly same-origin local media routes; no Google API proxy/request logging. Security headers are in this file.
- `起動.command` / `npm run start:background`: detached server with independent stdio/minimal environment; `停止.command` / `npm stop`: stop only verified managed PID. `npm run status`: read status. Use these for user handoff; do not leave a tool-managed PTY as the user's running server.
- `npm start` is foreground development only; closing its shell stops it. The app serves http://127.0.0.1:4317. `npm run check`; `npm test` (mock, no credentials).
- `tools/manage-server.mjs` owns `.runtime/` (ignored PID/identity record and startup-only diagnostic log). Never store keys or request bodies there. Verify health app+checkout fingerprint+pid+startedAt against saved record before stopping. Refuse unmanaged existing servers instead of claiming durable start. No login item/launch agent installed.
- `test/make-demo.py` recreates private test/fixtures media using Python standard library + existing ffmpeg. It creates synthetic labelled test media, never model output. Never write these fixtures into dist or expose them through the UI.

## Security and cost invariants

Never retrieve, create, configure or type the user's real API key; only the user enters it. Never run a billable API generation as validation. Never store keys in files, environment variables, logs, URLs, persistent browser stores, or a proxy. No third-party runtime scripts. No logging server response/error bodies. Credentials only in fixed Google x-goog-api-key headers; no redirects. Validate video URIs before attaching a key. Keep tabs/users completely separate through browser memory.

No automatic POST retry. Pending/uncertain request blocks new POST. Recovery only GETs existing interaction/files, never regenerates. Explicit abandonment explains possible running generation/cost and requires acknowledgement. Known terminal failures preserve previous versions. Duration mismatch/unreadable metadata are review states: retain the job, interaction ID, and Blob; block new POST until explicitly released. Local recheck never fetches; resume always GETs the same interaction. Retain every distinct rejected output; deduplicate same-ID identical bytes and update adoption/measurement labels after recheck. Export only the diagnostics allowlist, never IDs, prompts, keys, headers, URIs, raw responses or video bodies. Duplicate IDs must never enter version history. Manual ID recovery verifies input text and previous_interaction_id; mismatches keep the lock. Clear recovery field on each new job and successful recovery.

Both REST `steps[].content[]` data/uri video outputs are supported; select the latest video by reverse steps/content scan, stopping at the latest user_input, as official SDK does. Never fall back to an older candidate if the latest video has no payload. Verify response interaction/parent IDs; absent parent metadata on extensions requires an input-inclusive GET and remains uncertain if still absent. Manual recovery normalizes top-level input and latest user_input; contradictory representations must fail.  SDK-only output_video is not relied on. Completion status and file ACTIVE must be checked. Polling is bounded and resumable. Duration metadata must match the expected cumulative length. Never silently rename a short or partial output as a successful requested-length step. Selecting history for playback does not change the base; branching is explicit. Enforce 40s in state logic, not UI alone.

## API decisions and remaining verification

Official Omni docs show normal POST with delivery:uri and Files polling. background:true is not sent because Omni-specific support is unverified. store:true is necessary for multi-turn; disclose Google-side retention separately from local ephemeral storage.

Use the official prompt role tag `[# Sources <PREVIOUS_VIDEO>@Video1]` for native extension, with appended API 3..10s and expected cumulative length. Do not add task:extend alongside previous_interaction_id without new official evidence; current official script omits task for that route. Set response_format.duration to the API duration '3s'..'10s' for initial and continuation requests; user-desired 1/2s must request 3s then explicitly trim locally. This syntax and the previous_interaction_id route were verified in Google's official google-gemini/gemini-skills scripts/video/generate_video.py (parse_and_validate_duration lines111–135, video_config/create_kwargs lines404–450). Do not replace it with duration_seconds or a cumulative duration. Actual output is still untested against the live API; verify MP4 metadata, display expected and actual length separately, keep mismatches and any output over 40s in review. The strict 40s limit uses total browser playback duration including audio/container tails; no per-track acceptance or implicit rounding/trimming. Explicit local trimming is only for a requested 1/2s duration; retain raw output. Model and composed duration tolerance is 0.1s, with strict 40s model/text-whole limits. Tests verify short initial output, extension shorter than its parent, and over-limit output remain inspection-only. Allowed video aspect ratios are16:9/9:16 only. resolutions 360p/720p/1080p/4k. 1080p/4k are upscaled. New-session defaults are16:9/360p; type:video and delivery:uri are documented fields.

Live authorized generation, actual durations/content/continuity/pricing and authenticated browser requests remain untested. Keyless OPTIONS CORS preflight succeeded for local Origin; this is not live API acceptance. Maintain this distinction in documentation and final reports.

No deployment was authorized. Sources are in a new isolated directory. Do not modify sibling projects or slides. For later publication read `docs/publishing.md` and the Sites skill; preserve privacy and avoid new permissions/subscriptions.


## Live-only UI and missing-key behavior

The app always uses GoogleGateway. No mode switch, DemoGateway or sample media may be reachable from dist. Private offline tests remain under test/ only. The key password input updates session memory on input; whitespace-only/deletion clears it. Never retrieve/type a real key as an agent. A nonempty input is not proof of valid credentials.

Missing-key generate/extend uses a dimmed but focusable/clickable button and the exact native alert `Gemini の API キーを入力してください`; no API request is sent. Busy/pending/40s remain actual disabled locks. Missing-key API GET recovery is disabled and additionally guarded. Missing key at the gateway is uncertain rather than terminal, preserving any pending job. Key removal preserves local playback/download/remeasurement/diagnostics; reentry is allowed while pending but not while sending.


## User-selectable video settings and removed billing checkbox

Do not reintroduce the generation billing-consent checkbox or its blocking logic. Keep readable pricing, failure billing and data retention explanations. This removal does not affect the separate explicit acknowledgment before abandoning a potentially running job.

Validate videoSettings against the app allowlist: aspectRatio16:9/9:16 only; resolution360p/720p/1080p/4k. No2k/image-generation settings. Official video enum only documents16:9/9:16. Do not reintroduce1:1; the latest explicit user request withdrew the experimental option. Keep new-session defaults16:9/360p. Legacy versions from before settings metadata used16:9/720p; never relabel these as360p. Freeze settings on each job and retain on versions/recovery; extensions and explicit branches inherit their own parent settings even if different options are passed. Disable UI selectors during busy/pending and once a base exists. Explain same-settings continuation as this app's policy, not an unverified Google requirement. Preview request labels remain separate from metadata-measured width×height; show unknown when unavailable. High resolutions are upscaled and may take longer; POST timeout600s or900s for4k, no retry. All actual API acceptance and duration/size/continuity remain untested.


## Upload and fixed-prefix extension invariants

Selection only prepares the selected file on the Mac; Google upload/generation requires an explicit extend. Never send original full source to Google: upload the measured <=10s MP4 tail through Files, wait ACTIVE, then one InteractionsPOST. Initial uploaded route uses task:extend, VIDEO_0, omits aspect_ratio and previous ID. Further native routes use real previousInteractionId and PREVIOUS_VIDEO, no task. Match known Files URI plus exact text when recovering the uploaded first step; unknown URI stays uncertain. No automatic Files or paid POST retry. Keep keys only browser memory/fixedGoogleheaders, never localprocessingheaders/body/logs.

Track logical `.seconds` <=40 separately from measured `.modelSeconds`, `.actualSeconds`, `.rawActualSeconds`, and assembled `.wholeSeconds`. Desired initial/added duration is integer1..10, default10; API duration is max(3,desired). Clamp UI choices to the remaining logical capacity, minimum1; core enforces bounds. Retain rawBlob, modelBlob and full blob. Never reuse a pre-trim previous_interaction_id: requiresUpload versions and contexts that would exceed40 with API minimum3 must prepare the current whole Blob's <=10s tail via prepareContinuation and use a new uploaded route. Preserve original source metadata, settings, full original Blob and lineage; use each job's assemblySource for its actual prefix, never duplicate full content. Logical40 cap never resets on rebase. Subsequent extensions of rebased versions continue to use current tails. Explain upload regional/dialogue limitations conditionally, including text-generated clips that were shortened. Do not claim exact playback precision or billing by retained seconds.

Local trim/compose failures retain job/result plus downloadable inspection even after abandon; recheck only local, resume same-ID GET. Keep source format/audio/rotation settings; normalized presets are explicit. Original source never changes; temporary local copies are cleaned finally. prepareSource remains initial import200MiB/1200s; prepareContinuation supports current completed media400MiB/1240s only. Never publish the local processor or accept cross-origin/foreignHost/path-based media. UI removal of the requested connection notice does not turn unverified API behavior into verified records.

## Stable aspect ratios and retained dimension validation

The latest explicit user request supersedes experimental square support. Generation, native extension, upload and local processing accept16:9/9:16 only; no1:1 option, hint or square preview styling. Preserve duration1..10/default10, default360p, legacy720p, exact missing-key alert, lineage and recovery. Keep actual width/height validation for every output: only the implemented pixel rounding tolerance is allowed. Mismatched or unknown dimensions retain job/raw output as inspection with reason aspect and expectedAspectRatio/width/height. No successful version until validation passes. Preserve requested settings and measured saved/raw dimensions as separate UI fields. Never auto-retry API rejection, substitute another ratio, crop or stretch incompatible outputs. Do not access real credentials or run billable tests.


## Safe API error diagnostics

Use dist/api-errors.js for failed HTTP responses. Bound streamed body reads to16KiB/1500ms and cancel incomplete reads. Never retain/render/log provider prose, details, URLs, raw payloads or arbitrary symbolic fields. Only own data-property allowlisted codes/status/parameter paths may leave the decoder; core diagnostics independently reconstructs entries and caps them at20. Fixed Japanese messages only. Recovery/terminal rules depend on HTTP status+route+method, never provider body code. Unknown classifications stay unknown. HTTP400 alone does not identify quota or a bad duration. See docs/request-audit.md; no request-schema change was justified by the audit. No live API success was verified.


## Vercel publication authorization and boundary

The user explicitly requested Vercel publication with unko-omni in the URL after reporting local generation success. This supersedes the historical no-deployment status above. Preserve local runtime and tabs; deploy only tools/build-public.mjs exact allowlist output, never the checkout, tests, private media, diagnostics, .runtime or credentials. Public mode disables local media in both Studio preflight and UI, with a no-network local-media adapter. Do not use/read user keys or run billable tests. Public API acceptance remains unverified. See docs/publishing.md for intended target and security settings.


## Browser media candidate (2026-10-16)

User approved the browser processing engine and minimum WASM CSP change, testing a protected preview before any production promotion. tools/build-public.mjs now prepares runtime localMediaEnabled=true/browserMediaEnabled=true; the Mac dist/runtime remains true/false. dist/browser-media.js uses the pinned single-thread ffmpeg.wasm worker entirely in browser memory; generated vendor binary/source files are ignored and reproducible via tools/vendor-ffmpeg.mjs. Keep licenses/README.md tracked and publish all corresponding source archives beside the runtime. Limits: source60s/50MiB/720p; continuation90s/100MiB; composed output90s/100MiB; timeout240s. Ordinary native3..10 generation needs no WASM. Preflight self-tests and checks unsupported processing before POST, with a cancellation guard immediately before POST; no automatic generation retries. FFprobe wrapper -1 sentinel is accepted only with freshly recreated strict valid metadata and no error section. Never weaken validation or reuse stale JSON.

The source-only Vercel build uses tools/prepare-vercel.mjs (exact 19 text files), root VERCEL_BUILD_CONFIG, and tools/build-vercel.mjs to download official hash-pinned vendor inputs, then publish only public/. No Functions, new authentication, user-data server processing, or third-party runtime CDN. The protected preview is READY, but the production promotion attempt was rejected by automatic approval review because exact promotion approval was not established. Do not bypass that rejection through aliases, alternate deployment routes, or protection changes. Wait for explicit authorization to replace production with deployment dpl_HPQbLwNKSn259KjFtTB1c47MLTDz.
