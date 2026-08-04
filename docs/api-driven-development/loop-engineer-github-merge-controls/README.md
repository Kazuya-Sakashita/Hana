# Loop Engineer GitHub merge controls

## 目的と有効化境界

ISSUE-166はmainをPR、最新SHAの必須check、squash mergeで保護する。Rulesetとrepository settingsの変更は`HUMAN_REQUIRED`であり、Security、Operations、設定scope、rollback、PR mergeの人間承認後だけ適用する。

native auto-merge機能自体は利用可能にするが、ISSUE-167の5 PR dry-runと人間GOまではauto-mergeを予約しない。production deployと実DB migrationは別の人間承認を維持し、code mergeと連動させない。

## 脅威モデル

通常の`pull_request` workflowはPR側で変更でき、GitHub Actions App `15368`名義の同名jobを作れる。このため、そのApp名義のjobをrequired checkの信頼源にはしない。

Hanaだけへinstallする専用GitHub Appが、mainに固定したworkflowから5件のCheck Runを発行する。Rulesetは専用Appのintegration IDへ固定する。PR側の候補コードはsecretのない別jobで検査し、App tokenを持つjobでは実行しない。

## 専用GitHub AppとEnvironment

Appの作成、Hanaへのinstall、variable、secret、Environment設定は人間承認後に行う。App権限は次を上限とする。

- Actions: none
- Checks: write（固定名のCheck Run発行だけに使用）
- Contents: read
- Metadata: read
- Pull requests: read
- Administration: none
- Secrets: none
- Ruleset bypass: none

repositoryには`LOOP_ENGINEER_APP_ID`、`LOOP_ENGINEER_DISPATCHER_LOGIN`、`LOOP_ENGINEER_HUMAN_REVIEWER_LOGIN`をActions variableとして登録する。private keyはrepository secretへ置かない。

private keyは`hana-merge-publisher`と`hana-merge-human-approval`の2つのEnvironment secretへ、同じ`LOOP_ENGINEER_APP_PRIVATE_KEY`名で登録する。両Environmentはdeployment branchをmainだけに限定し、`can_admins_bypass=false`とする。publisherにはreviewerを置かず、human approvalには指定したUser reviewerを1名だけ置く。1人運用のため`prevent_self_review=false`を明示し、承認操作そのものはEnvironment履歴へ残す。

初期導入ではdispatcherを承認済みの人間loginにする。ISSUE-167で自動dispatchを追加する場合もApp権限は増やさず、別のmain固定controllerだけを設計・reviewする。App ID、login、Environment secretの値はログ、artifact、docs、PRへ保存しない。

通常の`gh`認証では、GitHub App user access token専用の`/user/installations`を呼ばない。Appと
installationの実設定確認は、`hana-merge-publisher`内で専用App tokenを作る
`loop-engineer-app-security-preflight.yml`へ分離する。このworkflowはmainの最新コードだけを実行し、
Appの宣言権限が上記4権限だけであることと、owner全体を対象に作ったinstallation tokenから見える
repositoryがHana 1件だけであることを照合する。

確認開始時にmain SHAへ専用App名義の`app-security-preflight`を`in_progress`で作成する。成功時だけ
同じCheck Run IDを`success`へ更新し、失敗時は`failure`へ更新する。通常の`gh`認証を使う適用CLIは、
指定したworkflow run ID、current main SHA、専用App ID、Check Runのexternal ID、成功状態、完了時刻を
照合する。workflowとCheckのどちらかが15分を超えて古い場合、別SHA、別App、複数Check、失敗、未完了の
場合は設定変更前に停止する。

`HUMAN_REQUIRED`の`merge-eligibility`は新世代開始時に`in_progress`で発行し、`hana-merge-human-approval`の承認後だけ同じCheck Run IDを`success`へ更新する。人間がJSONへ`approved`を書いて承認を代替する経路はない。`HOLD`にはEnvironment承認job自体を作らない。

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

workflowのrun名とconcurrency名には未検証inputを含めず、main controller全体を固定名で直列化して新しいrunが古いrunをcancelする。attestationを検証した直後、候補コードを実行する前に、専用Appが5件のCheck Runを`in_progress`で新規作成する。`merge-eligibility`を最初に作るため、途中失敗や同一SHAの旧successがあっても新世代の評価中はmergeできない。

各candidate jobはこの失効処理の成功へ依存する。publisherは新規Checkを追加せず、開始時に得たCheck Run IDを`PATCH`する。開始・確定・人間承認・waiver取消は、mainのtrusted SHAからcheckoutした`github-check-generation.ts`だけを実行する。同じcontrollerをGitHub API境界だけ差し替えたunit testで実行し、AUTO / HUMAN_REQUIRED / HOLD、部分失敗、世代更新、label取消のAPI呼出順を固定する。成功へ更新する直前に、専用Appの同一SHA / 同一名で最新の`merge-eligibility` IDが現在世代と一致すること、base/head、mergeable、OpenAPI breaking承認labelをfreshに確認する。不一致時は現在世代の5件をfailureへ更新する。100件上限のActions workflow run一覧には依存しない。

`openapi-breaking-approved` labelが外された場合は、main固定の`pull_request_target` workflowが候補コードをcheckout・実行せず、専用App名義の`validate`と`merge-eligibility`をfailureで発行する。labelが再追加済み、PR headが変化済み、PRがclose済みなら古いeventは何も変更しない。

候補コード上では`candidate-pr-gate`、`candidate-openapi-validate`、`candidate-issue-registry`をsecretなしで実行する。OpenAPI検査は候補側の既存reportを削除してからpinしたoasdiff actionでattested base SHAとの差分を確認し、action失敗時に新規の非空reportがなければwaiver判定へ進まない。breaking時はPR labelとexact-report hashが一致する承認済みwaiverを必須にする。main上のpublisherだけが、専用App名義で次を発行する。

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
2. mainを指定してApp security preflightを手動実行し、workflow run IDを控える。専用Appが宣言する権限と、installation tokenから見えるrepository全件はprotected Environment内でexact readbackする。
3. 適用CLIがworkflow runと同じmain SHAの最新`app-security-preflight`を専用App名義で1件だけreadbackし、15分以内の成功であることを確認する。
4. repository secretにprivate keyがないこと、2 EnvironmentだけにEnvironment secretがあること、main branch policy、`can_admins_bypass=false`、human reviewer identity/type、self-review policyをexact readbackする。
5. synthetic PRへmain workflowをdispatchし、候補checkより先に5件の`in_progress` Check Runが専用App ID、同一head SHA、固定名で発行され、最終jobが同じIDを更新したことをreadbackする。
6. App IDを埋めた`main-ruleset-disabled.template.json`からRulesetを`disabled`で作成する。
7. 作成したRulesetをexact readbackし、対象branch、bypass 0件、rule、check名、App IDがversioned contractと一致しなければautomatic rollbackする。
8. 同じRulesetを`active`へ更新し、fresh readbackする。
9. 最後に`repository-settings.json`を適用し、native auto-mergeとsquash-onlyをfresh readbackする。
10. GraphQLのfresh queryでopen PRのauto-merge予約が0件であることを確認する。

repository settingsを先に変えない。active RulesetをいきなりPOSTしない。作成されたRuleset ID以外のactor・token・response headerは証跡へ保存しない。

Security、Operations、GitHub App / Environment設定、実GitHub設定変更がすべて承認された後だけ、transaction CLIを1回実行する。repository名を2回一致させ、承認Issue、専用App ID、実ユーザーデータを含まないbootstrap PRのhead SHAを明示する。

App security preflightは適用CLIの直前にmainで実行する。実行IDはAPI応答本文やsecret値と一緒に保存せず、
この適用操作のstatus-only入力としてだけ使用する。

```bash
gh workflow run loop-engineer-app-security-preflight.yml --ref main
gh run list \
  --workflow=loop-engineer-app-security-preflight.yml \
  --branch=main \
  --event=workflow_dispatch \
  --limit=1 \
  --json databaseId,status,conclusion
```

表示された実行が`completed`かつ`success`であることを確認し、その`databaseId`を次の
`APP_SECURITY_PREFLIGHT_RUN_ID`として使う。CLIでも同じ状態をfresh readbackするため、表示だけを承認根拠に
しない。

```bash
pnpm loop-engineer:apply-github-controls -- \
  --repository=Kazuya-Sakashita/Hana \
  --confirm-repository=Kazuya-Sakashita/Hana \
  --human-approval=ISSUE-166 \
  --app-id=<DEDICATED_APP_ID> \
  --app-preflight-run-id=<APP_SECURITY_PREFLIGHT_RUN_ID> \
  --bootstrap-head-sha=<SYNTHETIC_PR_HEAD_SHA>
```

CLIはvariable、App security preflight、repository secret不在、Environment secret名、branch policy、admin bypass、reviewerをread-only確認し、fresh preflight、auto-merge予約0件、専用Appの5 checkを照合してから変更する。disabled作成後のexact readback、active化、repository settingsの順で進め、途中失敗時はRuleset disabled化と全merge settings復元をautomatic rollbackする。作成応答IDが欠落しても同名Rulesetを発見してdisabledへ戻す。出力は固定status/reasonとRuleset IDだけである。

## Synthetic verification

Ruleset有効化後、実ユーザーデータを含まない専用PRで次を確認する。

1. 追加commitで旧SHAの5 checkが使われず、新SHAで再実行が必要になる。
2. candidate check rerunは同じSHAだけへ反映される。
3. review gateを作った後のmain更新でbase SHA不一致となり、再reviewが必要になる。
4. merge conflictでは`merge-eligibility`が成功せず、Rulesetもmergeを拒否する。
5. 同一head SHAの旧AUTO success後にHOLD / HUMAN_REQUIREDを開始し、候補実行前から旧successが使われない。
6. OpenAPI breaking承認labelを外すと`validate`と`merge-eligibility`が専用App名義のfailureになる。

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
