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
一方で、通常開発まで停止する必要はない。既存RulesetとHana App required Checksは通常PRの
merge-control証跡として利用できるが、回復権限の発行やactivationとは異なる。

ADR番号0018は凍結lineageで使用された識別子との衝突を避けるため予約し、そのbranch-only内容を
本ADRへ取り込まない。

## Decision

### 1. 2つのplaneを分離する

| plane                | 対象                                                                                                            | 現在の状態             |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- |
| normal merge-control | 通常PRの`pr-gate`、`validate`、`local-registry`、`specialist-review-gate`、`merge-eligibility`と人間のmerge判断 | 継続可能               |
| recovery authority   | review例外、回復credential、succession、recovery Check、権限消費、runtime activation                            | manual-onlyで`BLOCKED` |

normal merge-controlのCheckがsuccessでも、recovery authority、Terminal HOLD例外、credential、
activation、production操作または自動merge予約を付与しない。

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
- 通常PRに対する既存RulesetとHana App required Checks
- 人間とread-only agentによる状態確認、文書監査、通常の最大3巡review
- required Checksとreviewが揃った通常PRをRepository Ownerが手動squash mergeする判断
- 回復を停止したまま維持する判断

agent reviewはadvisoryであり、別人の人間承認、separation of duties、trusted authority receiptとは呼ばない。

### 5. manual-onlyで禁止する操作

- 回復用credential、token、secret、署名鍵、authority receiptの作成、発行、更新、消費
- `review-round-exception`その他の回復Checkの作成・更新・再利用
- 回復workflow、例外workflow、activation workflowのdispatch
- succession、merge適格性の回復投影、runtime activation
- Ruleset、Environment、repository settings、GitHub App権限の回復目的での変更
- caller boolean、自由文comment、software-only keyまたはagent自己申告によるhardware境界の代用

### 6. H1、H2、H3を自動連鎖させない

ISSUE-194はH1としてmanual-only停止を文書化する。H1のmergeはH2 / H3のIssue作成、実装、credential、
Check、activationを許可しない。

H2 / H3を検討する場合は、Repository OwnerがH1 merge後のmainを読み直し、別Issueを作成するかを
改めて判断する。hardware security keyがない間、実権限を扱うH3は`BLOCKED`のままとする。

### 7. ISSUE-194の有限review

1巡は同一merge-base、Issue、head SHA、diffに対する次の独立3観点の完全bundleとする。

1. Spec / Acceptance
2. Security / Authority Boundary
3. Operations / Liveness / Rollback

Round 1または2にfindingがある場合、Issue Captainは全findingを固定し、巡ごとに1つのbounded修正batchへ
統合できる。修正後は新head SHAで次巡を行い、旧reviewを合格証跡へ使わない。

Round 3でfinding、判断不一致、scope変更、reviewer不足、timeout、SHA不一致または検証失敗が残れば、
ISSUE-194を`blocked`として終了する。第4巡、reviewer交代によるbudget reset、ISSUE-173例外、
自動後継Issueを使用しない。

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

ISSUE-194の文書PRをrevertする。H1はGitHub設定、credential、workflow、runtimeを変更しないため、
外部状態のrollbackは不要である。Terminal HOLD対象はrevert後も変更せず、通常開発はrevert後のmain規約と
既存Rulesetに従う。

## References

- ISSUE-194 / GitHub Issue #392
- ADR-0017
- PR #355 / #361 / #389 / #391
- GitHub Issue #362 / #390
- `AGENTS.md`
- `docs/api-driven-development/codex-automation-runbook.md`
