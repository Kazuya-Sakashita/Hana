# 0017. Loop Engineerの自動マージ適格性と人間承認境界

- Status: accepted
- Activation: deferred
- Date: 2026-08-03
- Deciders: kazuya
- Human review: Security approved, Operations approved
- Activation gate: ISSUE-164、ISSUE-165、ISSUE-166を完了し、ISSUE-167のdry-run後に人間がGOを出すこと

## Context

Hanaは1人運用でもPR、CI、専門review、rollback記録を通している。すべての通常PRで最後の
merge承認だけを人間に求め続けると、検証済みの低リスク変更でも待ち時間が発生する。一方で、
子どもの写真、感情記録、認証、AI、DBを扱うため、Codexの権限を広げたり、CIを迂回したり、
実環境操作まで自動化したりすることは許容できない。

必要なのは「何でも自動承認する」設定ではなく、PRのmerge適格性と、PC・GitHub・実環境へ
作用する操作承認を分離したfail-closed契約である。

## Decision

### 1. 3状態と優先順位

Loop EngineerはPRを次の3状態のどれかに分類する。優先順位は
`HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE`とし、複数条件に該当した場合は安全側を選ぶ。

| 状態                  | 意味                                                                 | 許可される次の動作                                            |
| --------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `AUTO_MERGE_ELIGIBLE` | 低リスクのコード変更で、最新SHAのreviewとCIがすべて合格              | ISSUE-167のdry-runと人間GO後だけnative auto-mergeを予約できる |
| `HUMAN_REQUIRED`      | 証跡は揃っているが、実環境・不可逆性・管理権限に関する人間判断が必要 | 人間が限定scopeを承認するまでmergeまたは操作しない            |
| `HOLD`                | 指摘、矛盾、不明、stale証跡、検証不能のいずれかがある                | 人間承認でも上書きせず、修正または証跡追加後に再判定する      |

`HUMAN_REQUIRED`は判断待ちであり、`HOLD`は合格条件未達である。管理者がCIやreviewを無視して
`HOLD`をmerge可能へ変える運用は採用しない。

### 2. AUTO_MERGE_ELIGIBLEの必要十分条件

次のすべてを同じPR head SHAに対して満たした場合だけ候補とする。

1. 1 Issue / 1 branch / 1 PRで、Issueの受け入れ条件がすべて完了している
2. merge-baseからheadまでにunrelated diffがない
3. `pnpm pr:gate`と変更領域固有の必須checkが成功している
4. 最低3名、最大6名の必要reviewerが同じ最新commit SHAを確認している
5. 各reviewはread-only、独立コンテキストで、初回は他reviewerの結論を見ていない
6. 未解決actionable findingが0件で、reviewer間の判断不一致がない
7. review出力schema、reviewer数、timeout、対象SHAに欠落がない
8. PRにRollback Recordがあり、回復手順と確認方法が実行可能である
9. OpenAPI変更はOpenAPI-firstで、生成物とbreaking判定が同期している
10. PII、secret、画像URL、storage key、prompt、AI生成本文をdiff・log・証跡へ追加していない
11. `HUMAN_REQUIRED`または`HOLD`条件に1件も該当しない

追加commitが作られた時点で、旧SHAに対するreviewと適格性判定はすべて無効になる。

### 3. Reviewer matrix

全PRで次の3観点を必須にする。

| 必須role                     | 主な確認                                   |
| ---------------------------- | ------------------------------------------ |
| Spec / Acceptance            | Issue、PRD、ADR、受け入れ条件、scope creep |
| Implementation / Correctness | 実装、エラー経路、セキュリティ境界、保守性 |
| Test / Reliability           | 回帰、失敗時、rollback、CI、競合・再実行   |

変更領域に応じて次を追加し、合計4〜6名にする。同じreviewerへ重要な独立観点をまとめて
人数を減らしてはならない。必要roleを確保できなければ`HOLD`とする。

| 変更領域                                                  | 追加role                       |
| --------------------------------------------------------- | ------------------------------ |
| Auth / ownership / account deletion                       | Security / Authorization       |
| AI / consent / prompt / generated output                  | AI Safety / Privacy            |
| Privacy / consent / telemetry / retention / data handling | Privacy / Data Protection      |
| DB schema / migration / query / RLS                       | Database / Migration           |
| API / OpenAPI / client contract                           | API / Contract                 |
| UI / copy / interaction                                   | UI / Accessibility             |
| Image / Storage / cleanup                                 | Image Pipeline / Privacy       |
| CI / workflow / dependency / operations                   | CI / Supply-chain / Operations |

並列枠が足りない場合はwave実行してよいが、各reviewerには同じIssue仕様、merge-base、head SHA、
diffを渡す。初回reviewでは他reviewerのprompt、finding、結論を渡さない。reviewerはファイル編集、
commit、push、PR変更、merge、実環境アクセスを行わない。追加roleによって7名以上が必要になる場合は、
roleを統合して人数を減らさず`HOLD`にする。

### 4. 通常最大3巡と限定例外

1巡は、1つのhead SHAに対して必要reviewer全員が確認を完了する単位である。修正commit後は新しい
SHAで全必要reviewをやり直す。3巡目の終了時にactionable finding、判断不一致、情報不足、timeout、
schema違反、検証不能が1つでも残れば`HOLD`とする。多数決で少数意見を消さない。

人間が追加修正・再reviewを明示的に許可する場合だけ、第4巡または第5巡までの限定例外を認める。
例外はISSUE-173のmain固定workflowで`hana-merge-human-approval`を通り、GitHub署名付きOIDCの
repository、workflow、Environment、actor、run、main SHAを検証した後、Hana限定の専用GitHub Appが
`review-round-exception` Check Runを発行する。merge gateはIssue ID、PR番号、現在のmain SHA、head SHA、
許可した最大巡、App ID、Check状態をfreshに完全一致で確認する。

caller入力のboolean、自由文、ローカルファイル、通常のGitHub Actions Appのjob、OIDC未検証の証明は
承認にならない。mainまたはheadが動いた場合、Checkが複数・未完了・失敗・別Appの場合、許可上限を
超えた場合は`HOLD`とする。第6巡以降の例外、Ruleset bypass、未解決findingの上書きは認めない。

### 5. HUMAN_REQUIRED

次は自動mergeまたは自動実行しない。人間承認は対象、環境、手順、rollbackを限定して取得する。

- staging / productionを含む実DB migration適用、backfill、repair、purge
- 実データの削除、復元、匿名化、実ユーザーデータを使う検証
- production deploy、公開、release、traffic切替、canary開始
- secretの作成・読取・変更、AI vendorや外部サービスの契約・設定変更
- GitHub Ruleset、branch protection、repository setting、automation token権限の変更
- OpenAPI breaking waiverの承認
- force push、履歴改変、branch削除、DB resetなどのdestructive operation
- 課金、外部送信、第三者への通知を伴う操作

破壊的SQL、物理削除、秘密情報処理を含むコードそのものも、将来の自動適用との分離が証明できない
場合は`HUMAN_REQUIRED`とする。

### 6. Code-onlyの重要領域

Auth、ownership、AI、画像、Privacy、DB migrationファイルを変更したという理由だけで、すべての
PRを一律に人間待ちにはしない。実環境へ作用せず、合成データだけを使い、追加専門review、CI、
rollback、最新SHA条件を満たすコード変更は`AUTO_MERGE_ELIGIBLE`候補になり得る。

ただし、実DB適用、実ユーザーデータ、production deploy、secret/vendor設定など前節の操作は、
コードmergeとは別の`HUMAN_REQUIRED`として残す。

### 7. HOLD

次のいずれかがあればfail closedで`HOLD`とする。

- acceptance criteria未完了、unrelated diff、merge conflict、必須CIの未完了または失敗
- review対象SHA不一致、追加commit後のstale review、reviewer不足、timeout、出力schema違反
- actionable finding残存、reviewer間の判断不一致、3巡超過かつ有効なISSUE-173例外なし
- review例外の対象不一致、期限切れ、別App、未完了、失敗、重複、承認上限超過
- risk分類、rollback、必要な仕様、実環境との分離証拠が不足
- 未知のlabel、field、変更領域、外部影響、認可境界
- PII、secret、実画像情報、prompt、生成本文の露出疑い
- Rulesetやrequired checkのbypassが必要

### 8. Codexと既存規約の安全境界

この方針はCodexのshell実行承認やfilesystem sandboxを弱めない。Hanaの推奨baselineは
`approval_policy="on-request"`、`approvals_reviewer="auto_review"`、
`sandbox_mode="workspace-write"`であり、networkは必要時だけ限定承認する。

`approval_policy="never"`、Full Access、CI bypass、Ruleset bypass token、admin相当tokenは採用しない。
1 Issue / 1 PR、OpenAPI-first、生成物の直接編集禁止、PII非保存、destructive操作の事前確認を維持する。

### 9. 証跡の最小化

自動判定と監査へ保存してよいのは、Issue ID、PR番号、head SHA、変更領域ID、reviewer role、round、
actionable finding件数、必須check名とstatus、固定された最終判定reasonである。

PR本文、コメント本文、review prompt全文、実ユーザー情報、画像、画像URL、storage key、AI prompt、
AI生成本文、secret、接続文字列は取得・artifact保存・ログ出力しない。

### 10. 段階有効化

本ADRのmergeだけでは自動マージを有効にしない。

1. ISSUE-164で副作用のない3状態判定を実装する
2. ISSUE-165で最新SHA単位の複数専門review gateを実装する
3. ISSUE-166で人間承認のもとRulesetとnative auto-merge設定を準備するが、PRへの予約は行わない
4. ISSUE-167で最初の5 PRをdry-runし、誤許可0件を確認する
5. ISSUE-167の人間GO後に、限定した低リスクPRだけを有効化する

それまでも`HOLD`条件は最優先で維持し、HOLDでないPRのmergeを`HUMAN_REQUIRED`として扱う。

## Consequences

### Positive

- 通常開発の待ち時間を減らしながら、実環境操作と権限変更を人間管理に残せる。
- 単一エージェントの自己評価、多数決、stale reviewによる誤許可を防げる。
- 後続Issueが同じ状態名、risk境界、証跡allowlistを実装できる。

### Negative

- 最低3名のreviewと追加commit後の全面再レビューに時間と計算資源が必要になる。
- 重要領域を横断するPRは最大6名でも分類できず`HOLD`になる場合がある。
- Rulesetとdry-runが完了するまでは従来の人間merge承認が必要である。

## Rollback

有効化後に誤許可またはbypassを検出した場合は、native auto-merge予約を解除し、Loop Engineerを
停止する。`HOLD`条件に該当するPRは`HOLD`のまま維持し、それ以外のPRのmergeを
`HUMAN_REQUIRED`へ戻す。Ruleset変更のrollbackと再開条件はISSUE-166、監査とkill switchは
ISSUE-167で具体化する。

## References

- ISSUE-163 / GitHub Issue #335
- ISSUE-164 / GitHub Issue #336
- ISSUE-165 / GitHub Issue #337
- ISSUE-166 / GitHub Issue #338
- ISSUE-167 / GitHub Issue #339
- ISSUE-173 / GitHub Issue #356
- `docs/api-driven-development/codex-automation-runbook.md`
- `AGENTS.md`
