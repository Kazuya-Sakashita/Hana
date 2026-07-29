# ADR-0014: アップロード確定時の実体検証とHEIC直接uploadの一時停止

- Status: Accepted
- Date: 2026-07-30
- Decision owners: Backend / Security / Privacy
- Related: ISSUE-124, ADR-0009

## Context

`POST /v1/uploads/confirm`がクライアント申告の寸法とfile sizeを保存すると、Storage実体の欠落、破損、形式偽装、資源上限超過をImageとして確定できる。特にSharpの標準プリビルドはHEIC metadataを読めても、環境によってHEVCの完全decodeを保証できない。

## Decision

- Storage実体を10秒期限、10 MiB上限付きstreamで取得する
- 拡張子、Storage MIME、magic bytesを照合する
- 静止画だけを完全decodeし、各辺10000 pxかつ総画素25 MP以下に制限する
- width、height、file_sizeは実体から算出する
- 旧クライアントの申告値は形式だけ検証し、確定値には使用しない
- 同一`storage_key`の準備処理はprocess内single-flightで集約し、別instance間はDB一意制約とP2002処理で収束させる
- HEIC元ファイルはクライアントのCanvasでJPEGへ再エンコードする
- HEICの直接signed uploadは、HEVC decoderを本番・CIで固定して合成fixtureを継続検証できるまで発行しない

## Consequences

- 現行UIはHEIC選択後にJPEGへ再エンコードしているため、利用者の写真選択フローは維持される
- APIから直接`image/heic`のsigned URLを要求するクライアントは422となる
- 既存Imageの`content_type: image/heic`は読み取り互換性のため維持する
- single-flightはprocess内限定であり、別instance間ではStorage取得と画像処理が重複し得る
- HEIC直接uploadを再開する場合は、decoder、完全decodeテスト、AVIFとのbrand/codec分離を別Issueで確認する
