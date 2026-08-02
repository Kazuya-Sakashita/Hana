# 退会アカウント物理削除 Runbook

## 安全契約

- `purge_after`到達前のアカウントは処理しない。
- 削除順序はStorage（original / thumbnail / preview / 所有prefix内orphan）→ Auth → DB固定。
- Storage削除が1件でも失敗した実行ではAuthとDBを削除しない。
- `ACCOUNT_PHYSICAL_PURGE_APPLY=confirmed`がないcron requestはread-only inspectionへ固定する。
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

## 検証専用環境がない場合

実ユーザーを含む環境ではsmokeを実施しない。代わりに`pnpm qa:issue136:purge-db`を使い、
loopbackの合成Storage/Auth HTTP fixtureと専用PostgreSQL `/hana_ci`だけで実経路を確認する。
このコマンドは`ISSUE_136_PURGE_QA=1`の明示opt-inに加え、`DATABASE_URL`、`DIRECT_URL`、
`NEXT_PUBLIC_SUPABASE_URL`がすべてloopbackで、両DB URLが同一の`/hana_ci`を指す場合だけ動く。

確認する結果は、apply未設定で変更なし、Storage全object削除、AIログ匿名化、Auth削除、
DB削除、再実行0件である。生成した固定ID・合成文字列・4byteの合成objectだけを使い、
実ユーザー、実写真、実Storage、実Authには接続しない。この代替確認はproduction applyの許可ではない。

## production rollout

1. `ACCOUNT_PHYSICAL_PURGE_APPLY`を未設定のままmigrationとアプリをデプロイする。
2. cron requestがdry-run件数だけを返し、Storage・Auth・DBを変更しないことを確認する。
3. `eligibleAccounts`、`storageListingFailures`、`failedAccounts`の件数だけをPrivacy / Security / Operationsが確認する。
4. 別の人間承認後に限り`ACCOUNT_PHYSICAL_PURGE_APPLY=confirmed`を設定する。
5. 初回apply後に件数だけを再確認し、異常時は直ちにapply設定を解除する。

## 障害対応

- `purge_status=pending`: backoff後にcronが再試行する。
- `purge_status=failed`: 自動再試行上限。件数だけを監視通知し、原因の段階を固定値`state|storage|auth|database`で確認する。
- 再投入前に、期限、アクセス遮断、Storage削除状況を確認する。実ユーザーのIDやstorage keyをIssue、PR、ログへ貼らない。
- DB/Authを手作業で先に削除しない。
