# 0017. Loop Engineerの自動マージ適格性と人間承認境界

- Status: accepted
- Activation: deferred
- Date: 2026-08-03
- Deciders: kazuya
- Human review: Security approved, Operations approved
- Activation gate: ISSUE-164、ISSUE-165、ISSUE-166を完了し、ISSUE-167のdry-run後に人間がGOを出すこと
- Terminal HOLD recovery: ISSUE-177 policy acceptance pending、runtime activation deferred
- Recovery review gate: Security、Operations、Repository Ownerによる方針文書の独立確認

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

通常の自動判定と監査へ保存してよいのは、Issue ID、PR番号、head SHA、変更領域ID、reviewer role、
round、actionable finding件数、必須check名とstatus、固定された最終判定reasonである。Terminal HOLD回復は
このallowlistの機械可読な唯一の正本を
`docs/api-driven-development/recovery-evidence-v1.schema.json`とする。ADR、Runbook、Issueへfield一覧を
複製せず、このschema IDとrecord typeを参照する。schemaは`additionalProperties`または
`unevaluatedProperties`を禁止し、次のrecordだけを許可する。

- `lineage_anchor`: root / terminalのIssue、PR、base / head SHA、target、1回限りのsuccession、finding集合
- `approval_receipt`: 署名対象digest、trusted verifier receipt、検証済みactor / requester / issuer principal
- `lineage_event`: 復旧権限とsuccessionの発行、消費、失効
- `progression_event`: progression authority、round state、fencing generationの発行、失効
- `attempt_event`: start、success、failure、cancel、timeout
- `writer_fence_event`: generation取得、下位writer遮断、drain、quiescence、failure投影とreadback
- `projection_event`: current main / head / progression / attemptから固定`merge-eligibility`への投影

lineage anchorは可変なmain SHA / target head SHAを含めない。その他のrecordは`record_reference`で
`lineage_id`と`lineage_anchor_digest_sha256`へ束縛する。projectionは`progression_id`、`attempt_id`、
`main_sha`を直接持ち、writer generationからattemptへの暗黙参照だけに依存しない。

署名前の`approval_payload`と検証後の`verification_receipt`を構造的に分離する。canonical署名対象は
`record_reference`の4 fieldと`approval_payload`だけであり、署名対象digest、verifier、verification status / digestは
署名対象外の派生metadataとする。raw token、raw claim、署名、loginは保存せず、検証済みのstableな非PII
principal IDだけを保存する。actor、requester、issuerは同じidentity providerとrepository scopeで比較し、
同一principalや同一人物から派生した複数IDをdistinct actorとして扱わない。

ID、digest、timestamp、role、check name / reasonはschemaのpattern、長さ、固定enumに従う。自由文を許可fieldへ
格納せず、PII、氏名、メール、PR本文、review本文、prompt、生成本文、token、OIDC claim全文、secretを
取得・保存・出力しない。OIDC `jti`とfencing tokenはSHA-256値だけを保存する。

PR本文、コメント本文、review prompt全文、実ユーザー情報、画像、画像URL、storage key、AI prompt、
AI生成本文、氏名、メール、token、OIDC claim全文、secret、接続文字列は取得・artifact保存・ログ出力しない。

### 10. 段階有効化

本ADRのmergeだけでは自動マージを有効にしない。

1. ISSUE-164で副作用のない3状態判定を実装する
2. ISSUE-165で最新SHA単位の複数専門review gateを実装する
3. ISSUE-166で人間承認のもとRulesetとnative auto-merge設定を準備するが、PRへの予約は行わない
4. ISSUE-167で最初の5 PRをdry-runし、誤許可0件を確認する
5. ISSUE-167の人間GO後に、限定した低リスクPRだけを有効化する

それまでも`HOLD`条件は最優先で維持し、HOLDでないPRのmergeを`HUMAN_REQUIRED`として扱う。

### 11. Terminal HOLD後の回復契約

#### 11.1 凍結する移行元

次の2件をTerminal HOLDの監査記録として凍結する。base SHAは観測時点の値であり、後からmainが
移動しても書き換えない。

| repository              | source Issue       | source PR | observed base SHA                          | source head SHA                            | terminal reason                               |
| ----------------------- | ------------------ | --------- | ------------------------------------------ | ------------------------------------------ | --------------------------------------------- |
| `Kazuya-Sakashita/Hana` | `#354` / ISSUE-172 | `#355`    | `e6c891ecde1ba3f51b739361d3cd3de4433835a3` | `1239936947aed0f198216a2c8bf4be3177eb2223` | 第6巡が必要となり、ISSUE-173の最大5巡を超えた |
| `Kazuya-Sakashita/Hana` | `#358` / ISSUE-174 | `#361`    | `fbd5250251ce42d2d1505c685e3f01459d979c0e` | `514d8c64d252b22fb84f7b7834ae690025896882` | 第5巡の未解決P1が残り、第6巡は禁止されている  |

PR #355とPR #361は、closeするかどうかにかかわらず`HOLD`から別状態へ戻さない。push、追加修正、
第6巡review、reviewerの追加・交代による再判定、Check作成・更新、例外workflow dispatch、merge、
旧review・Check・attestation・例外証跡の後継利用を禁止する。Terminal HOLD後にsource headへ新しい
Checkが投影されてもanchorを更新せず、そのCheckを回復証跡にしない。Issue番号やPR番号の変更、
新PRへの同一diffのcopy、commitのcherry-pick、
既存branchからの派生だけでは回復とみなさない。PR #361をcloseする場合も、本方針がmainへ入った後に
別途Repository Ownerの判断を得る。

#### 11.2 immutable lineage anchor

回復対象は1つのimmutable lineageとして扱う。anchorは次のstatus-only fieldを正規化した
canonical recordであり、作成後の更新、削除、別lineageへの転用を認めない。

- repository、`lineage_id`、root source Issue / PR（`#354` / `#355`）
- terminal source Issue / PR（`#358` / `#361`）
- target Issue（`#364` / ISSUE-179）と、非特権bootstrapで確定するtarget PR
- 次のcanonical fixed finding ID集合と、1回限りの`succession_id`

集合はterminal source ISSUE-174 / `#358`、PR `#361`、source head
`514d8c64d252b22fb84f7b7834ae690025896882`へ束縛する。IDをUTF-8の記載順でLF結合し、末尾LFなしで
SHA-256を計算する。stable ID、件数、順序、digestの唯一の機械可読な正本はschemaの
`lineageAnchor.properties.finding_ids.const`、`finding_count.const`、`finding_digest.const`であり、Markdownへ
ID一覧を複製しない。固定値は9件、digest
`52450c49b3852ceedd838c975f6854ec43009ba70f645630ecd00f826da787a1`である。

空集合、IDの欠落・重複・余分な追加、記載順の変更、件数またはdigestの不一致は`HOLD`にする。sourceの
旧reviewは合格証跡として再利用しない。一方、旧reviewで未解決だったFindingは破棄せず、上のIDで
ISSUE-179が満たす安全要件として継承し、target headに対するfresh reviewで別途評価する。

lineage anchorにはmain SHA、head SHA、round、workflow run、attemptを含めない。これらの可変値は
progressionまたはattemptへ分離する。一方、前節のTerminal HOLD記録にあるsource head SHAは、
ISSUE-178の復旧権限がsourceを完全一致で確認するための変更不能な入力として維持する。target PRが
未作成、target headが未確定、fieldが欠落・重複・未知、canonical finding集合が一致しない場合は発行せず
`HOLD`とする。anchor訂正が必要になった場合は上書きせず回復を停止し、新たな人間判断を要求する。

#### 11.3 bounded append-only attempt history

ISSUE-179は1回限りのsuccessionとheadごとのbounded progressionを分離し、証跡を次の3層に分ける。

1. lineage anchorはsource / target関係、canonical finding、1回だけ消費できるsuccessionだけを表す。
2. progressionは`lineage_id`、target Issue / PR、target head SHA、round、round stateへ束縛し、main SHAを含めない。
3. attemptはprogression、現在のmain SHA、workflow run / run attempt、hash化したOIDC `jti`へ束縛する。

attempt historyは開始、成功、失敗、cancel、timeoutをappend-only eventとして追記し、既存eventの
更新・削除・順序変更を禁止する。1つのattempt lifecycleでは`attempt_id`、run、run attempt、`jti` hashを
全eventで不変にし、startから1つのterminal eventまで同じ値を再掲してよい。eventごとに一意なのは
`event_id`と`event_sequence`である。別attemptによるattempt tupleの再利用、別progressionへの付け替え、
startの重複、複数または矛盾するterminal event、event ID / sequenceの重複は`HOLD`とする。1 roundあたり
最大3 attempt、1 lineageあたり最大15 attemptに制限し、paginationを含む完全inventoryを取得できない
場合や上限超過時は新attemptを開始しない。

復旧権限とsuccessionの発行・失効・消費は`lineage_event`、headごとのprogression authority、round state、
fencing generationの発行・失効は`progression_event`へappend-onlyで記録する。順序はactiveな復旧権限の
発行 → succession発行 → atomic compare-and-setによる未消費から消費済みへの1回限り遷移とする。
progression authority発行前にround stateやfencing generationを記録せず、`round_state`は
`round_state_recorded` eventだけ、`writer_generation`はfencing generationの発行・失効eventだけに持たせる。
失効後の利用、先行eventのない後継、重複発行・消費、event ID / sequence重複は`HOLD`とする。

承認集合digestは、有効期限内かつ検証済みの`security`、`operations`、`repository_owner`を各1件だけ選び、
roleを`operations`、`repository_owner`、`security`の順に並べ、各`approval_receipt` record全体をRFC 8785で
canonicalizeした配列のSHA-256とする。この値だけを`approval_set_digest_sha256`として後続eventへ渡し、
部分field、入力順、未検証receipt、重複roleから別digestを作ることを禁止する。

lineage lifecycleは`lineage_id + succession_id`、progression lifecycleは`lineage_id + progression_id`、
attempt lifecycleは`lineage_id + attempt_id`でそれぞれpartitionする。同一partition内ではauthority、succession、
target Issue / PR / head、round、approval集合の束縛を不変にする。progression authorityの発行は、同じlineage、
succession、authority、target、approval集合で先に`succession_consumed`が記録されている場合だけ許可する。
attempt開始は同じauthority、succession、target、head、roundを持つactiveなprogressionが`finding_free`に
到達した後だけ許可する。attemptのapproval集合はreceipt内のlineage、succession、target、main / headと一致させ、
main移動時のfreshな集合を許可しつつ、別partitionのeventや別targetの集合を接合して成立させない。

attempt tuple（run ID、run attempt、OIDC `jti` hash）はlineage内で正確に1つの`attempt_id`へ対応させる。
異なるattempt IDによる同じtupleの再利用も、同じattempt ID内のtuple変更と同様に`HOLD`とする。

round stateは`evaluation_completed`、`completed_with_findings`、`finding_free`の3状態とする。必要roleの
評価が完了した時点で`evaluation_completed`、actionable findingが1件以上なら
`completed_with_findings`、0件なら`finding_free`へ進む。Finding修正後の新headは、旧headの
`completed_with_findings`から`round + 1`の新progressionへ進める。この遷移に旧roundのsuccessや
`finding_free`を要求しないが、`completed_with_findings`自体はmerge適格性に使用しない。
`completed_with_findings`と`finding_free`は必ず同一progressionの`evaluation_completed`直後の二択とし、
直接記録、両方の記録、同じ終端状態の再記録を拒否する。同一lineageで次progressionを発行する前に旧progression
authorityを失効させ、activeなprogressionを同時に複数持たない。

mainだけが移動した場合はfreshな3者承認と新attemptにより同じprogressionを再試行できる。headが
移動した場合は旧headのprogression authorityとfencing generationを先に失効させ、freshな3者承認と
新head専用のprogression authorityを発行し、`round + 1`へ進む。successionはlineageについて1回だけ
消費済みのままで、head変更ごとに再消費または2回目のsuccessionを作らない。通常3巡、ISSUE-173例外
でも最大5巡、第6巡、追加reviewer、別Issue / PR、証跡copyによる上限回避を常に`HOLD`とする。
`in_progress`の取り残し、部分失敗、cancel、timeoutは成功へ補正せず、failure eventを追記してから
上限内のfresh attemptだけを許可する。

#### 11.4 fixed `merge-eligibility` projection

Rulesetへ提示する最終状態は、Hana専用GitHub Appが発行する固定名`merge-eligibility` Checkだけとする。
動的なattempt Checkは監査履歴でありrequired checkにしない。projectionは履歴の代替ではなく、
最新の完全inventoryから導出した現在値である。

`success`へ投影できるのは、immutable lineage anchor、消費済みの1回限りのsuccession、現在head専用の
progression authorityとattempt、3者approval receipt、`finding_free`、必須Checkが完全一致する場合だけとする。
各`projection_event`はtarget PR / headに加えて`main_sha`、`progression_id`、`attempt_id`を直接持ち、
projection生成時の完全inventoryと同じrecordへ束縛する。`check_status=success`は
`check_reason=finding_free`とだけ組み合わせ、stale inventory、rollback、unknown-success recovery、
activation blockedは必ず`check_status=failure`にする。
target PR / head単位のexclusive `writer_generation`または同等のfencing tokenをsuccess遷移前に取得して
readbackし、下位generationからの新規outbound writeを遮断する。下位generationのin-flight writerをdrainし、
対象PR / headへ遅延PATCHが残らないquiescenceを確認した後だけ、現在generationにsuccess PATCHを許可する。
GitHubへのCheck PATCH credentialは単一のtrusted holderだけが保持し、workerは直接保持しない。すべてのPATCHを
holderへ集約し、holderが下位generationを拒否することで、generation番号だけに依存しない実効的な遮断を行う。
全barrier eventは同じ`barrier_id`、target、main / head、progression、attempt、generation、fencing token、
credential owner、App ID、check name、Check Run IDを再掲する。generation取得からquiescence確認までのeventを
RFC 8785でcanonicalizeしてSHA-256を計算し、`completed_barrier_digest_sha256`としてquiescence以降のeventと
projectionへ束縛する。
generationが一意でない、競合writerを遮断できない、drainまたはquiescenceを証明できない場合は
`runtime_activation_gate`を`HOLD`とする。

main freshnessは、success遷移とmergeの間をGitHub merge queue SHA、strict up-to-date条件、または
同等のGitHub側原子的条件で束縛する。main変更eventの購読と直前readbackだけでは完全な原子性を
主張せず、原子的条件が成立しない間はsuccessを許可しない。新attempt開始時は旧successを先に
無効化し、確定直前にもfresh readbackする。main移動、head移動、再実行、重複、pagination欠落、別App、
未知field、不完全inventory、staleまたは複数のprojectionはfail-closedで`HOLD`へ投影する。旧PRの
`merge-eligibility`、review、Check、attestationは入力にしない。

Check Runは少なくともrepository、target PR、target head SHA、GitHub App ID、check nameの5要素へ
束縛する。PATCH前に完全inventoryからこの5要素が一意に一致する正確なCheck Run IDを再取得し、
別headで作成されたCheck Run IDは更新しない。Hana専用GitHub Appの必要権限契約には
`Checks: write`と`Metadata: read`を含める。本Issueは権限を記述するだけで、実際のApp設定は変更しない。

最終`success` PATCHの応答がtimeout、切断、または成否不明になった場合は、fail-closedを証明済みと
主張しない。現在writerより上位generationを持つtrusted invalidatorだけが、generation取得、下位generationの
新規outbound write遮断、drain開始、quiescence確認をこの順に完了してから正確なCheck Run IDを再取得する。
同一Check Run IDのsuccessをreadbackした場合だけ、同じIDを`failure`へ更新して同一IDのfailureをreadbackし、
controller停止後に同じIDの最終failureを再確認する。
このbarrierを完了できない、または上位generationでfailure化して確認できない場合は
`runtime_activation_gate`を`HOLD`とする。

#### 11.5 順序、信頼境界、停止条件

回復順は次のstageで固定する。前stageを満たすまで後stageへ進まず、実装着手と特権activationを混同しない。

| stage                                     | entry / exit gate                                                                                                          | 許可する操作                                                                              |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `issue_177_policy`                        | ISSUE-177をmainへ入れる                                                                                                    | 文書と契約testだけ。権限発行、Check更新、runtime安全性の主張は禁止                        |
| `issue_178_entry_gate`                    | GitHub Issue #363の本文、AC、依存、ADR参照を本方針へ同期し、人間がreadbackする                                             | Issue同期だけ。本Issueでは実施しない                                                      |
| `issue_178_non_privileged_implementation` | entry gate後、ISSUE-178をmainへ入れる                                                                                      | trusted-mainの検証器、authority、fencing、invalidatorを実装するが、権限は発行・消費しない |
| `issue_179_non_privileged_bootstrap`      | ISSUE-178 main後、最新mainからISSUE-179の文書・コード・Draft PR / headを確定する                                           | Check更新、権限発行・消費、success、merge予約を行わない                                   |
| `runtime_activation_gate`                 | self-review防止の是正/readback、freshな3者approval receipt、完全inventory、writer barrier、atomic main freshnessを確認する | 検証のみ。1件でも未達なら特権操作は禁止                                                   |
| `privileged_recovery`                     | activation gate通過後                                                                                                      | 1回限りのsuccession消費、head専用progression / attempt、固定Check更新を許可               |

#363の同期と人間readbackが完了する前にISSUE-178を実装しない。
ISSUE-178自身のPRは新しい権限で自己承認または自己mergeしない。ISSUE-179はPR #361のコード、commit、review、
Check、attestation、例外証跡をcopyまたはcherry-pickしない。

3者approval receiptはSecurity、Operations、Repository Ownerの別roleかつdistinctなstable非PII principalを要求する。
各receiptはschemaの`record_reference`、`approval_payload`、`verification_receipt`へ分離し、source / target、
main / head、succession、finding digest、署名対象payload digest、trusted verifier receiptへ束縛する。
3件でrecord reference、target、main / head、succession、finding digest、approval run、requester / issuerを
同一にし、actor集合とrequester / issuer集合を非交差にする。role、actor、approval ID、nonceの重複、
requester / issuerとのcross-record自己承認、replay、期限切れ、
署名またはreceipt不正、未知field、値の不一致を拒否して`runtime_activation_gate`を`HOLD`にする。

現行EnvironmentだけではSecurity、Operations、Repository Ownerの3者独立承認を証明できない。
distinct actor、role、署名、replay防止を実行時に検証する仕組みとreadbackが整うまで、非特権bootstrapは
許可しても復旧権限発行以降をactivation blockedとする。

ISSUE-178の信頼境界はapproval receipt検証、復旧権限の発行と1回限りの消費、ISSUE-179の信頼境界は
lineage / progression / attempt、fencing、atomic freshness、固定projectionの実行時評価である。
どちらもGitHub App、Environment、secret、Ruleset、
branch protection、repository settingsを変更しない。Security、Operations、Repository Ownerの
独立確認が揃わない場合、復旧権限の自己利用、2回目のsuccession、別targetへの転用、対象不一致、
期限切れ、別App、未知field、不完全inventoryのいずれかがある場合は`runtime_activation_gate`を
`HOLD`として特権操作だけを停止する。

現行`hana-merge-human-approval`の`prevent_self_review=false`は既知のactivation blockerである。
Security、Operations、Repository Ownerの明示的な人間承認のもとで自己reviewを防ぐ設定へ是正し、
readbackで有効値を確認するまでは、3者approval receipt検証、復旧権限発行・消費、Check更新、merge適格化という
特権操作を開始しない。このblockerはGitHub Issue #363の同期やISSUE-178 / ISSUE-179の非特権作業を
禁止しない。本IssueではEnvironment設定を変更しない。

HOLDはstage scopeを持つ。ISSUE-177文書・schema・契約testの具体的findingは`issue_177_policy`を止める。
#363の未同期またはreadback不足は`issue_178_entry_gate`を止める。self-review防止、runtimeの3者receipt、
完全inventory、writer barrier、atomic freshnessの不足は`runtime_activation_gate`以降だけを止める。
後続stageの未達をISSUE-177の再review理由にせず、前stageのHOLDを後stageで迂回しない。

ISSUE-177のSecurity、Operations、Repository Ownerによる独立確認は、この方針文書を受け入れるreview gate
であり、ISSUE-179 target headへのruntime approval receiptではない。文書テストが成功し、この3者が方針を
確認すれば、GitHub Issue #363の同期やEnvironment是正が未完でもISSUE-177は完了できる。後続blockerの
未解消だけを理由に本方針の修正・再reviewへ戻らず、具体的な方針上のfindingがある場合だけ修正する。

ISSUE-179までの文書・unit test・in-memory fault-injection testは設計と決定的挙動の証拠にはなるが、
GitHub上の保護設定、署名付きOIDC、専用App、完全inventory、Ruleset投影が実環境で正しく機能した証明
にはならない。runtimeのfreshなstatus-only証跡と独立reviewがない限り、安全性を証明済み、回復済み、
または`AUTO_MERGE_ELIGIBLE`と扱わない。

#### 11.6 Rollback

本方針をrollbackしてもPR #355とPR #361のTerminal HOLDは解除しない。ISSUE-178の導入後に異常を
検出した場合は復旧権限を未発行またはfailureとして扱い、特権操作を開始しない。ISSUE-179で異常を
検出した場合はtarget PR / headのexclusive writerを上位generationのtrusted invalidatorへ移し、次の
順序を変更しない。

1. 上位writer generationを取得してreadbackする。
2. 下位generationの新規outbound success書込みを遮断する。
3. 下位generationのin-flight writerのdrainを開始する。
4. 遅延PATCHが残らないquiescenceを確認する。
5. 同一Check Run IDのsuccessをreadbackする。
6. required Checkを`failure`へ投影し、同一Check Run IDのfailureをreadbackする。
7. controllerを停止またはrevertする。
8. 同一Check Run IDの最終failureをもう一度readbackする。

rollback開始時にexclusive writer generationまたはfencing tokenを取得できない場合、success PATCH応答不明を
上位generationでfailure化できない場合、drain / quiescenceを証明できない場合、途中または最終readbackで
failureを確認できない場合は`runtime_activation_gate`を`HOLD`のまま人間判断を要求する。いずれの場合も新たな後継Issue、第6巡、追加reviewer、
旧証跡再利用で回復を続けない。

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
- ISSUE-177 / GitHub Issue #362
- ISSUE-178 / GitHub Issue #363
- ISSUE-179 / GitHub Issue #364
- `docs/api-driven-development/codex-automation-runbook.md`
- `AGENTS.md`
