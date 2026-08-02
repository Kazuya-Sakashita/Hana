# Maintenance schedule activation runbook

## 目的

画像maintenanceの定期workflowは、公開先とmachine認証が準備できるまでendpointを呼ばない。
HOLD中はworkflowを成功扱いで終了し、URL、secret、画像識別子を読み込まず、summaryにはHOLDだけを残す。

対象workflow:

- 未confirm画像cleanup
- confirm済み未紐付け画像cleanup
- 画像variant修復

## Activation contract

- repository Actions variable `HANA_MAINTENANCE_SCHEDULES_ENABLED` が厳密に`true`の場合だけscheduleからendpointを呼ぶ。
- 変数が未設定、空、`false`、その他の値の場合、scheduleはHOLDをsummaryへ記録して成功終了する。
- 手動実行は`operation=invoke`を明示選択した場合だけendpointを呼ぶ。既定の`hold`では呼ばない。
- schedule有効時または手動invoke時に`HANA_APP_URL`か`CRON_SECRET`が欠けていれば、request前にfail-closedで停止する。
- 各endpointのapply設定は別の安全境界である。schedule activationだけでapplyを有効にしない。

## ISSUE-105完了後の有効化

1. ISSUE-105がGOになるまではactivation variableを未設定または`false`に保つ。
2. GitHub Actions secretsへ`HANA_APP_URL`と`CRON_SECRET`が設定済みであることを、値を表示せず確認する。
3. 各apply設定を無効にしたまま、workflow dispatchで`invoke`を1つずつ実行する。
4. 応答は許可された件数だけを確認し、URL、画像ID、`storage_key`、provider messageを証跡へ残さない。
5. Privacy、Image Pipeline、Operationsの必要な承認後、repository Actions variableを`true`にする。
6. 各workflowの少なくとも2周期を確認し、失敗、想定外の対象件数、滞留があれば直ちにHOLDへ戻す。

## 停止

1. repository Actions variableを`false`にするか削除する。
2. 次のscheduleがHOLDのsuccess summaryだけを残し、endpointを呼んでいないことを確認する。
3. 緊急停止では各apply設定も無効へ戻す。secret値はIssue、ログ、summaryへ貼らない。
4. 原因調査後は手動dry-runから再開し、承認なしにscheduleを再有効化しない。

## 検証

`pnpm qa:issue148:maintenance-workflows`は、3 workflowについてschedule HOLD、明示manual invoke、設定欠落時のfail-closed、summaryの非機密性を構造化YAMLから検証する。
