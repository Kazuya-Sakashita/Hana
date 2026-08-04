# Loop Engineer specialist review gate

## 目的と境界

ISSUE-165は、同じ最新commit SHAを角度の異なる複数reviewerが独立に確認したことを、固定schemaで
fail-closedに集約する。reviewerの起動、GitHub API、PR変更、commit、push、merge、実環境操作は行わない。
OpenAPI、DB、Storage、アプリのruntimeにも影響しない。

入力はstdinのJSON 1件だけ、上限は64 KiBとする。CLIはnetwork、環境変数、filesystem write、
child processを使用しない。

## 入力schema

`loop-engineer-review-input/v1`は次だけを許可する。

- `issue_id`、`pr_number`、`merge_base_sha`、`head_sha`
- `round`: 1〜3
- `parallel_slots`: 1〜6
- `change_areas`: ISSUE-164と同じ固定領域ID
- `reviews`: roleごとのstatus-only review証跡

各reviewは`role`、trusted orchestratorが発行する非PIIの`reviewer_instance_id`、`reviewed_issue_id`、
`reviewed_merge_base_sha`、`reviewed_round`、`reviewed_sha`、`status`、`read_only`、`independent_context`、
`other_reviewer_outputs_visible`、`findings`を必須にする。`status`は`go`、`finding`、`timeout`だけを
許可する。初回reviewはread-onlyの独立コンテキストで行い、他reviewerの出力を見せない。

findingは`severity`（P0〜P2）、`evidence`、repository相対`file`、正の`line`、`required_fix`、
`reviewed_sha`を必須にする。free-formの根拠と修正内容は入力検証だけに使い、出力へ複製しない。

## role選択とwave

全PRで以下の3名を必須にする。

| 表示名                       | role ID                      |
| ---------------------------- | ---------------------------- |
| Spec / Acceptance            | `spec-acceptance`            |
| Implementation / Correctness | `implementation-correctness` |
| Test / Reliability           | `test-reliability`           |

変更領域に応じてSecurity、AI Safety、Privacy、Database、API、UI、Image、CIのroleを追加し、同じroleを
共有する複数領域だけ重複排除し、入力順に依存しない固定role順でwave化する。必要人数は3〜6名で、7名以上を統合して減らさず
`reviewer_count_out_of_range`で失敗する。`parallel_slots`ごとに決定的なwaveを返すため、並列枠が
少なくても同じ観点を順番に実行できる。

## 出力schemaと判定

`loop-engineer-review-evaluation/v1`は固定status、reason、Issue ID、PR番号、head SHA、round、
required role、waveと、ISSUE-164へ渡せる`loop-engineer-review-gate/v1`だけを返す。
review prompt、finding本文、PR本文、コメント本文は返さない。

`reviewer_instance_id`はtrusted orchestratorがreview実行ごとに発行し、role間の重複だけを検査する。
同じIDが複数roleを申告した場合は失敗し、このID自体はstdout、artifact、logへ出力しない。

- `pass`: 必要role全員が最新SHAを独立・read-onlyで確認し、finding 0件
- `pending`: 必要reviewerがまだ不足
- `fail`: stale SHA、timeout、schema違反、独立性違反、判断不一致、finding、3巡超過など

主な固定reasonは`review_sha_mismatch`、`reviewer_timeout`、`required_reviewer_missing`、
`actionable_findings_present`、`review_status_mismatch`、`review_round_exceeded`、
`reviewer_count_out_of_range`である。追加commit後はSHA不一致となり、旧reviewは合格証拠にならない。
少数reviewerのfindingも全件数へ加算し、多数決で削除しない。最大3巡後もP0〜P2 findingや不一致が
残れば`fail`のままにする。

## 第4〜5巡の人間承認例外

このCLIの`loop-engineer-review-input/v1`は引き続き1〜3巡だけを受け付ける。第4〜5巡をローカル入力、
boolean、自由文、環境変数で合格に変える経路は追加しない。

第4〜5巡は、ISSUE-173のmain固定GitHub workflowが保護Environmentの承認をGitHub署名付きOIDCで
検証し、専用Appの`review-round-exception` Checkを発行した場合だけ、GitHub merge gateの
`loop-engineer-review-attestation/v2`として評価する。例外はIssue、PR、現在のmain SHA、head SHA、
最大巡4または5へ完全一致で束縛する。追加commitまたはmain更新で失効し、第6巡は常に拒否する。

例外は再reviewを実行できる回数だけを広げる。未解決finding、timeout、必要role不足、SHA不一致、
HOLD、CI失敗、merge conflictを合格へ上書きしない。

## Privacyと禁止データ

保存・出力してよいのはIssue ID、PR番号、SHA、領域ID、role、round、finding件数、固定status／reason
だけである。`reviewer_instance_id`は入力時の一意性検証だけに使い、保存・出力しない。PR本文、コメント、review prompt全文、実ユーザーデータ、氏名、メール、実画像情報、
画像URL、storage key、AI生成本文、接続情報、secretを入力fixture、stdout、artifact、logへ残さない。
unknown fieldは値を保持せず、redactedな`fail`を返す。

## 実行

```bash
pnpm loop-engineer:review < status-only-review.json
pnpm qa:issue165:specialist-review -- --mode=contract
```

contract modeは合成データだけでpass、stale SHA、少数finding、timeout、4巡目、7名以上を確認する。
ISSUE-173の例外経路は`pnpm qa:issue173:review-round-exception`で署名、Environment、専用App、
SHA移動、重複Check、許可上限超過を合成データだけで確認する。
