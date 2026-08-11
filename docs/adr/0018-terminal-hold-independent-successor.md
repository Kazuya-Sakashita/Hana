# 0018. Terminal HOLD後の独立後継プロトコル移行

- Status: proposed
- Activation: blocked
- Date: 2026-08-11
- Decider: Repository Owner
- Governance Issue: ISSUE-193 / GitHub Issue #390
- Transition grant: external status-only exact-head record required; not embedded in this ADR
- Activation gate: G1〜G3、trusted verifier、runtime完全inventory、writer fencing、atomic main freshness、rollback readbackを完了し、別のpre-activation human GOを得ること

## Context

ISSUE-177 / PR #389は、main
`e6c891ecde1ba3f51b739361d3cd3de4433835a3`とhead
`24a85f9ed31c28d3a14ede45f891a1386699be9e`へexact-boundしたRound 5で、3つの専門観点すべてが
P1を報告してTerminal HOLDとなった。Round 6、追加修正、reviewer交代、別headへの載せ替えは、
review上限を無意味にするため許可できない。

一方、Terminal HOLDを問題領域全体の永久停止と解釈すると、安全な別設計も開始できない。
これは有限の安全停止を、回復不能なliveness failureへ変える。必要なのはRound 5の結果を弱める
例外ではなく、凍結campaignを終了したまま、別protocol majorの設計を有限回だけ許可する状態遷移である。

Round 5のexact metadataと6件の無損失finding recordは
`docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json`に固定する。本ADRは旧branchの
実装、schema、test、reviewまたはCheckを正しい成果物として採用しない。

## Decision

### 1. Terminal HOLDの適用単位

Terminal HOLDは、対象candidate revisionとreview campaignの不可逆な終端である。対象Issue、PR、
headにはpush、追加修正、追加review、reviewer追加・交代、Check作成・更新、例外workflow、mergeを
行わない。Issue、PR、branch、head、reviewer、caller申告のlineage IDを変更しても、同じartifact familyの
campaignを新設したことにはならず、review budgetをresetしない。

PR #355、#361、#389とIssue #362は凍結を維持する。Round 5のP1、terminal manifestおよび最終判定を
削除、成功扱い、未完review扱い、Round 6へ変更しない。Terminal HOLDは問題領域全体を永久停止する
規則ではないが、後継を自動的に許可する規則でもない。

### 2. 一度限りのtransition grant

Repository Ownerは、G0の最終headに対して1件の`protocol_v2_transition_grant`だけを発行できる。
grantは再委任不能で、accepted、rejected、expired、重複・不明によるTerminal HOLDのいずれでも
消費済みとなる。期限切れ、digest不一致、対象変更、二重消費、不明なfieldはfail closedで拒否する。
再発行、連鎖grant、v1 campaignの再開は禁止する。

grantは少なくとも次へexact-boundする。

- repository / Owner stable ID、audience、transition ID、program ID、protocol major
- origin main commit / tree、判断時点のcurrent main、G0のfinal commit / tree
- terminal manifest、requirements、threat model、artifact scopeの各digest
- 入力allowlist、禁止artifact集合、review policy、fixed principal set、D1 / V1 / V2評価集合の各digest
- grant contractと全binding payloadのdigest、有効期限、nonce digest、Ownerの明示判断

Issue番号、PR番号、branch名、callerが渡すlineage IDだけではprogram identityを構成しない。
具体的なcanonical projection、digest、record schema、fixed principal、state reducerは
`docs/governance/loop-engineer/recovery-protocol-v2-binding-inputs.json`とcharterを正とする。grantは
GitHub Issue #390のJSON-only commentへ保存し、GitHubが認証したOwner ID、comment envelope、全pageの
完全inventoryを検証する。commentの編集、削除、重複、unknown field、別repository / Issue / PRは拒否する。

状態遷移は`NOT_ISSUED → ISSUED → ACCEPTED_CONSUMED | REJECTED_CONSUMED`だけを正常経路とする。
acceptedは別の書込みで作らず、唯一のissued record、PR merge、decision mainとmerge parentの一致、
final head treeとaccepted main treeの一致から導出する。同じmerge readbackは冪等である。terminal stateは
書き換えず、accepted後の停止は別のappend-only `program_halted` recordで表す。

### 3. Independent successorのprovenance

後継は`independent successor protocol`と呼ぶ。solo-maintainer環境で認知的なclean-roomを証明したとは
主張せず、入力とartifactのprovenanceだけを監査する。

許可する入力は、指定したorigin mainのtree、terminal manifest、6件のstable finding requirement、
公開標準、G0で新規に定義したv2 requirements / threat modelに限定する。

PR #355、#361、#389のbranch-only code、commit、diff、patch、schema、validator、test、fixture、
review、Check、attestationを、実装素材、oracle、fixture、合格証跡、activation入力として使用しない。
cherry-pick、patch適用、hunk copy、旧branchからの派生も禁止する。類似度scanは補助的な警告であり、
それだけで独立性を証明しない。

禁止commit、全branch-only objectのcount / digest、branch-only blob、stable patch ID、変更pathと、
origin main tree allowlistの導出規則・期待digestは
`docs/governance/loop-engineer/frozen-artifact-provenance.json`へ固定する。candidateで禁止head ancestry、
commit、blobまたはpatch IDが一致すればfail closedとし、意味的類似だけは警告に留める。

### 4. 固定deliverableと順序

programは次の4 deliverableに固定し、G0からG3まで直列に進める。deliverableの追加、分割、改名による
review budgetのresetを禁止する。

| ID  | 成果物                                     | 特権操作 |
| --- | ------------------------------------------ | -------- |
| G0  | governance、manifest、provenance、有限予算 | 禁止     |
| G1  | formal contractと独立read-only oracle      | 禁止     |
| G2  | trusted verifier真正性、replay、authority  | 禁止     |
| G3  | runtime controller、fencing、projection    | 禁止     |

G0のmain反映とtransition grant消費前にG1を開始しない。G1〜G3はそれぞれ1 Issue / 1 PRとし、前段が
mainへ入る前に後段を開始しない。旧GitHub Issue #363 / #364はG0 main反映後も旧v1設計の監査記録として
保持し、本文をv2へ転用しない。新しいv2 Issueから`superseded`関係だけを明示する。

### 5. 有限review budget

各deliverableは次の3 snapshotだけを持つ。

1. `D1`: 実装前のscope、threat model、failure modelのread-only評価
2. `V1`: 初期candidateのexact-head評価
3. `V2`: remediationの有無にかかわらず必ず行うexact-final-head評価

Security、Operations、Repository Owner perspectiveの3 roleとstable principal IDをD1で固定し、途中交代、
同一principalの複数role、欠落、重複を拒否する。1 snapshotは同一bindingを評価した3 role recordの完全な
stage bundleであり、role record 3件を3 snapshotとは数えない。各recordはprogram、deliverable、stage、
principal、base / headまたはscope digest、finding digest、severity count、verdict、issued-atへ束縛する。

D1またはV1でP0があれば即Terminal HOLDとする。D1のP1はinitial implementation backlogへ固定する。
V1でP1がある場合だけ、finding backlogをdigest固定して1 batchの修正を許す。V1がGOでも同じheadへ
V2を必須とする。V2でP0/P1が残る、新しいP0/P1が見つかる、inventoryが不完全、principalが欠ける、
digestが一致しない、またはscope変更が必要な場合はprogram全体をTerminal HOLDにする。

上限は4 deliverable合計で12 stage bundle、4 remediation batchである。正常なV2完了は予算を使い切るが
違反ではなく、4件目のsnapshotまたはV2後の修正を試みた時点でTerminal HOLDにする。停止後は追加round、
reviewer交代、Issue追加、scope分割、自動後継、grant連鎖を行わない。scope digestはscope creepの検出に
使い、新しいP0/P1をscope外として無視するためには使わない。

### 6. Bootstrap時のtrust境界

既存の別trust-domain署名verifierが利用可能なら、transition判断にも使う。利用できない場合、G0は
GitHub write tokenまたは復旧credentialを持たない3 roleのfresh read-only advisoryと、Repository Ownerの
別個の明示判断でbootstrapできる。このadvisoryを独立した人間review、trusted receipt、人間の職務分離、
または悪意あるOwnerへの耐性とは呼ばない。

ただしG2完了前にrecovery credentialを発行せず、trusted verifierがOIDC署名、issuer、audience、subject、
repository ID、workflow / ref、environment、run、`jti`、期限を検証するまで、succession消費、Check更新、
success投影を行わない。verifierはproduction writerとcredential、entrypoint、dependency graph、parser、
canonicalizer、decision codeを共有せず、successを更新する権限を持たない。

### 7. Round 5 findingをv2 entry requirementにする

次の6件すべてをG1〜G3の受け入れ条件と負例へ変換する。1件でも未検証ならactivationはHOLDとする。
各recordのsource finding、threat、invariant、negative example、runtime proof、担当deliverableをterminal
manifestへ固定し、IDまたは短縮文だけへ弱めない。特にattempt上限は1 round 3件・1 lineage 15件である。

1. `R5-GLOBAL-LINEAGE-UNIQUENESS`
2. `R5-VERIFIER-AUTHENTICITY-REPLAY`
3. `R5-SUCCESS-CROSS-RECORD-BINDING`
4. `R5-ATTEMPT-BOUNDS`
5. `R5-MAIN-REFRESH-REACHABILITY`
6. `R5-INVENTORY-FRESHNESS-PROOF`

### 8. Activationは別判断にする

G0〜G3のmergeはactivationを意味しない。trusted verifier真正性、program-global replay拒否、完全な
runtime inventory、writer fencingとdrain / quiescence、GitHubが強制するatomic main freshness、rollback
invalidationの最終readbackが揃った後、別のpre-activation human GOを必要とする。

それまではrecovery credential発行、succession消費、Check作成・更新、`merge-eligibility` success投影、
runtime activationを禁止する。

### 9. G0 main freshness

V2の3 role、Owner grant、merge判断は同じdecision mainとfinal headへ束縛する。V2後にmainが移動した
場合はこの一度限りのtransitionを`REJECTED_CONSUMED`として終了し、rebase、update-branch、head更新、
追加reviewまたはrefresh grantを行わない。G0のrefresh budgetは0である。

merge直前にcurrent mainがdecision mainと一致し、active Rulesetのstrict up-to-date条件が有効であることを
完全readbackする。merge後はPRのmerged head、merge commitのfirst parent、accepted main treeをreadbackし、
それぞれgrantのfinal head、decision main、final head treeと一致する場合だけ`ACCEPTED_CONSUMED`とする。

## Consequences

### Positive

- Round 5の失敗を上書きせず、問題領域の永久停止だけを解消できる。
- review予算と停止条件が有限で、Issueやheadの載せ替えによるループを防げる。
- v2の入力と旧artifactの境界を機械可読manifestで監査できる。

### Negative

- 旧成果物を実装素材として再利用できず、G1〜G3をmainから再設計するコストがかかる。
- solo Ownerの侵害や悪意、agent間の相関誤り、GitHub trust domainの侵害には耐性を持たない。
- GitHub側でatomic freshnessやexclusive writerを実現できなければ、v2完成後もactivationはHOLDになる。
- 一度限りのgrantが失敗すると、このprogramには再試行経路がない。

## Rollback

G0 merge後でもgrantがまだissued状態なら、G1を開始せず`REJECTED_CONSUMED`へ進める。すでに
`ACCEPTED_CONSUMED`ならgrantを変更せず、別の`program_halted` recordをappendしてG1以降を禁止する。
すでにG1以降を開始している場合も同じhalt recordでprogram全体を停止し、credential、Check、succession、
activationを発行しない。PR #355、#361、#389とIssue #362の凍結状態はrollbackの影響を受けない。

## References

- ISSUE-193 / GitHub Issue #390
- ISSUE-177 / GitHub Issue #362
- Draft PR #389
- ADR-0017
- `docs/governance/loop-engineer/frozen-artifact-provenance.json`
- `docs/governance/loop-engineer/issue-177-round5-terminal-manifest.json`
- `docs/governance/loop-engineer/recovery-protocol-v2-binding-inputs.json`
- `docs/governance/loop-engineer/recovery-protocol-v2-charter.json`
- `docs/api-driven-development/codex-automation-runbook.md`
- `AGENTS.md`
