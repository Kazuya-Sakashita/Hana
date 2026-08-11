# 0019. Terminal HOLD後のLoop Engineer回復をmanual-onlyで終端する

- Status: accepted
- Date: 2026-08-11
- Decider: Repository Owner
- Scope: policy and documentation only
- Activation: manual-only stop is effective on merge; recovery authority remains blocked

## Context

Loop Engineerの回復campaignは複数のTerminal HOLDへ到達した。PR #355、#361、#389、#391と
Issue #362、#390を追加修正、追加review、別Issueへの移植で再開すると、review budgetと停止判断を
識別子の変更だけでresetできてしまう。

個人開発のため、回復権限を強く束縛するhardware security keyは現在利用できず、購入もしない。
一方で、通常開発まで停止する必要はない。active Rulesetのfresh readbackと、それに一致する
Hana App required Checksは通常PRの
merge-control証跡として利用できるが、回復権限の発行やactivationとは異なる。

## Decision

### 1. 2つのplaneを分離する

| plane                | 対象                                                                            | 現在の状態             |
| -------------------- | ------------------------------------------------------------------------------- | ---------------------- |
| normal merge-control | active Rulesetのfresh readbackで通常PRに要求されるCheckと人間のmerge判断        | 継続可能               |
| recovery authority   | 凍結・回復目的のreview例外、credential、succession、Check、権限消費、activation | manual-onlyで`BLOCKED` |

normal merge-controlのCheckがsuccessでも、recovery authority、Terminal HOLD例外、credential、
activation、production操作または自動merge予約を付与しない。

通常Checkは、非凍結の通常PR、現在head、active Rulesetが要求するApp identity、normal merge-control
purposeへ一致する場合だけnormal planeとして扱う。通常の`merge-eligibility`と、凍結対象または回復権限を
subject / purposeとするrecovery projectionを区別する。通常Checkを発行できない場合は対象PRを`HOLD`とし、
Ruleset bypassやrecovery publisherで代用しない。

### 2. Terminal HOLDを凍結する

次を凍結対象とする。

- PR #355、#361、#389、#391
- Issue #362、#390
- 各対象に結び付くbranch、head、review campaign、Check、attestation、例外証跡

凍結対象にはpush、修正、review、reviewer追加・交代、Check作成・更新、workflow dispatch、mergeを
行わない。Issue、PR、branch、headまたはlineage IDを変更しても凍結は解除されない。

### 3. frozen成果物を継承しない

凍結branchのcode、commit、diff、schema、test、fixture、review、Check、attestationを、別Issueの
実装素材、oracle、合格証跡、activation入力へ再利用しない。

凍結を執行するための公開status metadataとして、object ID、terminal state、base SHA、head SHA、
Check IDをread-onlyで参照することだけを許可する。このmetadataは回復権限や成功証跡にならない。

### 4. manual-onlyで許可する操作

- `origin/main`から始める通常のIssue、branch、PR開発
- 通常PRに対するactive Rulesetのfresh readbackと、それに一致するHana App required Checks
- 人間とread-only agentによる状態確認、文書監査、通常の最大3巡review
- required Checksとreviewが揃った通常PRをRepository Ownerが手動squash mergeする判断
- 回復を停止したまま維持する判断

agent reviewはadvisoryであり、別人の人間承認、separation of duties、trusted authority receiptとは呼ばない。

### 5. manual-onlyで禁止する操作

- 回復用credential、token、secret、署名鍵、authority receiptの作成、発行、更新、消費
- Terminal HOLD lineage、ISSUE-194または回復目的の`review-round-exception`とrecovery Checkの作成・更新・再利用
- 回復workflow、例外workflow、activation workflowのdispatch
- succession、merge適格性の回復投影、runtime activation
- Ruleset、Environment、repository settings、GitHub App権限の回復目的での変更
- caller boolean、自由文comment、software-only keyまたはagent自己申告によるhardware境界の代用

ADR-0017のISSUE-173例外は、非凍結の通常PRに限って従来どおり評価できる。Terminal HOLD lineage、
ISSUE-194、回復停止方針または回復権限を扱うPRには適用しない。

### 6. H1、H2、H3を自動連鎖させない

ISSUE-194はH1としてmanual-only停止を文書化する。H1のmergeは次のIssue作成、実装、credential、
Check、activationを許可しない。名称を変更しても次の意味的境界を適用する。

- H2: credential、Check更新、workflow dispatch、settings変更、authority消費、activationを持たない
  非特権design-only / read-only verifier検討。H1 merge後にOwnerが明示判断した場合だけ、最大1 Issue、
  最大3巡、例外なしで検討でき、失敗時に自動後継を作らない
- H3: hardware-bound recovery authorityの発行・消費・activation検討。hardware security keyが実際に
  利用可能で、かつOwnerが別Issueを明示判断した場合だけ最大1 Issue、最大3巡、例外なしで検討できる

hardware security keyがない間は、H2や別Issueの有無にかかわらずH3と全recovery authorityを`BLOCKED`と
する。OwnerがH2 / H3を判断しない場合はH1を再開せず、manual-only停止を維持する。

### 7. ISSUE-194の有限review

Roundは最初のroleを開始した時点で消費する。開始前にround ID、merge-base、head SHA、次の3 role、
固定principal、期限を確定し、同一値を全reviewerへ渡す。

1. Spec / Acceptance
2. Security / Authority Boundary
3. Operations / Liveness / Rollback

Round 1または2の完全bundleにcontent findingがある場合、remediationを行うなら全findingをstable IDと
固定reasonへ正規化し、巡ごとに正確に1つのbounded修正batchへ統合する。remediationしない場合は
`blocked`で終了する。修正後は新head SHAで次巡を行い、旧reviewを合格証跡へ使わない。

どのRoundでもreviewer不足・交代、timeout、schema違反、SHA不一致、scope変更、Round開始後の
main / head変更、finding batch外の変更があれば、そのRoundを消費してISSUE-194を即時`blocked`とする。role再実行や
同一Roundの再作成はしない。Round 3のcontent finding、判断不一致または検証失敗も`blocked`とする。
第4巡、budget reset、ISSUE-173例外、自動後継Issueを使用しない。

全reviewとrequired Checksが成功してもauto-mergeは予約せず、Repository Ownerが手動squash mergeを
判断する。

## Consequences

### Positive

- Terminal HOLDを維持したまま、通常開発を既存の保護経路で継続できる。
- hardware security keyがない状態で、弱い代替証跡から回復権限が発行されることを防げる。
- reviewと修正回数が有限になり、同じ失敗の無限loopを防げる。

### Negative

- Loop Engineerの回復、例外発行、activationは利用できない。
- 将来回復を再検討するには、hardware境界を含む別の人間判断とIssueが必要になる。
- solo Ownerとagent reviewだけでは独立した人間承認を構成できない。

## Verification

- diffが本ADR、AGENTS、ADR-0017、Runbook、ISSUE-194、Issue台帳だけであること
- workflow、Ruleset、Environment、App、token、runtime、OpenAPI、testに差分がないこと
- `pnpm format:check`、`pnpm issues:check`、`pnpm pr:gate`、`git diff --check`が成功すること
- 最大3巡の独立reviewと、最終head SHAの一致を確認すること

## Rollback

Terminal HOLD凍結とrecovery authorityの`BLOCKED`は単調な安全状態とし、rollbackでも削除しない。
誤りを検出した場合はmanual-only停止を維持したままforward-fixする。通常planeの記述だけをrevertする
必要がある場合も、凍結対象、credential / Check / workflow禁止、H2 / H3非自動開始、activation禁止を
残す。H1はGitHub設定、credential、workflow、runtimeを変更しないため、外部状態のrollbackは不要である。

## References

- ISSUE-194 / GitHub Issue #392
- ADR-0017
- PR #355 / #361 / #389 / #391
- GitHub Issue #362 / #390
- `AGENTS.md`
- `docs/api-driven-development/codex-automation-runbook.md`
