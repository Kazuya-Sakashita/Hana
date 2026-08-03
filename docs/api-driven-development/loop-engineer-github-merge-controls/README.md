# Loop Engineer GitHub merge controls

## 目的と有効化境界

ISSUE-166はmainをPR、最新SHAの必須check、squash mergeで保護する。Rulesetとrepository settingsの変更は`HUMAN_REQUIRED`であり、Security、Operations、設定scope、rollback、PR mergeの人間承認後だけ適用する。

native auto-merge機能自体は利用可能にするが、ISSUE-167の5 PR dry-runと人間GOまではauto-mergeを予約しない。production deployと実DB migrationは別の人間承認を維持し、code mergeと連動させない。

## 脅威モデル

通常の`pull_request` workflowはPR側で変更でき、GitHub Actions App `15368`名義の同名jobを作れる。このため、そのApp名義のjobをrequired checkの信頼源にはしない。

Hanaだけへinstallする専用GitHub Appが、mainに固定したworkflowから5件のCheck Runを発行する。Rulesetは専用Appのintegration IDへ固定する。PR側の候補コードはsecretのない別jobで検査し、App tokenを持つjobでは実行しない。

## 専用GitHub AppとEnvironment

Appの作成、Hanaへのinstall、variable、secret、Environment設定は人間承認後に行う。App権限は次を上限とする。

- Actions: write（mainのworkflow dispatchだけに使用）
- Checks: write（固定名のCheck Run発行だけに使用）
- Contents: read
- Pull requests: read
- Administration: none
- Secrets: none
- Ruleset bypass: none

repositoryには`LOOP_ENGINEER_APP_ID`と`LOOP_ENGINEER_DISPATCHER_LOGIN`をActions variable、private keyを`LOOP_ENGINEER_APP_PRIVATE_KEY` secretとして登録する。初期導入では承認済みの人間login、ISSUE-167で自動dispatchを有効化するときだけApp bot loginへ切り替える。値はログ、artifact、docs、PRへ保存しない。

`hana-merge-human-approval` Environmentには人間reviewerを設定する。`HUMAN_REQUIRED`の`merge-eligibility`はこのEnvironment承認後にだけ発行する。dispatch元は専用Appであるため、人間がJSONへ`approved`を書いて承認を代替する経路はない。`HOLD`にはEnvironment job自体を作らない。

## Status-only attestation

workflow inputは`loop-engineer-github-gate-input/v2`だけを受け付ける。内容はIssue ID、PR番号、main SHA、head SHA、review round、change area、role、件数、固定status/reasonである。

review本文、findingのevidence・required fix、PR本文、コメント、prompt、実ユーザーデータ、画像情報、storage key、AI生成本文、secretはworkflow input、artifact、logへ渡さない。未知fieldと旧v1 inputはfail-closedにする。

設定済みdispatcherだけが次のようにmain上のworkflowをdispatchする。PR branchを`--ref`へ指定しない。

```bash
gh workflow run loop-engineer-merge-gates.yml \
  --ref main \
  -f gate_input='<STATUS_ONLY_V2_JSON>'
```

workflowはdispatch actorが設定済みの人間またはApp botであることを確認し、GitHub APIからopen/non-draft/main向けPR、head SHA、base SHA、mergeable状態をfreshに照合する。追加commit、main更新、review invalidation、merge conflictは旧attestationを失効させる。

候補コード上では`candidate-pr-gate`、`candidate-openapi-validate`、`candidate-issue-registry`をsecretなしで実行する。main上のpublisherだけが、専用App名義で次を発行する。

- `pr-gate`
- `validate`
- `local-registry`
- `specialist-review-gate`
- `merge-eligibility`

## 設定前snapshot

`preflight.json`は2026-08-04のread-only API確認をstatus-only fieldだけで記録した。squash title/messageを含むため、repository settingsを完全に戻せる。

- default branch: `main`
- repository Ruleset: 0件
- main branch protection: なし
- native auto-merge: 無効
- squash / merge commit / rebase: すべて許可
- squash title: `COMMIT_OR_PR_TITLE`
- squash message: `COMMIT_MESSAGES`
- delete branch on merge: 無効

適用直前にfresh preflightを再取得し、このsnapshotから無断変更があれば停止する。

## Ruleset template

`main-ruleset.template.json`と`main-ruleset-disabled.template.json`の`integration_id: 0`は未設定を表す。raw templateをGitHub APIへ送らない。専用App作成後、全5件を同じ正のApp IDへ置換し、`15368`が残っていないことを検査した一時ファイルだけを使用する。

Rulesetはdefault branchだけを対象にし、bypass actorは0件とする。

- branch deletionとnon-fast-forward pushを禁止
- main更新をPR経由に限定
- GitHub reviewのrequired approval countは0
- merge方式はsquashだけ
- branchを最新mainへ更新してからmerge
- 5件のrequired checkを専用Appへ固定

## Staged activation

適用は次の順番を変えない。途中失敗時はautomatic rollbackを実行し、fresh接続で戻り値を確認する。

1. fresh preflightを取得し、repository名、default branch、merge settings、Ruleset一覧を照合する。
2. 専用App、App bot login、Hana限定installation、secret、`hana-merge-human-approval` required reviewerをreadbackする。
3. synthetic PRへmain workflowをdispatchし、5件のCheck Runが専用App ID、同一head SHA、固定名で発行されたことをreadbackする。
4. App IDを埋めた`main-ruleset-disabled.template.json`からRulesetを`disabled`で作成する。
5. 作成したRulesetをexact readbackし、対象branch、bypass 0件、rule、check名、App IDがversioned contractと一致しなければautomatic rollbackする。
6. 同じRulesetを`active`へ更新し、fresh readbackする。
7. 最後に`repository-settings.json`を適用し、native auto-mergeとsquash-onlyをfresh readbackする。
8. ISSUE-167の人間GO前にauto-merge予約が0件であることを確認する。

repository settingsを先に変えない。active RulesetをいきなりPOSTしない。作成されたRuleset ID以外のactor・token・response headerは証跡へ保存しない。

Security、Operations、GitHub App / Environment設定、実GitHub設定変更がすべて承認された後だけ、transaction CLIを1回実行する。repository名を2回一致させ、承認Issue、専用App ID、実ユーザーデータを含まないbootstrap PRのhead SHAを明示する。

```bash
pnpm loop-engineer:apply-github-controls -- \
  --repository=Kazuya-Sakashita/Hana \
  --confirm-repository=Kazuya-Sakashita/Hana \
  --human-approval=ISSUE-166 \
  --app-id=<DEDICATED_APP_ID> \
  --bootstrap-head-sha=<SYNTHETIC_PR_HEAD_SHA>
```

CLIはvariable / secret名とEnvironment reviewerをread-only確認し、fresh preflightと専用Appの5 checkを照合してから変更する。disabled作成後のexact readback、active化、repository settingsの順で進め、途中失敗時はRuleset disabled化と全merge settings復元をautomatic rollbackする。出力は固定status/reasonとRuleset IDだけである。

## Synthetic verification

Ruleset有効化後、実ユーザーデータを含まない専用PRで次を確認する。

1. 追加commitで旧SHAの5 checkが使われず、新SHAで再実行が必要になる。
2. candidate check rerunは同じSHAだけへ反映される。
3. review gateを作った後のmain更新でbase SHA不一致となり、再reviewが必要になる。
4. merge conflictでは`merge-eligibility`が成功せず、Rulesetもmergeを拒否する。

結果はPR番号、SHA、固定status/reason、App ID、時刻だけをstatus-onlyで記録する。この確認PRをauto-merge予約しない。

## Rollback

automatic rollbackは、作成済みRulesetを削除せず`disabled`へ戻し、`repository-settings-rollback.json`でauto-merge、merge方式、squash title/messageをfresh preflight値へ戻す。失敗前にsettingsを変更していない場合も、Rulesetのdisabled readbackを行う。

rollback後はfresh API connectionで次を確認する。

- Rulesetが`disabled`
- bypass actorが0件のまま
- native auto-mergeが無効
- squash、merge commit、rebaseが再許可
- squash title/messageがpreflight値
- auto-merge予約が0件

rollback自体が失敗した場合は以後のmutationを停止し、Operationsへ`HOLD`としてRuleset IDと固定エラーreasonだけを報告する。

## 公式仕様

- <https://docs.github.com/en/rest/repos/rules>
- <https://docs.github.com/en/rest/repos/repos>
- <https://docs.github.com/en/rest/checks/runs>
- <https://docs.github.com/en/actions/how-tos/managing-workflow-runs-and-deployments/managing-deployments/reviewing-deployments>
- <https://docs.github.com/en/enterprise-cloud@latest/apps/creating-github-apps/authenticating-with-a-github-app/making-authenticated-api-requests-with-a-github-app-in-a-github-actions-workflow>
