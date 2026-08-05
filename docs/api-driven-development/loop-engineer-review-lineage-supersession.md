# Terminal HOLD後のreview lineage後継契約

## 目的

レビュー上限へ到達した実装を、IssueやPRの番号変更だけで新しいレビューとして扱わない。
旧設計を廃棄し、固定findingを引き継いだ実質的な再設計を1回だけ開始する経路を定義する。

## 固定lineage

| field               | value                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| `review_lineage_id` | `lineage-issue-172`                                                                           |
| predecessor         | `ISSUE-172` / GitHub Issue `354` / PR `355` / head `2f0eaf7ee713bfd140269720a7d593e8f007c5a7` |
| successor           | `ISSUE-175` / GitHub Issue `359`                                                              |
| succession          | `1`                                                                                           |
| required findings   | `gh_cli_pagination_contract`, `main_sha_race`, `status_metadata_allowlist`                    |

この一覧はtrusted mainのcontrollerと同じ固定契約で検証する。2回目の後継は定義しない。

## 証明schema

`loop-engineer-review-lineage-supersession/v1`は次のstatus-only fieldだけを許可する。

- `review_lineage_id`
- `predecessor_issue_id`, `predecessor_issue_number`, `predecessor_pr_number`, `predecessor_head_sha`
- `successor_issue_id`, `successor_issue_number`, `successor_pr_number`
- `merge_base_sha`, `head_sha`
- `finding_ids`, `succession`, `review_round`

未知field、欠落、順序を含むfinding不一致、未登録lineageは失敗する。headは旧headと異ならなければ
ならない。headごとのCheckはcanonical proofのSHA-256だけを、旧head上の登録Checkは後継PR番号、
review round、main、最新head、digestだけを`external_id`へ記録し、自由文を保存しない。

## 発行条件

1. predecessor PRは同じHana repositoryのGitHub Issue #354だけをclose対象とし、登録headのままclosedかつunmergedである。
2. successor PRは同じHana repositoryのGitHub Issue #359だけをclose対象とし、現在のmain向け、open、non-draft、mergeableである。
3. main SHAとsuccessor head SHAが宣言値へ一致する。
4. configured human dispatcherがmain固定workflowを手動実行する。
5. `hana-merge-human-approval`で人間承認後、GitHub署名付きOIDCを検証する。
6. Hana専用Appが旧head上の`review-lineage-registration`と新head上の
   `review-lineage-supersession`をsuccessにする。
7. 初回登録はRound 1だけを許可し、成功済み証明の再発行を禁止する。同じ後継PRの新headに限り
   1巡ずつ進め、失敗済み発行だけは同じRoundで再試行できる。

発行後にmain、head、PR状態、App、Check、proofが動けばmerge gateはHOLDにする。

## Merge gate

- ISSUE-172またはPR #355は入力schemaやroundに関係なく`terminal_review_limit`でHOLDする。
- ISSUE-175は`loop-engineer-github-gate-input/v3`とlive専用App proofを必須にする。
- lineage未完了中は、旧PRまたは登録済み後継PRと運用コードの変更pathが重なる候補、commit / 全体diffの
  stable patch IDが同じ候補、登録済み後継PRそのものに、Issue番号が変わってもv3 proofを必須にする。
  Issue台帳だけの共通更新（`docs/issues/`）はpath一致から除外する。
- 登録済み後継PRが同じHana Issue #359をcloseしてmergeされた場合だけ、以後の別PRからlineage強制を外す。
  base repository / refはHanaの`main`でなければならない。
  ただし旧PRのheadまたはstable patch IDそのものの再利用は、完了後も常にHOLDする。
- 登録Checkが重複、別App、未完了、不正schemaの場合は「未登録」と解釈せずworkflowをHOLD終了する。
- Round 1〜3は通常review、Round 4〜5はISSUE-173の追加証明も必要とする。
- Round 6、旧Check / review / 例外証跡の再利用、2回目の後継は認めない。

## 実行手順

ISSUE-174をmergeした後、PR #355を人間確認のうえclosed / unmergedへ固定する。旧PRは#354、
ISSUE-175のPRは#359だけをclose対象にする。現在のmainから後継PRを作成し、最新main / headと
現在のreview roundを入れたstatus-only JSONで
`loop-engineer-review-lineage-supersession`を実行する。保護Environment承認後、同じ最新SHAで
全専門reviewと`pnpm pr:gate`をやり直す。

## Rollback

controllerとworkflowをrevertして証明を無効化する。predecessorのHOLDは解除しない。successorは
証明を再発行せずHOLDにし、GitHub settings、Ruleset、App権限は変更しない。
