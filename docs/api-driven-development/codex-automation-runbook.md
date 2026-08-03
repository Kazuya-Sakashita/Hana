# Codex 自動開発 Runbook

この文書は、Codex が Hana の Issue を自動で進めるときの運用手順を定義する。

目的は無条件の自動mergeではない。PRの最新commit SHAに対する複数の独立reviewとCIを使い、
`AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`を安全側に判定することである。

本契約はADR-0017を正とする。ISSUE-164〜ISSUE-166の実装とISSUE-167のdry-run後に人間が
有効化を承認するまでは、すべてのmergeを`HUMAN_REQUIRED`として扱う。

---

## 1. 基本方針

- 1 Issue 1 branch 1 PR を守る。
- メイン Codex は **Issue Captain** として、スコープ、実装、検証、PR 記録を統合する。
- サブエージェントは短命のread-only専門reviewerとして使い、実装、staging、commit、push、PR変更、merge、実環境アクセスを行わせない。
- code-onlyのprivacy / security / DB migration / AI変更は追加review対象とし、実環境操作、secret、vendor、release判断は人間承認で止める。
- 判定の優先順位は`HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE`とし、不明は`HOLD`にする。
- rollback できるように、Issue / PR / Git の 3 層に記録を残す。
- Codexのapproval policyやsandboxとGitHubのmerge適格性を分離し、前者を弱めない。

---

## 2. 3状態の境界

| 状態                  | 条件                                                                    | 次の動作                                  |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `AUTO_MERGE_ELIGIBLE` | 最新SHAの全reviewとCIが合格し、actionable finding 0件で、外部影響がない | 有効化後にnative auto-merge予約だけを許可 |
| `HUMAN_REQUIRED`      | 証跡は揃っているが、実環境、不可逆性、管理権限、外部契約の判断が必要    | 限定scopeの人間承認まで停止               |
| `HOLD`                | 指摘、矛盾、stale SHA、情報不足、検証不能、未知riskがある               | 人間承認で上書きせず、修正または証跡追加  |

code-onlyで候補になり得る範囲:

- docs / tests / low-risk CI / low-risk UI /通常bug fix
- OpenAPI-first、契約検証、rollbackが揃ったAPI変更
- 合成データだけで検証し、必要な追加専門reviewが揃ったAuth、AI、Privacy、Image、DB migrationコード

`HUMAN_REQUIRED`で止める操作:

- 実DB migration、backfill、repair、purge、実データの削除・復元・匿名化
- 実ユーザーデータ、実画像、画像URL、storage key、prompt、生成本文を使う検証
- production deploy、公開、release、traffic切替、canary開始
- secret、AI vendor、外部service、GitHub Ruleset、repository setting、token権限の変更
- OpenAPI breaking waiver、force push、履歴改変、branch削除、DB reset
- 課金、外部送信、第三者への通知

`HOLD`へ送る条件:

- acceptance criteria未完了、unrelated diff、merge conflict、必須CI未完了または失敗
- review SHA不一致、追加commit後のstale review、reviewer不足、timeout、schema違反
- actionable finding、判断不一致、未知の変更領域、risk分類不足、rollback不足
- PII、secret、画像情報、prompt、生成本文の露出疑い
- required check、Ruleset、sandboxのbypassが必要

---

## 3. Issue Start Gate

着手前に Issue Captain は以下を確認する。

1. `git status --short --branch`
2. target Issue の目的、スコープ、Out of Scope、受け入れ条件
3. PRD の該当章
4. API 影響がある場合は `docs/openapi/openapi.yaml`
5. 既存の unrelated diff が混入しないこと

開始時に 3〜10 行で宣言する:

- この Issue の目的
- 変更する領域
- 影響しうる領域
- OpenAPI 変更の有無
- 検証コマンド
- 人間レビューが必要な理由があればその理由

---

## 4. 独立reviewer運用

全PRで最低3名を必須にする。

| 必須role                     | 確認範囲                                   |
| ---------------------------- | ------------------------------------------ |
| Spec / Acceptance            | Issue、PRD、ADR、受け入れ条件、scope creep |
| Implementation / Correctness | 実装、エラー経路、認可、安全性、保守性     |
| Test / Reliability           | 回帰、失敗時、rollback、CI、競合、再実行   |

変更領域に応じて次を追加し、合計4〜6名にする。

| 変更領域                                | 追加role                       |
| --------------------------------------- | ------------------------------ |
| Auth / ownership / account deletion     | Security / Authorization       |
| AI / consent / prompt / output          | AI Safety / Privacy            |
| DB / migration / RLS / query            | Database / Migration           |
| API / OpenAPI                           | API / Contract                 |
| UI / copy / interaction                 | UI / Accessibility             |
| Image / Storage / cleanup               | Image Pipeline / Privacy       |
| CI / workflow / dependency / operations | CI / Supply-chain / Operations |

並列枠が足りなければwave実行する。初回reviewerには同じIssue仕様、merge-base、最新head SHA、diffを
渡し、他reviewerのprompt、finding、結論を見せない。reviewerはread-only・独立コンテキストとする。

```text
Do not edit files, commit, push, change the PR, merge, or access real environments.
Review the supplied merge-base...head SHA and return actionable findings with severity,
evidence, file/line, required fix, and reviewed SHA. Return GO only when findings are zero.
```

必要roleを確保できない場合、出力schemaが不正な場合、timeoutした場合は成功扱いせず`HOLD`にする。

---

## 5. Implementation Loop

API 変更あり:

1. `docs/openapi/openapi.yaml` を先に更新する
2. `pnpm openapi:lint`
3. `pnpm openapi:gen`
4. 生成差分を確認する
5. Route Handler / feature logic / tests を実装する

API 変更なし:

1. target Issue に関係するファイルだけ読む
2. 最小の complete slice で実装する
3. 対象 test を追加・更新する

禁止:

- `src/lib/api/generated/` の手編集
- unrelated refactor
- unrelated issue のついで修正
- PII を含む fixture / log / PR 記録

---

## 6. Verification Gate

通常の PR-ready 判定:

```bash
pnpm pr:gate
```

`pnpm pr:gate` が未導入の branch では、暫定 fallback として以下を実行する。
ISSUE-034 merge 後は `pnpm pr:gate` を正規ゲートにする。

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

API 変更時:

```bash
pnpm openapi:lint
pnpm openapi:gen
```

必要に応じて追加:

- UI 変更: mobile / keyboard / reduced motion / screenshot 確認
- DB 変更: migration / rollback 方針確認
- AI 変更: prompt regression / PII leakage 確認
- image 変更: public URL / storage_key / cache / deletion 確認

---

## 7. PR 記録

PR には以下を残す。

### Issue Brief

- Issue ID / title
- Why
- Scope
- Out of Scope
- Acceptance Criteria

### Change Ledger

- OpenAPI changed: yes/no
- Generated types changed: yes/no
- DB migration: yes/no
- Env change: yes/no
- User-facing change: yes/no

### Validation Ledger

- 実行コマンド
- 結果
- 失敗した場合の要約
- 未実施なら理由

### Privacy Ledger

- PII log: checked / not applicable
- image URL / storage_key exposure: checked / not applicable
- AI prompt / generated text storage: checked / not applicable
- auth / ownership: checked / not applicable

### PR Draft

- Title: `[ISSUE-XXX] <要約>`
- Body: Issue Brief / Change Ledger / Validation Ledger / Privacy Ledger / Rollback Record を含める
- Link: `Closes #<GitHub issue number>`
- State: 自動作成時は Draft PR から始める
- Review loop: 必要role全員の独立reviewを最新SHA単位で最大3巡行う
- Review evidence: reviewed SHA、role、round、result、actionable finding件数だけを記録する
- Merge note: merge / release / deploy に人間承認が必要な場合は明記する

### Rollback Record

```text
Rollback: revert PR <number> / commit <sha>
Data impact: none | migration | storage | unknown
User impact:
Recovery steps:
Verification after rollback:
```

---

## 8. AUTO_MERGE_ELIGIBLE条件

`AUTO_MERGE_ELIGIBLE`はコードmerge候補であり、production releaseや実環境操作の承認ではない。

次をすべて同じ最新head SHAで満たす。

- すべてのacceptance criteriaが完了し、unrelated diffとmerge conflictがない
- `pnpm pr:gate`と変更領域固有checkが成功している
- API変更時のOpenAPI lint / gen / breaking判定が同期している
- 最低3名、最大6名の必要reviewが全件GOで、actionable findingが0件である
- reviewer間の判断不一致、timeout、schema違反がない
- rollback recordと回復後のverificationがPRにある
- PII、secret、画像情報、prompt、生成本文をdiff、log、review証跡へ追加していない
- `HUMAN_REQUIRED`または`HOLD`条件に該当しない

追加commitが作られたら旧reviewと判定をすべて無効化し、新SHAで再実行する。

## 9. Review loop

1巡は1つのhead SHAに対して必要reviewer全員が完了する単位とする。Issue Captainは重複findingを
統合できるが、少数意見を削除したり多数決でGOにしたりしてはならない。

修正commit後はfresh contextで全必要reviewをやり直す。3巡目終了時にactionable finding、
判断不一致、情報不足、検証不能、reviewer不足が残れば`HOLD`にする。

---

## 10. Stop / Block Rules

Codex は以下で止まる。

- 同じ失敗が 3 回続いた
- Issue のスコープを超える変更が必要
- OpenAPI と実装のどちらが正か不明
- PII / secret / child photo / storage_key の露出疑い
- destructive operation が必要
- 実DB、実ユーザーデータ、production deploy、secret/vendor設定への操作が必要
- DB reset / force push / Ruleset変更などの人間承認が必要
- auto-merge有効化前、または判定が`HUMAN_REQUIRED`か`HOLD`

止まったら Issue を `blocked` にするか、PR に missing decision を明記する。

## 11. Safety baselineと段階有効化

- `approval_policy="never"`、Full Access、CI bypassを採用しない。
- 推奨baselineは`approval_policy="on-request"`、`approvals_reviewer="auto_review"`、
  `sandbox_mode="workspace-write"`とし、networkは必要時だけ限定承認する。
- 1 Issue / 1 PR、OpenAPI-first、生成物の直接編集禁止、PII非保存を維持する。
- 証跡はIssue ID、PR番号、head SHA、変更領域、review role、round、件数、CI status、判定reasonだけにする。
- PR本文、コメント本文、prompt全文、実ユーザー情報、画像、生成本文、secretをartifactへ保存しない。

有効化順はISSUE-164の判定、ISSUE-165のreview gate、ISSUE-166のRuleset、ISSUE-167のdry-runである。
ISSUE-167で誤許可0件を確認し、人間がGOを出すまではすべてのmergeを`HUMAN_REQUIRED`にする。
