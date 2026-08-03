# Loop Engineer GitHub merge controls

## 目的と有効化境界

ISSUE-166はmainをPR、最新SHAの必須check、squash mergeで保護する。Rulesetとrepository settingsの変更は`HUMAN_REQUIRED`であり、Security、Operations、設定scope、rollback、PR mergeの人間承認後だけ適用する。

この設定でnative auto-merge機能自体は利用可能になるが、ISSUE-167の5 PR dry-runと人間GOまではauto-mergeを予約しない。
production deployと実DB migrationは別の人間承認を維持し、code mergeと連動させない。

## 設定前snapshot

`preflight.json`は2026-08-04のread-only API確認を、機密情報を含まないstatus-only fieldだけで記録した。

- default branch: `main`
- repository Ruleset: 0件
- main branch protection: なし
- native auto-merge: 無効
- squash / merge commit / rebase: すべて許可
- delete branch on merge: 無効

token値、ユーザー情報、PR本文、コメント、review本文、secretはsnapshotへ含めない。

## Desired state

`main-ruleset.json`はdefault branchだけを対象にし、bypass actorは0件とする。

- branch deletionとnon-fast-forward pushを禁止
- main更新をPR経由に限定
- GitHub reviewのrequired approval countは0
- merge方式はsquashだけ
- branchを最新mainへ更新してからmerge
- GitHub Actions App `15368`をexpected sourceとして次のjob名を必須化
  - `pr-gate`
  - `validate`
  - `local-registry`
  - `specialist-review-gate`
  - `merge-eligibility`

`repository-settings.json`はnative auto-mergeとsquashを許可し、merge commitとrebaseを無効にする。

## SHA-bound GitHub check

`.github/workflows/loop-engineer-merge-gates.yml`はdefault branchへmerge後、status-onlyの
`loop-engineer-github-gate-input/v1`を手動dispatchで受け取る。workflow tokenは`contents: read`だけとし、
入力のhead SHAを実行時の`GITHUB_SHA`へ結び付ける。

```bash
gh workflow run loop-engineer-merge-gates.yml \
  --ref <PR_HEAD_BRANCH> \
  -f gate_input='<STATUS_ONLY_JSON>'
```

最小権限のautomation credentialを将来使う場合の上限は次とする。

- Actions: write
- Contents: read
- Administration: none
- Secrets: none
- Ruleset bypass: none

PR本文、コメント、prompt、finding本文、実ユーザーデータ、画像情報、storage key、AI生成本文、secretを
workflow input、artifact、logへ渡さない。

`specialist-review-gate`はreview集約がpassのときだけ成功する。`merge-eligibility`は
`AUTO_MERGE_ELIGIBLE`、または同じhead SHAと固定reasonへの人間承認がある`HUMAN_REQUIRED`だけ成功する。
`HOLD`は人間承認で上書きできない。どちらのjobもauto-mergeを設定せず、mergeも実行しない。

追加commit後は新しい`GITHUB_SHA`で再dispatchし、旧checkと旧reviewを再利用しない。check rerunは同じSHAだけに
有効である。merge conflictまたはstrict update未達ではGitHub Rulesetがmergeを停止する。

## 適用手順

ISSUE-166 PRを従来の人間merge承認でmainへmergeし、workflowとcontractがdefault branchに存在することを
確認してから実設定を適用する。次の2操作は個別に承認されたrepositoryだけへ実行する。

```bash
gh api --method PATCH repos/Kazuya-Sakashita/Hana \
  --input docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings.json

gh api --method POST repos/Kazuya-Sakashita/Hana/rulesets \
  --input docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset.json
```

作成されたRuleset IDだけをstatus-only証跡として保持する。token、response header、actor情報は保存しない。

## Postflight

fresh API connectionで次を確認する。

1. repository settingsがauto-merge有効、squashのみになっている
2. `Hana main merge controls`が`active`でdefault branchを対象にする
3. bypass actorが0件で、required check 5件がGitHub Actions App `15368`へ固定されている
4. branch deletion、force push、直接更新が禁止されている
5. ISSUE-167の人間GO前にauto-merge予約が0件である

## Rollback

誤設定、required check欠落、想定外のmerge許可を検出した場合は、auto-merge予約を解除したうえでRulesetを
削除せず`disabled`へ変更し、repository merge settingsをpreflightへ戻す。

```bash
gh api --method PUT repos/Kazuya-Sakashita/Hana/rulesets/<RULESET_ID> \
  --input docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset-disabled.json

gh api --method PATCH repos/Kazuya-Sakashita/Hana \
  --input docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings-rollback.json
```

rollback後はfresh API connectionでRulesetが`disabled`、auto-mergeが無効、merge commitとrebaseが再許可された
ことを確認する。`HOLD`条件はそのまま維持し、その他のmergeを`HUMAN_REQUIRED`へ戻す。

## 公式仕様

- <https://docs.github.com/en/rest/repos/rules>
- <https://docs.github.com/en/rest/repos/repos>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets>
- <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-auto-merge-for-pull-requests-in-your-repository>
