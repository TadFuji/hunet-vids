# 調査メモ：Google Vids と Gemini API（2026-10-13 時点）

## 1. Google Vids の透かし（右下の Gemini マーク）について

結論：**Google の公式文書に、Vids の目に見える透かしを消す方法は見つかりませんでした。**

- Google の公式文書が説明しているのは、AI 生成クリップに入る「目に見えない」透かし（SynthID）と、作成情報のメタデータ（Content Credentials）だけです。
  - https://support.google.com/docs/answer/16143507 （Vids のクリップ生成ヘルプ）
  - https://support.google.com/drive/answer/17560328 （Content Credentials の確認方法）
  - https://blog.google/products-and-platforms/products/workspace/gemini-omni-in-google-vids/
- 右下の「✦」マークについて書いているのは、第三者の情報だけです。それらによると、マークは **AI で生成した動画クリップにだけ** 付き、アップロードした動画・ストック素材・画面録画には付きません（Google による裏付けはありません）。
  - https://github.com/useapi/google-vids-api
  - https://erasio.io/google-vids-watermark-remover （透かし除去ツールの販売元なので、利害関係があります）
- Gemini アプリと Flow には「目に見える透かし」をオフにする設定が 2026 年 8 月に追加されました。ただし Gemini アプリのヘルプには「他の Google 製品の AI 機能には適用されない」とあり、Vids は対象に含まれていません。
  - https://support.google.com/gemini/answer/17405358
  - https://support.google.com/flow/answer/16353333
- 確認できていない回避策（いずれも推測）：
  1. Vids では AI 生成クリップを使わず、アップロード素材と録画だけで作る。
  2. Flow や Gemini アプリで透かしをオフにして生成した動画を、Vids にアップロードする。

hunet vids（旧名 my-vids）は Gemini API を直接呼び出します。API で生成した動画・画像・音楽に入るのは、目に見えない SynthID だけです。公式文書に目に見える透かしの記載はありません（https://ai.google.dev/gemini-api/docs/omni の「All generated videos include SynthID watermarking」）。

## 2. Google Vids の機能と hunet vids の対応

| Google Vids の機能 | hunet vids | 補足 |
|---|---|---|
| Help me create（指示文から絵コンテ） | ○ | 参考資料（文章・テキストファイル）も使えます |
| 16:9 / 9:16 / 1:1 | ○ | あとから変更できます |
| AI 動画クリップ（Veo → Gemini Omni、3〜10 秒、720p/1080p、音声つき） | ○ | `gemini-omni-1.1-flash`。画像を動かす（最初のコマ指定）にも対応 |
| AI 画像生成・編集（Nano Banana） | ○ | 指示による画像編集（背景を消す等）も可能 |
| AI ナレーション（多言語、話し方の指示） | ○ | 30 種の声、話し方の指示、文章の AI 書き換え |
| AI 音楽（Lyria） | ○ | 30 秒ループ／2〜3 分の曲 |
| 自動字幕（スタイル指定） | ○ | ナレーションから自動作成。SRT で保存可能（Vids は英語の音声のみ） |
| シーン・テキスト・トランジション・タイムライン | ○ | テキストはプレビュー上でドラッグ移動 |
| 録画（カメラ・画面・両方）＋プロンプター | ○ | |
| 素材のアップロード（画像・動画・音声） | ○ | |
| MP4 書き出し | ○ | 1080p まで、24/30/60fps。透かしなし。ブラウザ内で処理 |
| AI アバター（人物が台本を話す） | △ | Omni の動画生成でセリフを指定すれば近いことができます。専用のアバター機能はありません |
| Google スライドからの変換 | × | 未対応 |
| ストック素材ライブラリ（Getty 等） | × | 利用できる API がないため未対応。AI 生成で代替 |
| 共同編集・コメント・Drive 共有・YouTube 直接公開 | × | 各自のブラウザ内で完結する設計のため未対応 |
| GIF 書き出し | × | 未対応 |

Vids にない hunet vids の利点：透かしなし、BGM の自動音量調整（ナレーション中に下げる）、背景のズーム・パン、字幕の SRT 保存、費用の目安表示、元に戻す／やり直す、API キーさえあれば誰でも使える。

## 3. Gemini API（2026-10-13 時点）

主な呼び出し方式は Interactions API（`POST /v1beta/interactions`）です。

| 用途 | モデル | 無料枠 | 目安の価格 |
|---|---|---|---|
| 台本（JSON） | `gemini-3.8-flash` | あり | 1M トークンあたり 入力 $0.75 / 出力 $3.75 |
| ナレーション | `gemini-3.8-flash-tts` | あり | |
| 画像 | `gemini-nano-banana-2.1` | なし | 1 枚 約 $0.034（1K） |
| 動画 | `gemini-omni-1.1-flash` | なし | 720p で 1 秒 約 $0.10 |
| 音楽 | `lyria-3-clip-preview`（30 秒）／`lyria-3.5`（曲） | なし | 1 曲 $0.04 / $0.08 |

- Veo（`veo-3.1-*`）は 2026-10-22 に提供終了、Imagen 4 は 2026-08-17 に提供終了。hunet vids では使っていません。
- 出典：https://ai.google.dev/gemini-api/docs/changelog 、https://ai.google.dev/gemini-api/docs/deprecations 、https://ai.google.dev/gemini-api/docs/pricing 、https://ai.google.dev/api/interactions
- ブラウザから直接呼べること（CORS）は、事前確認リクエストで確認済みです（キーなしでの確認）。
