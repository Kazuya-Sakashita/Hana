# confirmed未紐付け画像 cleanup Runbook

## 目的

confirm後48時間を超えても記録へ紐付かなかった画像を、StorageとDBから安全に削除する。
運用結果には件数と固定reasonだけを残し、画像ID、URL、`storage_key`、画像内容は残さない。

## 実行モード

- `CONFIRMED_UNLINKED_CLEANUP_APPLY`が未設定または`confirmed`以外の場合はdry-runとする。
- `CONFIRMED_UNLINKED_CLEANUP_APPLY=confirmed`の場合だけapplyし、1回につき最大3件を処理する。
- endpointは30秒の実行上限に対して25秒の内部deadlineを持つ。次の1件に必要な22秒を
  確保できない場合は新しいclaimを開始せず、次回実行へ残す。
- endpointは`CRON_SECRET`のBearer認証に成功した場合だけ応答し、それ以外は404を返す。
- 定期workflowのHOLD・手動実行・再開は`maintenance-schedule-activation.md`に従う。
- productionまたはstagingでapplyを有効化する操作は、この実装PRの承認に含めない。

## 状態契約

| 状態          | 意味                                                             |
| ------------- | ---------------------------------------------------------------- |
| `pending`     | `confirmed_cleanup_next_at`以降にclaimできる                     |
| `claimed`     | claim tokenを持つworkerが処理中。10分を超えたclaimは再取得できる |
| `dead_letter` | 10回失敗。自動再試行を停止し、人が原因を確認する                 |

claimは短いDB transactionで確定し、この時点で`deleted_at`を設定して記録への再リンクと
新しいsigned URL発行を遮断する。Storageのoriginal・thumbnail・preview削除はtransaction外で行い、
claim tokenが一致する場合だけDB行を物理削除する。Storageまたはfinalizeの失敗時は別の短い
transactionでattemptを増やし、指数backoff後の`pending`または`dead_letter`へ遷移する。

backoffは2分から開始し、最大24時間とする。workerがclaim後に停止した場合は、10分のlease失効後に
別workerが`processing_timeout`としてattemptを増やし、旧tokenを解除してbackoffへ移す。
同じ停止が10回に達した場合はStorageへ触れず`dead_letter`へ移す。Storage削除は冪等に再試行できる
前提とする。

競合中の候補はtry-lockで待たずに飛ばし、`confirmed_cleanup_next_at`と`id`のkeysetで次ページへ
進む。cursor日時はDBとJavaScriptの精度差を避けるため`TIMESTAMPTZ(3)`へ固定し、既存の
マイクロ秒精度を持つ`created_at`はcursorに使わない。

DBへ保存できるfailure reasonは次の固定値だけとする。

- `storage_unavailable`
- `finalize_failed`
- `processing_timeout`
- `invalid_storage_key`

Storageへ書き込む処理とcleanupは、`upload-storage`、`image`の順で同じadvisory lockを取得する。
cleanupは同じstorage keyの先行writer完了後にclaimし、形式または所有者prefixが不正なkeyはStorageへ
渡さず`invalid_storage_key`でdead-letter化する。

endpointが返すfailure countも上記と`claim_failed`、`retry_state_unavailable`だけに限定する。
生の例外、Storageレスポンス、画像識別子は保存・返却しない。

## dead letterの復旧

1. `deadLetterTotal`と固定failure reason別の件数だけを確認する。
2. 実データをログやIssueへ出さず、権限を限定した管理環境でStorage・DB障害を確認する。
3. 一時障害の解消後、対象行だけを`pending`、attemptを0、next-attemptを現在時刻へ戻す。
4. dry-runで対象件数を確認し、applyを1回だけ実行する。
5. `deleted: 1`、`deadLetterTotal`減少、再実行時`eligibleTotal: 0`を確認する。

復旧SQLのproduction適用は別の人間承認を必要とし、本Runbookだけでは実行しない。

## migration適用とrollback

production/stagingへの適用は次の順序を人間が承認した場合だけ行う。

1. maintenance scheduleと`CONFIRMED_UNLINKED_CLEANUP_APPLY`をHOLDにする。
2. production相当の行数を持つ非production DBで、DDL所要時間、table lock待ち、candidate queryの
   `EXPLAIN (ANALYZE, BUFFERS)`を確認する。
3. 許容する`lock_timeout`とメンテナンス時間を決める。通常index作成やCHECK検証の書込停止が
   許容できない場合は、`NOT VALID`後の`VALIDATE CONSTRAINT`と`CREATE INDEX CONCURRENTLY`を
   transaction外の専用手順へ分離し、別レビューを受ける。
4. migrationを先に適用し、列、CHECK、indexが存在することを固定名だけで確認する。
5. appをdeployし、dry-runで件数と固定reasonだけを確認する。
6. 別のapply承認後に1回だけ実行し、再度dry-runでqueueの変化を確認してからscheduleを再開する。

rollbackは「schedule/applyをHOLD → 旧appへ戻す → 新列を参照するprocessがないことを確認 →
別のDB変更承認後にindex、constraint、列の順で戻す」とする。列を削除するとattempt、next-attempt、
dead-letter情報は失われるが、Storage object自体は復元されない。Storage削除開始後のrollbackは
DB rollbackだけで画像を復元できないため、apply前のHOLDを必須とする。

## 合成検証

専用PostgreSQL `/hana_ci`と合成Storageだけを使う。`pnpm qa:issue155:cleanup-db`は明示opt-inと
loopback接続を必須にし、同時worker、Storage失敗後のbackoff、lease失効、poison itemの
dead-letter隔離、先頭候補のlock競合を検証する。この検証はproduction/staging applyの承認ではない。
