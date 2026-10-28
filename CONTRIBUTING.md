# 貢献について

不具合報告、再現手順、文書の修正、テスト、コード改善を歓迎します。機能の範囲や安全境界は [README](README.md)、[AGENTS.md](AGENTS.md)、[公開構成と手順](docs/publishing.md) を基準にしてください。特に API キーの保存先と送信先、配信ヘッダー（Content-Security-Policy）、許可リスト方式の診断出力を変更する提案は、理由と影響を Issue または Pull Request に明記してください。

## Issue

通常の不具合には、操作手順、期待した結果、実際の結果、ブラウザ、OS、および「診断情報を保存」で出力した `omni-diagnostics.json`（内容を確認のうえ）を添えてください。公開 Issue に実 API キー、請求情報、個人情報、非公開の素材、実キーの写った画面写真を載せないでください。API キーの漏洩につながる内容は[非公開の脆弱性報告](SECURITY.md)を利用してください。

## Pull Request

1. Node.js 22 以降の環境を用意し、`node tools/vendor-ffmpeg.mjs` でピン留め済みの ffmpeg.wasm ランタイムを準備します。
2. 変更の目的と、利用者に見える動作の差を説明します。
3. `npm run check` および `npm test` を実行します。
4. 動作や画面を変えた場合は、README、AGENTS.md、利用ガイド（`docs/manual-content-20261016.json` と PDF）、テストの該当箇所を更新します。テストはモック通信を使い、実キーをコミットしないでください。
