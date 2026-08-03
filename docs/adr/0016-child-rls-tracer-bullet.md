# 0016. children CRUDでrequest-scoped DB roleとRLSを検証する

- Status: accepted
- Date: 2026-08-03
- Deciders: kazuya

## Context

ADR-0007はMVPの認可をRoute Handlerへ集約し、RLSをPhase 2へ延期した。Routeの所有権条件が欠けた場合、privileged Prisma接続には別ユーザー行を止める二次防御がない。Phase 2を全面展開する前に、PIIを含みCRUDが独立している`children`で最小の実証が必要である。

### Threat model

対象は`GET/POST /v1/children`と`GET/PUT /v1/children/{childId}`である。

- Route実装から`user_id`条件が欠落しても、DBが別owner行の取得・更新・削除を拒否する
- callerが別ownerの`user_id`をINSERTしても、DBが拒否する
- transaction終了後にDB roleまたはrequest user IDがpool接続へ残らない
- 既存の403/404 API契約を維持し、氏名・生年月日などの列を判定用関数から返さない

対象外は、DB管理資格情報の侵害、migration operator、internal maintenance endpoint、および`children`を参照する他resourceの複合transactionである。対象外経路は従来どおりRoute層の所有権条件を必須とする。

## Decision

### Tracer bullet: GO

`children`の通常CRUD Routeだけを次の境界へ移す。

1. migrationで`hana_child_owner`を`NOLOGIN`、`NOINHERIT`、`NOBYPASSRLS`として作る
2. 接続roleには`SET ROLE`のためのmembershipだけを与える
3. `withChildOwnerScope(userId, operation)`が1 transaction内で`SET LOCAL ROLE hana_child_owner`とtransaction-local GUCを設定する
4. `children_owner_scope` policyが`user_id = hana_current_user_id()`を`USING`と`WITH CHECK`の両方で要求する
5. 通常CRUD Routeはprivileged `prisma`を直接importしない

`SET LOCAL ROLE`と`set_config(..., true)`はcommit/rollbackで解除される。user IDはSQL文字列へ連結せず、parameterとして渡す。

### 403 contract

RLSだけでは別owner行と存在しない行がどちらも見えない。既存OpenAPIの403契約を維持するため、`hana_child_access_status(uuid)`を限定的な`SECURITY DEFINER`関数として置く。

- 戻り値は`owned | foreign | missing`だけ
- active childの存在とowner一致だけを判定する
- child列、user ID、氏名、生年月日を返さない
- `PUBLIC`の実行権限を剥奪し、`hana_child_owner`だけへ付与する
- `search_path`を固定する

### Preflight and rollback

migrationは変更前に次をfail closedで検査する。

- owner profileが存在しない既存childがない
- `children`へRLSや既存policyが先行導入されていない
- 同名roleが存在しない（未知のgrantやmembershipを再利用しない）

forward migration全体をtransactionで囲み、途中の失敗時はrole、policy、関数、grantをまとめてrollbackする。既存の`PUBLIC` grantは変更せず、tracer用roleへ必要な権限だけを追加する。

rollbackは同migration directoryの`rollback.sql`を使う。先にアプリをISSUE-151以前へ戻し、その後policy、RLS、関数、grant、roleの順に外す。他のmembershipや依存objectが増えていれば`DROP ROLE`が失敗し、自動的に停止する。

## Rollout decision

### Synthetic/local: GO

PostgreSQL 16の合成`hana_ci`だけでmigrationを適用し、User AからUser BへのSELECT、UPDATE、DELETE、INSERT拒否とowner成功・rollbackを検証する。テストはloopback、DB名、明示opt-inを必須とし、接続文字列やrow内容を出力しない。

### Real environment and broad Phase 2: NO-GO until follow-ups

このIssueでは実環境へmigrationを適用しない。次の条件が揃うまでproduction rolloutはNO-GOとする。

1. runtime接続roleとmigration roleを別資格情報に分離する
2. home、memory、AIなど残る`children`参照をowner-scoped repositoryまたは複合resource RLSへ移す
3. `memories`と`images`の原子的transactionに対応する複数table policyを別Issueで設計する
4. stagingでredacted read-only preflight、1 migrationだけの承認、fresh connection postflightを行う
5. pooler経由でrole/GUCがrequest間に残らないconcurrency testを追加する

## Consequences

### Positive

- child CRUDではRouteの条件漏れに対するDB二次防御が成立する
- Prismaとtransaction poolを維持したまま段階展開できる
- normal user Routeと管理接続の責務がコードimportとCIで判別できる

### Negative

- transactionごとにroleとGUCを設定する往復が増える
- 403維持のため限定`SECURITY DEFINER`関数の監査が必要になる
- tracer外のRouteはまだprivileged Prisma接続を使い、Phase 2は未完了である

## Verification

- `tests/integration/db/issue-151-child-rls.test.ts`
- `tests/unit/server/db/child-owner-scope.test.ts`
- `tests/unit/qa/issue-151-environment.test.ts`
- `.github/workflows/typecheck.yml`

## References

- ADR-0007
- ISSUE-151 / GitHub #321
- `prisma/migrations/20260803031500_add_child_rls_tracer/`
