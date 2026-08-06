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

`children`の通常CRUD Routeだけを、default-offの二経路dispatcherへ移す。

1. `withChildPersistence()`が全children CRUDを受け、RouteはDB clientを直接importしない
2. `CHILD_OWNER_SCOPE_MODE`の未設定または`route`は、既存の`DATABASE_URL`と明示的`userId`条件を使う
3. `rls`だけが専用`CHILD_DATABASE_URL`と`withChildOwnerScope()`を使い、設定やattestation失敗時に`route`へfallbackしない
4. migrationで`hana_child_owner`を`NOLOGIN`、`NOINHERIT`、`NOBYPASSRLS`として作る
5. 非superuserの`hana_child_runtime`には`SET ROLE`のためのmembershipだけを明示option付きで与える
6. 既存table ownerがmigrationと限定`SECURITY DEFINER`関数を所有し、通常runtimeの資格情報から分離する
7. `withChildOwnerScope(userId, operation)`はtransaction内で実際の`session_user`、role属性、membership、初期GUCを検証してから`SET LOCAL ROLE`とtransaction-local GUCを設定する
8. `children_owner_scope` policyが`user_id = hana_current_user_id()`を`USING`と`WITH CHECK`の両方で要求する

`SET LOCAL ROLE`と`set_config(..., true)`はcommit/rollbackで解除される。user IDはSQL文字列へ連結せず、parameterとして渡す。

### 403 contract

RLSだけでは別owner行と存在しない行がどちらも見えない。既存OpenAPIの403契約を維持するため、`hana_child_access_status(uuid)`を限定的な`SECURITY DEFINER`関数として置く。

foreign 403とmissing 404の区別は公開済み契約であり、IDを知るcallerには存在状態の差を示す。このtracerでは契約を変更しない。404へ統一する場合は別IssueでOpenAPIを先に変更し、関数削除を含めて再設計する。

- 戻り値は`owned | foreign | missing`だけ
- active childの存在とowner一致だけを判定する
- child列、user ID、氏名、生年月日を返さない
- `PUBLIC`の実行権限を剥奪し、`hana_child_owner`だけへ付与する
- `search_path`を固定する
- ownerは既存table ownerのまま変更しない。実環境ではSupabaseの非superuser `postgres`を想定し、`BYPASSRLS`は`FORCE RLS`下でforeign判定するために必要だが、通常runtimeの資格情報からは分離する

### Preflight and rollback

migrationは変更前に次をfail closedで検査する。

- 実行roleが非superuserで、`children`と`profiles`の既存ownerであり、`CREATEROLE`、`BYPASSRLS`、`public` schemaの`USAGE, CREATE`を持つ
- `hana_child_runtime`が`NOINHERIT`、`NOBYPASSRLS`のlogin roleで、先行membershipを持たない
- `hana_child_runtime`がrole-level / database固有設定、runtime・PUBLIC・request ownerへ有効なparameter ACL、application object ownership、許可外database ACL、`public`内の直接ACL、default ACL、policy targetを持たない。database直接ACLは対象DBへのgrant不可`CONNECT`だけを許可し、他DBへの直接ACLは拒否する
- owner profileが存在しない既存childがない
- `children`へRLSや既存policyが先行導入されていない
- 同名roleまたは関数が存在しない（未知のgrantやmembershipを再利用しない）

forward migration全体をtransactionで囲み、lock/statement timeoutと対象tableの書込みlockを設定する。途中の失敗時はrole、policy、関数、grantをまとめてrollbackする。既存の`PUBLIC` grantは変更せず、tracer用roleへ必要な権限だけを追加する。

既存DBでは、`children`と`profiles`を所有する既存の`postgres`接続で同じmigrationを実行する。hosted Supabaseの`postgres`はsuperuserではないため、合成DBもcluster adminとは別の非superuser `postgres`をschema ownerとして作る。owner移管や一時grantは行わない。orphan検査を含む全preflightを最初の変更より前に実行し、合成upgrade testは失敗時にowner、ACL、RLS、role、関数がすべて不変であることを比較する。

通常のapp rollbackは`CHILD_OWNER_SCOPE_MODE=route`へ戻し、DB migrationは適用済みのまま保つ。成功済みmigrationへ`rollback.sql`を実行しても`_prisma_migrations`はappliedのままで、`prisma migrate deploy`は同じmigrationを再適用しない。DB object除去が必要な実環境rollbackは、新timestampのcompensating forward migrationを別承認で作る。合成DBではこのno-opと履歴不変を明示してから、監査対象SQLの可逆性だけをraw rollback/reapplyで検証する。

## Rollout decision

### Synthetic/local: GO

PostgreSQL 16の合成`hana_ci`だけでmigrationを適用し、User AからUser BへのSELECT、UPDATE、DELETE、INSERT拒否とowner成功・rollbackを検証する。テストはloopback、DB名、明示opt-inを必須とし、接続文字列やrow内容を出力しない。

### Real environment and broad Phase 2: NO-GO until follow-ups

このIssueでは実環境へmigrationを適用しない。次の条件が揃うまでproduction rolloutはNO-GOとする。

1. default `route`のdual-path appを先にdeployし、`hana_child_runtime`の資格情報をstaging/production Secret Managerへ登録して通常の`DATABASE_URL`と分ける。URLだけではcutoverしない
2. stagingのmigration接続が非superuserであり、既存`children`/`profiles`のowner、`CREATEROLE`、`BYPASSRLS`、schema権限を持つことをredacted read-only確認する
3. home、memory、AIなど残る`children`参照をowner-scoped repositoryまたは複合resource RLSへ移す
4. `memories`と`images`の原子的transactionに対応する複数table policyを別Issueで設計する
5. stagingで1 migrationだけの承認、fresh connection postflight、Prisma履歴を含むapp rollback rehearsalを行う
6. pooler経由でrole/GUCがrequest間に残らないconcurrency testを追加する

全条件を満たした後だけstagingで`CHILD_OWNER_SCOPE_MODE=rls`を設定する。smokeとconcurrency確認後もproduction cutoverは人間承認を必須とする。詳細は`docs/runbooks/child-rls-cutover.md`を正とする。

## Consequences

### Positive

- child CRUDではRouteの条件漏れに対するDB二次防御が成立する
- Prismaとtransaction poolを維持したまま段階展開できる
- normal user Routeと管理接続の責務がコードimportとCIで判別できる
- CIではcluster admin、非superuser schema owner、child runtime、request owner scopeを別roleとして実行し、migrationのsuperuser依存と通常経路の特権混入を検出できる

### Negative

- transactionごとにroleとGUCを設定する往復が増える
- 403維持のため限定`SECURITY DEFINER`関数の監査が必要になる
- tracer外のRouteはまだprivileged Prisma接続を使い、Phase 2は未完了である

## Verification

- `tests/integration/db/issue-151-child-rls.test.ts`
- `tests/unit/server/db/child-owner-scope.test.ts`
- `tests/unit/server/db/child-persistence.test.ts`
- `tests/unit/qa/issue-151-environment.test.ts`
- `.github/workflows/typecheck.yml`
- `prisma/migrations/20260803031500_add_child_rls_tracer/migration.sql`
- `prisma/migrations/20260803031500_add_child_rls_tracer/rollback.sql`
- `docs/runbooks/child-rls-cutover.md`

## References

- ADR-0007
- ISSUE-151 / GitHub #321
- `prisma/migrations/20260803031500_add_child_rls_tracer/`
- [Supabase: Roles, superuser access and unsupported operations](https://supabase.com/docs/guides/database/postgres/roles-superuser)
- [PostgreSQL 16: ALTER TABLE](https://www.postgresql.org/docs/16/sql-altertable.html)
- [PostgreSQL 17: Row Security Policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
