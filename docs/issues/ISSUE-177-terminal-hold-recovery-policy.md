---
id: ISSUE-177
title: Terminal HOLD制御基盤の回復方針をADRで固定する
priority: P0
status: blocked
size: S
created_at: 2026-08-06
github_issue: 362
release_gate: development_governance
requires_human_review:
  - security
  - operations
  - repository_owner
---

# ISSUE-177: Terminal HOLD制御基盤の回復方針をADRで固定する

## 目的 (Why)

PR #355とPR #361のTerminal HOLDを監査記録として固定し、レビュー上限を迂回せずに
Loop Engineer v2へ一度だけ移行する回復方針を確定する。

## スコープ (What)

- PR #355 / #361とsource Issue、観測base SHA、source head SHA、停止理由の凍結
- immutable lineage anchor、bounded append-only attempt history、固定`merge-eligibility`投影の定義
- canonical finding集合、solo Owner authorization、3役agent evaluation receipt、機械可読な統一証跡schemaの定義
- 非特権bootstrap、Check Runのhead束縛、writer fencing、main freshness、rollbackの定義
- GitHub App権限契約と特権操作のactivation blockerの定義
- ISSUE-178の復旧権限とISSUE-179のv2制御基盤の責務、依存順、信頼境界、停止条件、rollback
- ADR-0017、AGENTS.md、Codex自動開発Runbook、read-only文書テストの更新

## やらないこと (Out of Scope)

- アプリケーションコード、OpenAPI、DB、Storage、workflowの変更
- GitHub App、Environment、Secrets、Ruleset、branch protection、repository settingsの変更
- GitHub Issue（ISSUE-178 / #363を含む）/ PR、Check、attestationの更新、workflow実行、merge
- PR #355 / #361へのpush、追加修正、第6巡review、reviewerの追加・交代、close
- 旧コード、commit、review、Check、attestation、例外証跡の後継利用

## 影響範囲

- `docs/adr/0017-loop-engineer-approval-boundary.md`
- `docs/api-driven-development/codex-automation-runbook.md`
- `docs/api-driven-development/recovery-evidence-v1.schema.json`
- `AGENTS.md`
- Terminal HOLD回復方針を固定するread-only unit test

OpenAPI、生成型、アプリruntime、DB、Storage、GitHub設定、実環境には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] `#354` / PR `#355`と`#358` / PR `#361`のsource head SHA、観測base SHA、Terminal HOLD理由を変更不能な移行元として記録する
- [x] PR #355 / #361の第6巡review、追加修正、Check作成・更新、例外workflow dispatch、merge、旧コード・review・Check・attestation・例外証跡の再利用を禁止する
- [x] Issue / PRの作り直し、同一diffのcopy、commitのcherry-pick、reviewer追加では回復できないと明記する
- [x] 回復対象をimmutable lineage anchor、bounded append-only attempt history、固定`merge-eligibility`投影に限定する
- [x] ISSUE-178 → ISSUE-179の責務、依存順、信頼境界、停止条件、rollbackを確定する
- [x] main移動、head移動、再実行、重複、pagination欠落、別App、未知field、不完全inventoryをfail-closedで扱う
- [x] Check Runをrepository、target PR、target head SHA、GitHub App ID、check nameへ束縛し、別headのCheck Run IDを更新しない
- [x] rollbackはrequired Checkのsuccessをfailureへ更新し、同一Check Run IDのfailureをreadbackしてからcontrollerを停止またはrevertする
- [x] 最終success PATCHが不明な場合は正確なCheck Run IDを再取得・readbackし、failureを確認できなければHOLDかつactivation blockedとする
- [x] Hana専用GitHub Appの必要権限契約に`Metadata: read`を明記し、実際のApp設定を変更しない
- [x] ISSUE-178の着手条件としてGitHub Issue #363の本文、受け入れ条件、依存関係、ADR-0017参照の同期と人間readbackを要求し、本Issueでは実施しない
- [x] `solo_maintainer` modeでは`prevent_self_review=false`、`can_admins_bypass=false`を固定し、Owner承認を独立reviewではなく意図確認として扱う
- [x] 回復を1回限りとし、通常3巡、ISSUE-173例外最大5巡、第6巡禁止を維持する
- [x] ISSUE-179の文書・コード・Draft PR / head確定までを非特権bootstrapとして許可し、特権操作と分ける
- [x] canonical finding 9件のstable ID、順序、件数、digestを固定し、不一致をHOLDにする
- [x] 3 role / distinct principalの署名検証receipt、replay・期限・unknown field拒否、activation blockerを固定する
- [x] `recovery_evidence_v1`を機械可読schemaへ一元化し、lineage / progression / attempt lifecycleを表現する
- [x] projectionをmain / progression / attemptへ直接束縛する
- [x] exclusive writer fencing、drain / quiescence barrier、GitHub側atomic main freshness、rollback順序を固定する
- [x] HOLDをpolicy、entry gate、runtime activationのstage scopeへ分ける
- [x] approval payloadとverification receiptを分離し、3者集合の同一対象・cross-record自己承認・replayを拒否する
- [x] authority / succession / progressionの状態遷移とattempt tuple一意性をinventory契約にする
- [x] writer barrierをbarrier / Check identity / canonical digestへ束縛し、同一Check Run IDのreadback順を固定する
- [x] projectionのsuccess / failureと固定reasonの組合せをschemaで制約する
- [x] round stateとFinding修正後の`round + 1` head progressionを固定する
- [x] PR #361のcloseは本方針のmain反映後に別途Repository Ownerが判断すると定める
- [x] Round 4のHOLD結果を保持し、1つのbounded remediation batchとexact-boundなRound 5を1回だけ許可する
- [ ] Repository Ownerの明示GOと、Security、Operations、Repository Owner観点のfreshな独立agent評価を同じheadで得る
- [x] 文書と文書テストだけで実行時の安全性を証明済みと扱わない
- [x] 対象文書テスト、`pnpm issues:check`、`pnpm format:check`が成功する
- [x] ISSUE-177統合修正では`pnpm pr:gate`とbuildを実行しない

## Previous blocked reason (resolved 2026-08-09)

最初の限定検証では構造契約10件中7件が成功し、Markdown断言3件が失敗した。同一turnで再実行せず停止した。
失敗は次の3条件であり、schema正負例、event lifecycle、projection束縛、writer barrierの構造検証は
成功していた。

- ADRの「#363同期・readback後に実装」とtestの固定文言「このgate前にISSUE-178を実装しない」の不一致
- ADRの「field一覧を複製せず」とtestの固定文言「Markdownへfield一覧を複製しない」の不一致
- ADRのpolicy/runtime分離表現と、句点を越えない80文字以内というtest正規表現の不一致

次のbounded batchで契約意味を変えず、これら3つの過剰な文言依存だけを構造条件へ変更した。対象testは
新しい1回の実行で10件すべて成功した。

## Round 2 review HOLD (remediation in progress 2026-08-10)

対象test 10件、`pnpm format:check`、`pnpm issues:check`が成功したreview直前snapshotをSecurity、Operations、
Repository Owner観点で1巡だけread-only reviewした。P0は0件、重複を統合したP1は次の7件である。

- `approval_receipt`全体を署名対象にしており、内部の署名payload digestとverification metadataを含む自己参照になる
- 3者receipt集合の同一target / main / head / succession / finding / run、cross-record自己承認、ID / nonce replayを検証しない
- authority / succession / progressionのissue、consume、revoke順序とatomicな1回限り消費をinventoryで検証しない
- writer barrier eventを同じbarrier / Check identity / writer tuple / canonical digestへ束縛せず、同一Check Run IDのsuccess / failure readbackを証明できない
- `progression_event`がauthority発行時にも評価完了済み`round_state`を要求する
- `projection_event`が`success + activation_blocked`などstatus / reason矛盾を許可する
- 異なる`attempt_id`による同一run / run attempt / OIDC `jti` tupleの再利用を検出しない

P2はopaque IDの用途別非PII形式と、`attestation` / `approval_receipt`語彙の統一である。Round 2のturnでは
修正巡、テスト再実行、追加reviewを行わず停止した。2026-08-10の明示指示で、上記を3機械契約へ統合した
次のbounded batchを開始した。サブエージェントreviewは未完の人間3者ACを満たさない。

## Round 2 remediation result (2026-08-10)

P1 7件をapproval、lifecycle、writer / projectionの3契約へ統合した。署名対象の自己参照を除き、3者集合の
cross-record不変条件、authority / succession / progression状態遷移、attempt tuple一意性、barrier / Check identity、
canonical barrier digest、status / reason組合せをschemaとnegative fixtureで検証する。対象testは1回で10件すべて
成功した。Round 3はこの最終snapshotを変更せず1巡だけ実施する。

## Round 3 review HOLD (2026-08-10)

review直前snapshotでは対象test 10件、`pnpm format:check`、`pnpm issues:check`が成功した。通常上限の
Round 3を同一snapshotでread-only実施し、OperationsはGO、SecurityとRepository OwnerはHOLDだった。
P0は0件、重複を統合したP1は次の2件である。

- lifecycle partitionが未定義で、別lineage / authority / succession / target / approval集合のeventをspliceできる。検証済み3 receiptからのcanonical approval set digest、同一partition identity、succession消費後だけのprogression発行が必要
- progression stateが`lineage_id + progression_id`で分離されず、round stateの`evaluation_completed → completed_with_findings | finding_free`遷移も未定義である。新head progressionと未評価`finding_free`の負例が必要

P2はapprovalの`issued_at <= evaluationAt < expires_at`、RFC 8785準拠実装または公式test vectorである。
Round 3が通常上限のため、Round 4、reviewer交代、追加修正、テスト再実行へ進まず停止する。
サブエージェントreviewは未完の人間3者ACを満たさない。

## Round 4 remediation candidate (exception gate blocked 2026-08-10)

明示的な人間指示により、Round 4を実施せず、上記P1 2件だけを1つのbounded batchで是正した。
承認集合digestを3つの検証済みreceipt全体から一意に導出し、lineage / progression / attemptを独立partitionへ
分離した。progression発行を同じsuccession消費へ束縛し、round stateを
`evaluation_completed → completed_with_findings | finding_free`の二択に限定した。別target接合、未消費
succession、直接`finding_free`、旧progression失効前の新progression、attempt tuple再利用をnegative fixtureで
拒否する。

このcandidateでは対象test 10件、`pnpm format:check`相当、`pnpm issues:check`、`git diff --check`が成功した。
ただし、ISSUE-173準拠のRound 4例外は未発行であり、Round 4 reviewも未実施である。GitHub readbackでは
`LOOP_ENGINEER_DISPATCHER_LOGIN`、Environmentの唯一のrequired reviewer、workflow実行actorがすべて
`Kazuya-Sakashita`で、repository collaboratorも同一1名だけだった。`prevent_self_review=true`へ変更すると
現行workflowの承認経路が閉じるため、Environment変更、例外workflow dispatch、Round 4を行わず`blocked`を
維持する。別のGitHub Userをdispatcherまたはrequired reviewerとして明示的に用意し、最終PR headへ束縛した
1回限りの例外を発行できるまで進めない。

## Solo-maintainer governance decision (2026-08-11)

Repository Ownerは個人開発で追加の人間GitHub Userを用意できないことを明示し、`solo_maintainer` modeの採用を
指示した。人間の意思決定者はRepository Owner 1名とし、保護Environmentの同一Owner承認は独立した人間review
ではなくexact-boundな操作意図と最終責任の記録として扱う。Security、Operations、Repository Owner観点は、
同じheadをroleごとのfresh contextで評価する3つのagent principalへ分離する。

この決定はRound 2 / 3時点の「subagent reviewは人間3者ACを満たさない」という旧受け入れモデルだけを
置換する。過去Finding、通常3巡の消費、Round 4例外要件、凍結sourceのHOLDはresetしない。

`prevent_self_review=false`、`can_admins_bypass=false`、GitHub署名付きOIDC、専用App Check、Issue / PR /
main / head / 最大round束縛を維持する。ただし、人間のseparation of duties、悪意あるOwner、侵害されたOwner
identityへの耐性は提供せず、その安全性を主張しない。ISSUE-177のRound 4は1回だけとし、その結果を
上書きまたはresetしない。P0 / P1が0件ならOwnerの完了判断へ進む。P0 / P1が残った場合は、Ownerの明示指示に
よる1つのbounded remediation batchと、修正済みの1つの最終headに対するRound 5を1回だけ許可する。

## Round 4 HOLD preservation and bounded Round 5 authorization (2026-08-11)

Round 4はmain `e6c891ecde1ba3f51b739361d3cd3de4433835a3`、PR #389 head
`85b12486c5f98af52f9d2567ef7c637e0fe70c0f`、workflow run `31449803907`、専用App Check Run
`93651892231`へ束縛して1回だけ実施した。Security、Operations、Repository Owner観点はいずれも
P0 0件、P1 3件で`HOLD`と判定し、重複を統合したP1は次の5分類である。

- freshな新head progressionと消費済みsuccessionの旧head / approval digest束縛が両立しない
- immutable lineage anchorとlineageあたり1つのsuccessionがaggregate validatorで強制されない
- 3役のdecision、P0 / P1件数、Owner authorizationから`finding_free` / successを導出できない
- progression失効後の`round + 1`連続性とround reset拒否が強制されない
- activation gateが、gate通過後にだけ作成可能なprogression / attempt / writer barrierを先に要求する

このRound 4結果、reviewed head、Finding、role別件数、workflow / Check Runを削除、成功扱い、上書き、reset
してはならない。Repository Ownerは2026-08-11に、この5分類だけを扱う1つのbounded remediation batchと、
修正済みの1つの最終headに対するexact-boundなRound 5を1回だけ明示的に許可した。ガバナンス改定から
技術是正完了までを同じbatchとして扱い、中間headへ例外Checkまたは専門reviewを発行しない。

Round 5はIssue / PR / current main / final head / `max_round=5`へ束縛した専用App Checkの成功後、Security、
Operations、Repository Owner観点を同じ最終headのfresh contextで1回ずつ評価する。P0 / P1が0件ならOwnerの
完了判断へ進む。1件でも残ればTerminal HOLDとし、Round 6、追加batch、reviewer追加・交代、別Issue / PR、
別headへの自動継続を禁止する。PR #355 / #361の凍結と旧証跡再利用禁止は変更しない。

## セキュリティ・プライバシー考慮

唯一のallowlistは`docs/api-driven-development/recovery-evidence-v1.schema.json`とする。record typeは
`lineage_anchor`、`approval_receipt`、`lineage_event`、`progression_event`、`attempt_event`、
`writer_fence_event`、`projection_event`だけとし、Markdownへfield一覧を複製しない。

schemaは署名前の`approval_payload`と検証後の`verification_receipt`を構造的に分離する。canonical署名対象は
`record_reference`の4 fieldと`approval_payload`だけであり、verification metadataは含めない。trusted verifierの
status-only receipt、stableな非PII actor / requester / issuer principalを要求する。用途別prefixとdigest形式、enum、
`unevaluatedProperties: false`で型違反、未知field、自由文、PIIを拒否する。raw token、raw claim、署名、login、
氏名、メール、PR / review本文、prompt、生成本文、secretを読取・log・artifactへ含めない。OIDC `jti`と
fencing tokenはSHA-256値だけを保存する。

## canonical fixed finding集合

集合はISSUE-174 / `#358`、PR `#361`、source head
`514d8c64d252b22fb84f7b7834ae690025896882`へ束縛する。UTF-8の記載順でLF結合し、末尾LFなしで
SHA-256を計算する。stable ID、順序、9件という件数、digestの正本は
`docs/api-driven-development/recovery-evidence-v1.schema.json`の`lineageAnchor` constであり、Markdownへ
ID一覧を複製しない。固定digestは`52450c49b3852ceedd838c975f6854ec43009ba70f645630ecd00f826da787a1`である。

空集合、欠落、重複、余分なID、順序、件数、digestの不一致は`HOLD`にする。旧reviewは合格証跡として
再利用せず、未解決FindingをISSUE-179の安全要件として継承し、target headのfresh reviewで評価する。

## 非特権bootstrapとsolo Owner authorization / 3役agent evaluation receipt

#363同期と人間readbackのentry gate後にISSUE-178を実装し、mainへ入れる。その後、ISSUE-179の文書・コードを作成し、Draft PRを開いてtarget PR / headを
確定する。ここまではCheck更新、復旧権限発行・消費、`merge-eligibility`のsuccess、merge予約を行わない
非特権bootstrapである。

target PR / head確定後にSecurity、Operations、Repository Ownerを別roleとして要求し、同じidentity providerと
repository scopeでdistinctなstable非PII agent principalを検証する。3件でrecord reference、target、main / head、
succession、finding digest、approval run、requester / issuerを同一にし、actor集合とrequester / issuer集合を
非交差にする。role、actor、approval ID、nonceの重複、cross-record自己承認、replay、期限切れ、署名またはreceipt
不正、未知field、不一致を拒否する。
検証後に復旧権限を発行して1回限りのsuccessionを消費し、その後だけ特権操作を開始する。

Owner authorizationは保護Environment、GitHub署名付きOIDC、専用App CheckをIssue / PR / main / head /
最大roundへ束縛する。Owner authorizationまたは3役agent評価のdistinct actor、role、署名、replay防止を
検証・readbackできるまで、非特権bootstrap後のactivationをblockedにする。

## head progressionとmerge適格性

successionはlineageについて1回だけ消費する。round stateは`evaluation_completed`、
`completed_with_findings`、`finding_free`とする。Finding修正後の新headは旧headの
`completed_with_findings`から`round + 1`へ進め、旧round successを要求しない。ただし
`completed_with_findings`をmerge適格性に使用しない。

head変更時は旧headのprogression authorityとfencing generationを失効させ、freshなOwner authorization、
3役agent評価と新head専用のprogression authorityを要求する。successionは再消費しない。mainだけの変更は
freshなOwner authorization、3役agent評価と新attemptで
同じprogressionを再試行する。

復旧権限発行 → succession発行 → atomic compare-and-setによる未消費から消費済みへの遷移を要求する。
progression authority発行前のround state / fencing event、失効後利用、orphan、順序逆転、二重発行・消費を
拒否する。round stateは専用eventだけ、writer generationはfencing generation eventだけに記録する。
run / run attempt / OIDC `jti` hashのtupleはlineage内で正確に1つのattempt IDへ対応させる。

## Check Run安全契約

Check Runはrepository、target PR、target head SHA、GitHub App ID、check nameへ束縛する。PATCH前に
完全inventoryから5要素が一意に一致する正確なCheck Run IDを再取得し、別headで作成されたCheck Run
IDを更新しない。Hana専用GitHub Appの必要権限契約は`Checks: write`と`Metadata: read`を含むが、
本Issueでは実際のApp設定を変更しない。

success遷移前にtarget PR / head単位のexclusive `writer_generation`またはfencing tokenを取得して
readbackし、下位generationの新規outbound writeを遮断する。in-flight writerをdrainし、遅延PATCHが残らない
quiescenceを確認した後だけ現在generationがsuccessを書ける。各projectionはtarget PR / head、main、
progression、attempt、App / Check / Check Run ID、writer generation、barrier ID / digestへ直接束縛する。
全barrier eventは同じidentity tupleを再掲し、generation取得からquiescence確認までをRFC 8785で
canonicalizeしたSHA-256を後続eventとprojectionへ束縛する。`success`は`finding_free` reasonだけに限定し、
その他の固定reasonは必ず`failure`にする。main freshnessはGitHub merge queue SHA、
strict up-to-date、または同等のGitHub側原子的条件へ束縛する。main変更eventと直前readbackだけでは
原子性を主張せず、原子的条件が成立しない間はsuccessを許可しない。

Check PATCH credentialは単一のtrusted holderだけが保持し、workerへ渡さない。すべてのPATCHをholderへ集約し、
holderが下位generationのrequestを拒否することで実効的に遮断する。

最終`success` PATCHの応答がtimeout、切断、または成否不明なら、fail-closedを証明済みと主張しない。
現在writerより上位generationのtrusted invalidatorだけがgeneration取得、下位generationの新規write遮断、
drain開始、quiescence確認の順にbarrierを完了してから正確なCheck Run IDを再取得する。
同一Check Run IDのsuccessをreadbackした場合だけ同じIDを`failure`へ更新し、同一IDのfailureをreadbackする。
controller停止後も同じIDの最終failureを確認する。
barrierまたはfailure readbackを完了できなければ`runtime_activation_gate`を`HOLD`にする。

## stage順とactivation blocker

stage順は`issue_177_policy` → `issue_178_entry_gate` → `issue_178_non_privileged_implementation` →
`issue_179_non_privileged_bootstrap` → `runtime_activation_gate` → `privileged_recovery`とする。
`issue_178_entry_gate`ではGitHub Issue #363の本文、受け入れ条件、依存関係、ADR-0017参照を本方針へ同期し、
人間がreadbackする。このgate前にISSUE-178を実装しない。本IssueではGitHub Issueを変更しない。

`hana-merge-human-approval`は`prevent_self_review=false`、`can_admins_bypass=false`をsolo modeの固定値とする。
Owner本人の承認は独立reviewではなくexact-boundな意図確認である。Owner authorizationと3役agent evaluation
receiptの検証、復旧権限発行、Check更新、merge適格化を分離し、どれか1件でも欠ければ特権操作を開始しない。

ISSUE-177のreview gateはOwnerの明示GOと3役agent評価であり、ISSUE-179 target headへのruntime receiptではない。
対象文書テストが成功し、Owner GOと3評価が揃えば、GitHub Issue #363の同期が未完でも
ISSUE-177は完了できる。後続blockerの未解消だけを理由に修正・再reviewを繰り返さず、具体的な方針上の
findingがある場合だけ本Issueを修正する。Round 4の具体的findingは、上記の1つのbounded remediation batchと
exact-boundなRound 5でだけ再判定し、追加batchまたはRound 6へ進めない。

## 停止条件

HOLDはstage scopeを持つ。方針文書、schema、契約testの具体的findingは`issue_177_policy`を止める。
#363の未同期/readback不足は`issue_178_entry_gate`を止める。solo Owner authorization、3役agent runtime receipt、復旧権限、
完全inventory、writer barrier、atomic freshnessの不備は`runtime_activation_gate`以降だけを止める。
後続stageの未達でISSUE-177を修正loopへ戻さず、前stageのHOLDを後stageで迂回しない。第6巡、追加reviewer、
旧証跡再利用は常に禁止し、source headへ新しいCheckが投影されても凍結anchorを更新しない。

## Rollback

文書変更をrevertしてもPR #355 / #361のTerminal HOLDを解除しない。rollback開始時にtarget PR / headの
exclusive writer generationを上位のtrusted invalidatorへ移し、次の順を変更しない。

1. 上位writer generationを取得してreadbackする。
2. 下位generationの新規outbound success書込みを遮断する。
3. 下位generationのin-flight writerのdrainを開始する。
4. 遅延PATCHが残らないquiescenceを確認する。
5. 同一Check Run IDのsuccessをreadbackする。
6. required Checkを`failure`へ投影し、同一Check Run IDのfailureをreadbackする。
7. controllerを停止またはrevertする。
8. 同一Check Run IDの最終failureをreadbackする。

fencingを取得できない、drain / quiescenceを証明できない、success応答不明を上位generationでfailure化できない、failure readbackを確認できない
場合は`runtime_activation_gate`を`HOLD`にする。ISSUE-178の権限は未発行またはfailureとして扱い、新たな
後継、第6巡、reviewer追加では回復しない。

## 参考

- GitHub Issue #362
- ISSUE-172 / GitHub Issue #354 / PR #355
- ISSUE-173 / GitHub Issue #356
- ISSUE-174 / GitHub Issue #358 / PR #361
- ISSUE-175 / GitHub Issue #359
- ISSUE-178 / GitHub Issue #363
- ISSUE-179 / GitHub Issue #364
- ADR-0017
- `docs/api-driven-development/codex-automation-runbook.md`
