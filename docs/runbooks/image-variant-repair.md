# 画像 variant 自動修復 Runbook

## 目的

original・`thumbnail`・`preview` の状態を追跡し、派生画像が欠損した画像だけをoriginalから再生成する。
実行結果と運用証跡には件数だけを残し、画像 URL・`storage_key`・画像内容は残さない。

## 実行モード

- `IMAGE_VARIANT_REPAIR_APPLY` が未設定または `confirmed` 以外: dry-run。対象件数の確認だけを行う。
- `IMAGE_VARIANT_REPAIR_APPLY=confirmed`: apply。1回につき1件を修復する。
- エンドポイントは `CRON_SECRET` の Bearer 認証に成功した場合だけ応答し、それ以外は404を返す。
- `eligibleTotal` は実行時点の全対象件数、`deadLetterTotal` は停止中の全件数、`scanned` は今回処理する件数を表す。

claim は短いDBトランザクションで確定する。Storage処理がタイムアウトまたは失敗した場合も、
別の短いトランザクションで試行回数・次回時刻を保存する。Storage処理中は画像単位のロックを
保持し、同時に退会・記録削除が走った場合は直列化する。

## 状態

| 状態          | 意味                                                      |
| ------------- | --------------------------------------------------------- |
| `pending`     | 次回実行の対象。既存画像は最初に Storage の実在を確認する |
| `claimed`     | 修復処理中。10分を超えた claim は再取得できる             |
| `complete`    | thumbnail と preview の双方を確認済み                     |
| `dead_letter` | 10回失敗。自動再試行を停止し、人が原因を確認する          |

失敗時は指数バックオフし、最大24時間まで間隔を延ばす。保存する理由は固定値だけで、
Storage の生エラーや画像識別子は保存しない。

## dead letter の復旧

1. 監視結果の `deadLetter` 件数だけを確認する。
2. Storage 障害、original 欠損、original 不正のどれに該当するか、権限を限定した管理環境で確認する。
3. original 欠損・不正の場合は自動生成できないため、利用者向けの再アップロード導線を別途判断する。
4. 一時障害の解消後、対象行だけを `pending`、試行回数を0、次回時刻を現在時刻へ戻す。
5. dry-run で対象件数を確認してから apply し、再実行で `repaired: 0` になることを確認する。

## ステージング確認

実ユーザーデータが存在しない隔離ステージングだけで実施する。共有ステージングでは実施しない。
専用QAアカウントと専用の合成記録を作り、対象の合成画像1枚だけを操作する。画像ID、URL、
`storage_key`、画像内容はレビュー証跡へ貼らず、件数だけを記録する。

1. デプロイ環境で `IMAGE_VARIANT_REPAIR_APPLY` が未設定であることを確認する。
2. thumbnail だけを削除し、アルバム一覧を再読み込みする。サニタイズ済みoriginalのfallbackで合成画像が表示され、他の記録とページ全体が壊れないことを確認する。
3. apply を無効にして実行し、`eligibleTotal: 1`、`scanned: 1` とStorageが変更されないことを確認する。対象が0件または2件以上ならHOLDする。
4. 定期workflowを停止したことを確認する。apply を `confirmed` にして手動で一度だけ実行し、直ちにapplyを無効へ戻す。`repaired: 1`、thumbnailの復元、previewとoriginalの不変を確認する。
5. アルバム一覧と記録詳細を再読み込みし、修復後も同じ合成画像が表示されることを確認する。
6. 同じ処理を再実行し、`repaired: 0` であることを確認する。
7. 一時障害用の合成画像を1件だけ対象にし、定期workflow停止を維持したままdry-runで `eligibleTotal: 1` を再確認する。Storage接続を失敗させ、applyを `confirmed` にして手動で一度だけ実行し、直ちに無効へ戻す。`retried: 1` と次回時刻の延期を確認する。バックオフ後も同じgateを繰り返し、手動実行で回復したら直ちにapplyを無効へ戻す。
8. 未サニタイズまたはoriginal欠損・不正の合成データでは、一覧・詳細が例外にならずplaceholderを表示し、unsafeなoriginal URLを返さないことを確認する。
9. applyが無効であることを再確認し、定期workflowを再開する。作成した合成記録と派生画像を削除する。テスト前に削除したoriginalは先に復元する。
10. 最後にdry-runを実行し、`eligibleTotal: 0` かつ `deadLetterTotal: 0` で、テストデータ由来の対象が残らないことを確認する。

本番適用前には、Privacy と Image Pipeline の担当者が上記結果を確認し、その後に限りデプロイ環境へ
`IMAGE_VARIANT_REPAIR_APPLY=confirmed` を設定する。設定証跡にも件数以外の画像情報を残さない。
