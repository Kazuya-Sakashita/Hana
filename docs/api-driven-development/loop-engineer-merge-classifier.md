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
    "status": "pass",
    "reviewed_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "required_reviewers": 3,
    "completed_reviewers": 3,
    "actionable_findings": 0
  }
}
```

必須checkは`acceptance-criteria`、`unrelated-diff`、`merge-conflict`、`rollback-record`、
`pr-gate`。追加可能な固定checkは`openapi-contract`、`security`、`privacy`、`database`、
`ai-safety`、`image-pipeline`、`ui-accessibility`、`supply-chain`、`issue-registry`である。

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
merge conflict、review SHA不一致、review未完了、指摘残り、および各人間承認領域を含む。

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
