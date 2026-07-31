# 未confirm画像cleanup runbook

## Safety contract

- signed URLの期限は2時間、cleanupの保持期間は発行から48時間
- DB予約とStorage objectの更新時刻がともに期限を超えた場合だけ候補
- `Image`行が存在するkeyは論理削除済みを含めて保護
- confirmとcleanupは同じPostgreSQL advisory lockで直列化
- 対象はoriginalと規定の`thumbnail`、`preview`だけ。未知形式は削除しない
- 日時欠落、不正、未来時刻、所有prefix不一致は安全側に停止
- 予約導入前のobjectはactive Profileから導出したprefixだけを列挙し、初回は予約登録だけを行う。さらに48時間後のcronで再検証して削除する
- legacy列挙はprofile、month offset、object offsetをDB cursorへ保存し、1回最大10 directory stepで次回へ継続する
- 退会受付またはアクセス遮断後のProfileは、cleanupのlock内再確認で必ず保護する

## Rollout

1. migrationをstagingへ適用する。
2. `UNCONFIRMED_IMAGE_CLEANUP_APPLY`を未設定のままcronを実行する。
3. responseの件数だけを確認する。識別子、key、URLを証跡に残さない。
4. 合成ユーザーで48時間超相当の予約とobjectを用意し、別のconfirm済み画像も用意する。
5. Privacy / Operations承認後、stagingだけで`UNCONFIRMED_IMAGE_CLEANUP_APPLY=confirmed`を設定する。
6. cronを実行し、未confirmの既知3 objectだけが404、confirm済み3 objectが存続することを確認する。
7. 再実行して`deleted: 0`を確認する。

## Failure recovery

- Storage失敗または削除後の残存は予約を保持し、指数backoffで再試行する。
- 10回失敗した予約は`failed`で停止する。keyをログへ出さず、DB管理画面の制限された操作で原因を調査する。
- 実データでの手動削除は禁止。退会済みuser prefixはaccount physical purgeの責務とする。

## Metrics

許可する値は`legacyScanned`, `legacyDiscovered`, `legacyInvalid`, `mode`, `scanned`, `eligible`, `protected`, `skippedRecent`, `invalid`, `deleted`, `retried`, `failed`の件数だけ。user ID、hash、prefix、storage key、filename、URL、provider messageを含めない。
