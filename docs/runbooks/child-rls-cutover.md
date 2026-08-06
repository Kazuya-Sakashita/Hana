# children RLS cutover runbook

## 状態

ISSUE-180はcutover機構と合成検証だけを提供する。ADR-0016の実環境NO-GO条件がすべて完了し、人間が対象環境を承認するまでstaging/productionで`rls`を設定しない。

| mode             | DB接続               | 用途                                                       |
| ---------------- | -------------------- | ---------------------------------------------------------- |
| 未設定 / `route` | `DATABASE_URL`       | 既定。Routeの明示的`userId`条件で認可する                  |
| `rls`            | `CHILD_DATABASE_URL` | 承認済みcutover。Route条件に加えてrequest-scoped RLSを使う |

`CHILD_DATABASE_URL`を先に配置してもmodeは変わらない。`rls`でURL欠落、接続失敗、`session_user`、role属性、membership、初期GUCのいずれかが不一致なら500でfail closedにし、`route`へ自動fallbackしない。

## Cutover順序

1. dual-path appを`route`でdeployし、children CRUD smokeを行う。
2. 専用secretを配置する。URLやpasswordをlog、Issue、PRへ貼らない。
3. 非superuser schema ownerとcleanな`hana_child_runtime`をredacted read-only preflightで確認する。role/database設定、parameter ACL、全databaseの直接ACLを列挙し、対象DBへのgrant不可`CONNECT`以外が0件であることを含む。
4. 書込みを停止し、承認された1 migrationを適用する。
5. fresh connectionでruntime attestation、owner CRUD、foreign拒否、commit/rollback後のrole/GUCを確認する。
6. appは`route`のままrollback rehearsalを行い、Prisma履歴がcleanであることを確認する。
7. stagingだけ`rls`へ変更し、smokeとpool concurrencyを行う。
8. 証跡を人間が承認した後だけproductionを`rls`へ変更する。

実データやchild属性は証跡へ出さない。許可する証跡は固定check名、status、reason、migration名、SHA、件数だけである。

## 障害時

最初に`CHILD_OWNER_SCOPE_MODE=route`へ戻してappを再起動する。migrationが成功済みならDB objectを残してよい。`rollback.sql`を手動実行しても元migrationは`_prisma_migrations`でappliedのままであり、`prisma migrate deploy`は再適用しない。

DB object除去が必要な場合は、このrunbookだけで実行しない。新timestampのcompensating forward migration、復元用の別migration、対象main/head SHA、人間承認を用意してから`db:migrate:deploy`する。成功済みmigrationの履歴行を編集・削除せず、`prisma migrate resolve --rolled-back`を成功済みmigrationへ使わない。
