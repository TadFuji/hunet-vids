# HTTP 400の送信形式監査

確認日：2026-10-15。対象は `c6e15c0` / appVersion `2026-10-15.9`。以下はコードと公開一次資料の読解であり、実APIでの疎通・生成成功の確認ではない。

## 観測できた範囲

共有された診断は初回3秒の2試行で、それぞれPOST 1回、GET 0回、HTTP 400、receivedBytesはnull。旧実装はエラー本文を破棄しており、過去の `error.code` / 対象フィールドは復元できない。receivedBytesは動画の受信量であり、エラー本文が空だった証拠ではない。HTTP 400の根本原因は未特定。

利用者の手動確認用に開かれたタブはv.9（タブID `584833002`）。この監査ではタブ・キーを操作せず、エージェントによる実API呼び出しや有料生成はしていない。タブを開いたことをAPI動作確認や修正完了とは扱わない。

## 初回3秒・横16:9・360pの送信形

`dist/core.js` の `requestBody` を `dist/google.js` がJSON化して `POST https://generativelanguage.googleapis.com/v1beta/interactions` に送る。認証は固定Google宛ての `x-goog-api-key` ヘッダー、Content-Typeはapplication/json。下記の文は説明用で、利用者の実プロンプトではない。

```json
{
  "model": "gemini-omni-1.1-flash",
  "input": [
    {
      "type": "text",
      "text": "Generate a video exactly 3 seconds long. 映像の内容：静かな風景。"
    }
  ],
  "store": true,
  "response_format": {
    "type": "video",
    "aspect_ratio": "16:9",
    "resolution": "360p",
    "duration": "3s",
    "delivery": "uri"
  }
}
```

初回には `previous_interaction_id`、`generation_config`、`task`を送らない。`stream`と`background`も省略する。希望1・2秒の場合もAPIには3秒を要求し、受信・検証後にローカルで短縮する。

| 経路 | 初回との差 |
| --- | --- |
| 生成動画の通常延長 | 同じ親から `previous_interaction_id` を設定。入力文は `PREVIOUS_VIDEO` タグを使い、追加秒数と予定合計を説明。画角・解像度は親を継承。taskは送らない。 |
| 持ち込み／短縮後の再アップロード延長 | Filesへ末尾10秒以下だけを送りACTIVE待ち後、video URI入力＋text入力を送る。`generation_config.video_config.task: "extend"` を設定。親IDと `response_format.aspect_ratio` は省略。入力文は `VIDEO_0` タグ。 |

延長のdurationも追加分の3〜10秒であり、動画全体の20／30／40秒を入れるものではない。今回の「初回・POSTで400」はFiles、親ID照合、動画メタデータ、ローカル短縮より前の経路であり、これら後段の失敗を示していない。

## 一次資料との照合

- [REST VideoResponseFormat](https://ai.google.dev/api/interactions-api#ResponseFormat)（確認時L5298–5363）はdurationをstring、画角を16:9／9:16、解像度を360p／720p／1080p／4k、deliveryをinline／uriと定義。[同APIの作成定義](https://ai.google.dev/api/interactions-api)にはモデル名、Content配列のinput、store boolean、任意のstream/backgroundもある（L200、231–255）。
- [Omni公式ガイド](https://ai.google.dev/gemini-api/docs/omni)のREST例と解像度表でも、このモデル・response_format・360pが確認できる。大きな出力にはURI返却を推奨。現在の形に明白な誤配置は見つからなかった。
- [公式スクリプトL111–135](https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-omni-flash-api/scripts/video/generate_video.py#L111-L135)は整数3〜10を検証して末尾sの文字列を返す。[L404–450](https://github.com/google-gemini/gemini-skills/blob/main/skills/gemini-omni-flash-api/scripts/video/generate_video.py#L404-L450)はその値をresponse_format.durationへ入れてSDKに渡す。
- [Python SDKのVideoResponseFormat](https://github.com/googleapis/python-genai/blob/main/google/genai/_gaos/types/interactions/videoresponseformat.py#L58-L112)はdurationをstrとして保持。フィールド別名や秒数への変換はなく、serializerは未指定/nullを省く。[create処理L422–461](https://github.com/googleapis/python-genai/blob/main/google/genai/_gaos/interactions.py#L422-L461)から[JSON body処理L47–69](https://github.com/googleapis/python-genai/blob/main/google/genai/_gaos/utils/requestbodies.py#L47-L69)、[marshal_json L265–282](https://github.com/googleapis/python-genai/blob/main/google/genai/_gaos/utils/serializers.py#L265-L282)へ進み、model_dump→json.dumpsする。読解上、`"3s"`はHTTPでも文字列のまま。

これらは公開仕様・公式コードとの整合であり、この利用者のプロジェクト／モデル配備先での受理を保証しない。

## Git上の変更点

- `93fe9db`以前：720p、16:9、URI返却、store:true、text配列入力。durationは送らず自然文で10秒を依頼。
- `93fe9db`：`response_format.duration: "10s"`を追加。モデル／input形式／store／deliveryは同じ。
- `962d538`：全モードの希望尺を1〜10秒へ拡張。初回とnative延長でもAPI durationを3〜10秒で選べるようにし、希望1・2秒のローカル短縮と安全な再アップロードを追加。durationフィールドの位置・string形式は変更していない。

duration導入前後の比較だけでは、今回の3秒400の原因がdurationだとは断定できない。

## 次の識別と変更方針

[公式エラー一覧](https://ai.google.dev/gemini-api/docs/api-errors)では400に `invalid_request`、`parameter_unknown`、`failed_precondition`（課金設定などの前提条件不足）がある。quota/rateの通常コードは429。400だけから「利用枠がない」「durationが不正」と決めない。

次の本人操作で得られる許可リスト化したエラーコードと、確認できた対象フィールドを使って切り分ける。自由文のエラー本文には入力が反映され得るため、プロンプト・キー・生レスポンスは診断へ出さない。原因未特定の段階でduration／resolution／store等を推測削除せず、有料POSTを自動再送しない。この監査は原因修正完了の報告ではない。
