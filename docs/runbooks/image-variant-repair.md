# 画像 variant 自動修復 Runbook

## 目的

original・`thumbnail`・`preview` の状態を追跡し、派生画像が欠損した画像だけをoriginalから再生成する。
実行結果と運用証跡には件数だけを残し、画像 URL・`storage_key`・画像内容は残さない。

## 実行モード

- 定期workflowのHOLD・手動実行・再開は`maintenance-schedule-activation.md`に従う。
- `IMAGE_VARIANT_REPAIR_APPLY` が未設定または `confirmed` 以外: dry-run。対象件数の確認だけを行う。
- `IMAGE_VARIANT_REPAIR_APPLY=confirmed`: apply。1回につき1件を修復する。
- エンドポイントは `CRON_SECRET` の Bearer 認証に成功した場合だけ応答し、それ以外は404を返す。
- `eligibleTotal` は実行時点の全対象件数、`deadLetterTotal` は停止中の全件数、`scanned` は今回処理する件数を表す。

claim は短いDBトランザクションで確定する。Storage処理がタイムアウトまたは失敗した場合も、
別の短いトランザクションで試行回数・次回時刻と、その時点で確認できたvariant状態を保存する。
Storage処理中はupload confirmと同じstorage-key lockを先に取得してから画像単位のロックを保持し、
同じoriginalの置換・variant生成、退会・記録削除を直列化する。upload reservationが残る画像と
未サニタイズ画像はStorageへ触れず、次回へ延期する。

## 状態

| 状態          | 意味                                                      |
| ------------- | --------------------------------------------------------- |
| `pending`     | 次回実行の対象。既存画像は最初に Storage の実在を確認する |
| `claimed`     | 修復処理中。10分を超えた claim は再取得できる             |
| `complete`    | thumbnail と preview の双方を確認済み。24時間後に再検証   |
| `dead_letter` | 10回失敗。自動再試行を停止し、人が原因を確認する          |

失敗時は指数バックオフし、最大24時間まで間隔を延ばす。`complete`も24時間ごとにStorage上の
実在を再検証するため、後から削除されたvariantを自動検出できる。保存する理由は固定値だけで、
Storage の生エラーや画像識別子は保存しない。original fallbackは、メタデータのサニタイズ済みかつ
`original_variant_status=ready`の場合だけ許可し、欠損・不正・未確認originalは配信しない。

定期workflowは毎時1件を処理するため、24時間は再検証可能になる最短時刻であり、滞留件数によって
実際の再検証は遅れる。`eligibleTotal`が24件以上の状態で24時間継続した場合は運用をHOLDし、
実行頻度または安全なbatch数の拡張を別途判断する。

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

検証専用プロジェクトがない間は、下記3〜6の事前確認をローカルの合成Storage HTTP fixtureと専用PostgreSQL `/hana_ci`で代替する。`pnpm qa:issue142:storage-db`は明示opt-inに加え、DB・DIRECT DB・Storageの全接続先がloopbackであり、DB名が`hana_ci`の場合だけ動く。dry-run、欠損thumbnailだけの修復、originalと既存previewの不変、再実行対象0件を確認し、実ユーザー、実写真、実Storageは使用しない。この代替確認は本番applyの許可ではなく、デプロイ先が用意された後もapply有効化前にdry-run件数を確認する。

1. デプロイ環境で `IMAGE_VARIANT_REPAIR_APPLY` が未設定であることを確認する。
2. `complete`かつ次回確認時刻を現在以前にした合成画像でthumbnailだけを削除し、アルバム一覧を再読み込みする。サニタイズ済みかつ`ready`なoriginalのfallbackで合成画像が表示され、他の記録とページ全体が壊れないことを確認する。
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
