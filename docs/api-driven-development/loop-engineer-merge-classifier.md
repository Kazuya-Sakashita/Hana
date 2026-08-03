# Loop Engineer マージ適格性分類契約

ISSUE-164の分類器は、PRを`AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`のいずれかへ
決定的に分類する。これは候補判定だけであり、自動マージを実行・予約しない。GitHub API、filesystem、
network、環境変数、child processへアクセスしない。

## 判定順

優先順位は`HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE`である。不明、欠落、未知値、未完了、
古いreview証跡はすべてfail-closedで`HOLD`にする。

1. schemaとallowlistを検証する
2. risk、check、reviewの欠落・重複・未知値を検証する
3. head SHAとreviewed SHAが同一か確認する
4. 必須checkとreview gateを確認する
5. 人間承認領域を確認する
6. すべて通過した場合だけ`AUTO_MERGE_ELIGIBLE`にする

## 入力schema

schema versionは`loop-engineer-merge-input/v1`。入力はUTF-8 JSON 1件、上限は64 KiBで、次の
status-only fieldだけを許可する。

```json
{
  "schema_version": "loop-engineer-merge-input/v1",
  "issue_id": "ISSUE-164",
  "pr_number": 343,
  "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "change_areas": ["docs", "tests"],
  "required_checks": [
    { "name": "acceptance-criteria", "status": "success" },
    { "name": "unrelated-diff", "status": "success" },
    { "name": "merge-conflict", "status": "success" },
    { "name": "rollback-record", "status": "success" },
    { "name": "pr-gate", "status": "success" }
  ],
  "review_gate": {
    "schema_version": "loop-engineer-review-gate/v1",
    "status": "pass",
    "reviewed_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "required_reviewers": 3,
    "completed_reviewers": 3,
    "actionable_findings": 0,
    "completed_roles": ["spec-acceptance", "implementation-correctness", "test-reliability"]
  }
}
```

必須checkは`acceptance-criteria`、`unrelated-diff`、`merge-conflict`、`rollback-record`、
`pr-gate`。領域ごとのcheckとreviewer roleは次の固定対応で追加必須にする。

- `auth` → `security` → `security-authorization`
- `ai` → `ai-safety` → `ai-safety-privacy`
- `privacy` → `privacy` → `privacy-data-protection`
- `database` / `migration-code` → `database` → `database-migration`
- `api` → `openapi-contract` → `api-contract`
- `ui` → `ui-accessibility` → `ui-accessibility`
- `image` / `storage` → `image-pipeline` → `image-pipeline-privacy`
- `ci` / `workflow` / `dependency` → `supply-chain` → `ci-supply-chain-operations`

人間承認領域にも同じ安全条件を先に適用する。実DB migrationはdatabase、実ユーザーデータは
privacy、secretはsecurity、breaking waiverはopenapi-contract、それ以外の管理・外部操作は
supply-chainのcheckとroleを必須にする。複数領域ではcheckとroleの和集合を取り、必要roleが7以上に
なれば`HOLD`にする。`issue-registry`は既知の追加checkとして許可するが、領域対応の代替にはならない。

review gateのschema versionは`loop-engineer-review-gate/v1`。全PRで
`spec-acceptance`、`implementation-correctness`、`test-reliability`を必須にし、上記の専門roleを
追加する。`completed_roles`は個人名や本文ではなく固定role IDだけを含む。

`status: pass`は、ISSUE-165の集約側が同じ`reviewed_sha`について、役割ごとに別のreviewerによる
独立したread-only reviewを完了し、timeout、schema違反、reviewer間の判断不一致、未解決findingが
ないと確認したversioned attestationを意味する。分類器は、必要role集合、人数、完了role集合が
完全一致する場合だけこのattestationを受理する。同じreviewerへ複数roleをまとめて人数を減らさない。

追加可能な固定checkは`openapi-contract`、`security`、`privacy`、`database`、`ai-safety`、
`image-pipeline`、`ui-accessibility`、`supply-chain`、`issue-registry`である。

低riskのchange areaは`docs`、`tests`、`ci`、`workflow`、`dependency`、`ui`、`api`、`auth`、
`ai`、`image`、`storage`、`privacy`、`database`、`migration-code`である。

人間承認にするchange areaは`real-db-migration`、`destructive-operation`、`real-user-data`、
`production-deploy`、`secret-change`、`vendor-change`、`breaking-waiver`、`force-push`、
`ruleset-change`、`repository-setting-change`、`token-permission-change`、`external-notification`、
`billing-change`である。

## 出力schema

schema versionは`loop-engineer-merge-classification/v1`。出力は固定fieldと固定reasonだけである。

```json
{
  "schema_version": "loop-engineer-merge-classification/v1",
  "decision": "AUTO_MERGE_ELIGIBLE",
  "reason": "all_required_evidence_passed",
  "issue_id": "ISSUE-164",
  "pr_number": 343,
  "head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}
```

入力全体を信頼できない場合は、識別子を`null`へredactした`HOLD`を返す。固定reasonには、
schema不正、未知・重複・不足、check pending/failure、acceptance未完了、unrelated diff、
merge conflict、review SHA不一致、review role不一致、review未完了、指摘残り、および各人間承認領域を
含む。

## プライバシー境界

PR本文、コメント本文、review本文、実ユーザーデータ、氏名、メール、画像URL、storage key、prompt、
AI生成本文、secret、vendor設定値は入力、出力、artifact、logに含めない。unknown fieldは値を保持せず
`HOLD`にする。CLIは例外や不正なstdin本文をstderrへ出さない。

## CLI

1件を分類する。

```bash
printf '%s' '<status-only-json>' | pnpm loop-engineer:classify
```

repository contractを検証する。組み込みfixtureだけを使い、外部状態を読み書きしない。

```bash
pnpm qa:issue164:merge-classifier -- --mode=contract
```
