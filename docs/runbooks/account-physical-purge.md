# 退会アカウント物理削除 Runbook

## 安全契約

- `purge_after`到達前のアカウントは処理しない。
- 削除順序はStorage（original / thumbnail / preview / 所有prefix内orphan）→ Auth → DB固定。
- Storage削除が1件でも失敗した実行ではAuthとDBを削除しない。
- 返却・ログは件数と固定状態だけにし、user id、storage key、画像URL、氏名、本文を出さない。
- `failedAccounts > 0`またはworkerの`failed > 0`は運用アラート対象とする。

## dry-run

本番・stagingとも、最初にdry-runを実行する。

```bash
curl --fail --silent \
  -H "Authorization: Bearer $CRON_SECRET" \
  "$APP_ORIGIN/internal/account-deletion-purges?dry_run=1"
```

出力は`eligibleAccounts`、`leasedAccounts`、`imageRows`、`dbExpectedObjects`、`listedStorageObjects`、`storageListingFailures`、`failedAccounts`の件数だけであることを確認する。`storageListingFailures`が0で、`listedStorageObjects`がStorage上の実削除候補数であることを確認する。

## staging smoke

実ユーザーデータを使わない。専用の合成テストアカウントと、識別可能な合成画像1枚だけを準備する。

1. 合成アカウントを退会受付済みにする。
2. staging DBの対象1件だけについて、管理手順で`purge_after`を過去へ変更する。
3. dry-runが`eligibleAccounts: 1`、`imageRows: 1`、`dbExpectedObjects: 3`、`listedStorageObjects: 3`、`storageListingFailures: 0`を返すことを確認する。
4. worker endpointを1回実行する。
5. original、thumbnail、previewがStorageに存在しないことを管理画面で確認する。
6. Auth user、Profile、子ども、記録、画像、退会requestが存在しないことを確認する。
7. 同じworkerを再実行し、エラーにならず`purged: 0`となることを確認する。

## 障害対応

- `purge_status=pending`: backoff後にcronが再試行する。
- `purge_status=failed`: 自動再試行上限。件数だけを監視通知し、原因の段階を固定値`state|storage|auth|database`で確認する。
- 再投入前に、期限、アクセス遮断、Storage削除状況を確認する。実ユーザーのIDやstorage keyをIssue、PR、ログへ貼らない。
- DB/Authを手作業で先に削除しない。
