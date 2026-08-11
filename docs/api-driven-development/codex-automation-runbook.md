# Codex 自動開発 Runbook

この文書は、Codex が Hana の Issue を自動で進めるときの運用手順を定義する。

目的は無条件の自動mergeではない。PRの最新commit SHAに対する複数の独立reviewとCIを使い、
`AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`を安全側に判定することである。

本契約はADR-0017を正とする。ISSUE-164〜ISSUE-166の実装とISSUE-167のdry-run後に人間が
有効化を承認するまでも`HOLD`条件を最優先し、HOLDでないPRのmergeを`HUMAN_REQUIRED`として扱う。

---

## 1. 基本方針

- 1 Issue 1 branch 1 PR を守る。
- メイン Codex は **Issue Captain** として、スコープ、実装、検証、PR 記録を統合する。
- サブエージェントは短命のread-only専門reviewerとして使い、実装、staging、commit、push、PR変更、merge、実環境アクセスを行わせない。
- code-onlyのprivacy / security / DB migration / AI変更は追加review対象とし、実環境操作、secret、vendor、release判断は人間承認で止める。
- 判定の優先順位は`HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE`とし、不明は`HOLD`にする。
- rollback できるように、Issue / PR / Git の 3 層に記録を残す。
- Codexのapproval policyやsandboxとGitHubのmerge適格性を分離し、前者を弱めない。

---

## 2. 3状態の境界

| 状態                  | 条件                                                                    | 次の動作                                  |
| --------------------- | ----------------------------------------------------------------------- | ----------------------------------------- |
| `AUTO_MERGE_ELIGIBLE` | 最新SHAの全reviewとCIが合格し、actionable finding 0件で、外部影響がない | 有効化後にnative auto-merge予約だけを許可 |
| `HUMAN_REQUIRED`      | 証跡は揃っているが、実環境、不可逆性、管理権限、外部契約の判断が必要    | 限定scopeの人間承認まで停止               |
| `HOLD`                | 指摘、矛盾、stale SHA、情報不足、検証不能、未知riskがある               | 人間承認で上書きせず、修正または証跡追加  |

code-onlyで候補になり得る範囲:

- docs / tests / low-risk CI / low-risk UI /通常bug fix
- OpenAPI-first、契約検証、rollbackが揃ったAPI変更
- 合成データだけで検証し、必要な追加専門reviewが揃ったAuth、AI、Privacy、Image、DB migrationコード

`HUMAN_REQUIRED`で止める操作:

- 実DB migration、backfill、repair、purge、実データの削除・復元・匿名化
- 実ユーザーデータ、実画像、画像URL、storage key、prompt、生成本文を使う検証
- production deploy、公開、release、traffic切替、canary開始
- secret、AI vendor、外部service、GitHub Ruleset、repository setting、token権限の変更
- OpenAPI breaking waiver、force push、履歴改変、branch削除、DB reset
- 課金、外部送信、第三者への通知

`HOLD`へ送る条件:

- acceptance criteria未完了、unrelated diff、merge conflict、必須CI未完了または失敗
- review SHA不一致、追加commit後のstale review、reviewer不足、timeout、schema違反
- actionable finding、判断不一致、未知の変更領域、risk分類不足、rollback不足
- PII、secret、画像情報、prompt、生成本文の露出疑い
- required check、Ruleset、sandboxのbypassが必要

---

## 3. Issue Start Gate

着手前に Issue Captain は以下を確認する。

1. `git status --short --branch`
2. target Issue の目的、スコープ、Out of Scope、受け入れ条件
3. PRD の該当章
4. API 影響がある場合は `docs/openapi/openapi.yaml`
5. 既存の unrelated diff が混入しないこと

開始時に 3〜10 行で宣言する:

- この Issue の目的
- 変更する領域
- 影響しうる領域
- OpenAPI 変更の有無
- 検証コマンド
- 人間レビューが必要な理由があればその理由

---

## 4. 独立reviewer運用

全PRで最低3名を必須にする。

| 必須role                     | 確認範囲                                   |
| ---------------------------- | ------------------------------------------ |
| Spec / Acceptance            | Issue、PRD、ADR、受け入れ条件、scope creep |
| Implementation / Correctness | 実装、エラー経路、認可、安全性、保守性     |
| Test / Reliability           | 回帰、失敗時、rollback、CI、競合、再実行   |

変更領域に応じて次を追加し、合計4〜6名にする。

| 変更領域                                                  | 追加role                       |
| --------------------------------------------------------- | ------------------------------ |
| Auth / ownership / account deletion                       | Security / Authorization       |
| AI / consent / prompt / output                            | AI Safety / Privacy            |
| Privacy / consent / telemetry / retention / data handling | Privacy / Data Protection      |
| DB / migration / RLS / query                              | Database / Migration           |
| API / OpenAPI                                             | API / Contract                 |
| UI / copy / interaction                                   | UI / Accessibility             |
| Image / Storage / cleanup                                 | Image Pipeline / Privacy       |
| CI / workflow / dependency / operations                   | CI / Supply-chain / Operations |

並列枠が足りなければwave実行する。初回reviewerには同じIssue仕様、merge-base、最新head SHA、diffを
渡し、他reviewerのprompt、finding、結論を見せない。reviewerはread-only・独立コンテキストとする。

```text
Do not edit files, commit, push, change the PR, merge, or access real environments.
Review the supplied merge-base...head SHA and return actionable findings with severity,
evidence, file/line, required fix, and reviewed SHA. Return GO only when findings are zero.
```

必要roleを確保できない場合、7名以上が必要な場合、出力schemaが不正な場合、timeoutした場合は、
roleを統合して人数を減らさず`HOLD`にする。

---

## 5. Implementation Loop

API 変更あり:

1. `docs/openapi/openapi.yaml` を先に更新する
2. `pnpm openapi:lint`
3. `pnpm openapi:gen`
4. 生成差分を確認する
5. Route Handler / feature logic / tests を実装する

API 変更なし:

1. target Issue に関係するファイルだけ読む
2. 最小の complete slice で実装する
3. 対象 test を追加・更新する

禁止:

- `src/lib/api/generated/` の手編集
- unrelated refactor
- unrelated issue のついで修正
- PII を含む fixture / log / PR 記録

---

## 6. Verification Gate

通常の PR-ready 判定:

```bash
pnpm pr:gate
```

ISSUE-164のマージ適格性schemaと固定reasonは
`docs/api-driven-development/loop-engineer-merge-classifier.md`を正とする。副作用のない契約確認は
次を実行し、`pr:gate`からも同じcommandを呼ぶ。

```bash
pnpm qa:issue164:merge-classifier -- --mode=contract
```

ISSUE-165の独立review入力、role選択、wave、最大3巡、固定reasonは
`docs/api-driven-development/loop-engineer-specialist-review-gate.md`を正とする。副作用のない契約確認は
次を実行し、`pr:gate`からも同じcommandを呼ぶ。

```bash
pnpm qa:issue165:specialist-review -- --mode=contract
```

`pnpm pr:gate` が未導入の branch では、暫定 fallback として以下を実行する。
ISSUE-034 merge 後は `pnpm pr:gate` を正規ゲートにする。

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

API 変更時:

```bash
pnpm openapi:lint
pnpm openapi:gen
```

必要に応じて追加:

- UI 変更: mobile / keyboard / reduced motion / screenshot 確認
- DB 変更: migration / rollback 方針確認
- AI 変更: prompt regression / PII leakage 確認
- image 変更: public URL / storage_key / cache / deletion 確認

---

## 7. PR 記録

PR には以下を残す。

### Issue Brief

- Issue ID / title
- Why
- Scope
- Out of Scope
- Acceptance Criteria

### Change Ledger

- OpenAPI changed: yes/no
- Generated types changed: yes/no
- DB migration: yes/no
- Env change: yes/no
- User-facing change: yes/no

### Validation Ledger

- 実行コマンド
- 結果
- 失敗した場合の要約
- 未実施なら理由

### Privacy Ledger

- PII log: checked / not applicable
- image URL / storage_key exposure: checked / not applicable
- AI prompt / generated text storage: checked / not applicable
- auth / ownership: checked / not applicable

### PR Draft

- Title: `[ISSUE-XXX] <要約>`
- Body: Issue Brief / Change Ledger / Validation Ledger / Privacy Ledger / Rollback Record を含める
- Link: `Closes #<GitHub issue number>`
- State: 自動作成時は Draft PR から始める
- Review loop: 必要role全員の独立reviewを最新SHA単位で最大3巡行う
- Review evidence: reviewed SHA、role、round、actionable finding件数だけを記録する
- Merge note: merge / release / deploy に人間承認が必要な場合は明記する

### Rollback Record

```text
Rollback: revert PR <number> / commit <sha>
Data impact: none | migration | storage | unknown
User impact:
Recovery steps:
Verification after rollback:
```

---

## 8. AUTO_MERGE_ELIGIBLE条件

`AUTO_MERGE_ELIGIBLE`はコードmerge候補であり、production releaseや実環境操作の承認ではない。

次をすべて同じ最新head SHAで満たす。

- すべてのacceptance criteriaが完了し、unrelated diffとmerge conflictがない
- `pnpm pr:gate`と変更領域固有checkが成功している
- API変更時のOpenAPI lint / gen / breaking判定が同期している
- 最低3名、最大6名の必要reviewが全件GOで、actionable findingが0件である
- reviewer間の判断不一致、timeout、schema違反がない
- rollback recordと回復後のverificationがPRにある
- PII、secret、画像情報、prompt、生成本文をdiff、log、review証跡へ追加していない
- `HUMAN_REQUIRED`または`HOLD`条件に該当しない

追加commitが作られたら旧reviewと判定をすべて無効化し、新SHAで再実行する。
分類器は候補を返すだけで、auto-merge予約、merge、release、deployは実行しない。

## 9. Review loop

1巡は1つのhead SHAに対して必要reviewer全員が完了する単位とする。Issue Captainは重複findingを
統合できるが、少数意見を削除したり多数決でGOにしたりしてはならない。

修正commit後はfresh contextで全必要reviewをやり直す。3巡目終了時にactionable finding、
判断不一致、情報不足、検証不能、reviewer不足が残れば`HOLD`にする。

### Terminal HOLD後の禁止事項

PR #355とPR #361はTerminal HOLDの監査記録として凍結する。Issue Captain、reviewer、automationは
次を行わない。

- source PRへのpush、追加修正、第6巡review、reviewerの追加・交代、Check作成・更新、例外workflow
  dispatch、merge、HOLDの解除
- sourceのコード、commit、diff、review、Check、attestation、例外証跡のcopy、cherry-pick、再利用
- Issue番号またはPR番号の変更、同一diffの載せ替え、新しいreviewerによるレビュー上限のreset
- PR #361の自動close。closeが必要な場合はISSUE-177がmainへ入った後にRepository Ownerへ確認する

Terminal HOLD後は修正または証跡追加で同じPRを再判定する通常loopへ戻らない。第6巡、reviewer増員、
HOLD回避を目的とする変更は常に`HOLD`とする。source headへ新しいCheckが投影されても凍結anchorを
更新せず、回復証跡として再利用しない。

## 10. Terminal HOLD recovery

正本はADR-0017のISSUE-177追補とする。回復はschemaに定義した次のstage順へ限定する。

1. `issue_177_policy`: ISSUE-177 / `#362`の文書方針をmainへ入れる。
2. `issue_178_entry_gate`: GitHub Issue #363の本文、受け入れ条件、依存関係、ADR-0017参照を本方針へ
   同期し、人間がreadbackする。本IssueではGitHub Issueを変更しない。このgate前にISSUE-178を実装しない。
3. `issue_178_non_privileged_implementation`: ISSUE-178 / `#363`を実装してmainへ入れる。ISSUE-178のPRは
   新しい権限で自己承認または自己mergeせず、権限を発行・消費しない。
4. `issue_179_non_privileged_bootstrap`: ISSUE-179 / `#364`を最新`origin/main`から開始し、文書・コードを
   作成してDraft PRを開き、target PR / headを確定する。Check更新、権限発行・消費、success、merge予約は禁止する。
5. `runtime_activation_gate`: freshなsolo Owner authorization、3役agent evaluation receipt、完全inventory、
   writer barrier、GitHub側atomic main freshnessを検証する。未達なら後続だけを`HOLD`にする。
6. `privileged_recovery`: gate通過後だけ1回限りのsuccession、head専用progression / attempt、Check更新を許可する。

Hanaは人間のRepository Owner 1名による`solo_maintainer` modeで運用する。
`hana-merge-human-approval`は`prevent_self_review=false`、`can_admins_bypass=false`を固定し、同一Ownerの承認を
独立reviewではなくexact-boundな操作意図の確認として扱う。Security、Operations、Repository Owner観点は
同一headをfresh contextで評価する3つのagent principalへ分離する。Hana専用Appの必要権限契約は
`Checks: write`と`Metadata: read`を含む。

ISSUE-177のreview gateはOwnerの明示GOと3役agent評価であり、target headへのruntime receiptではない。
文書テストと方針reviewが完了すれば、GitHub Issue #363の同期は後続stageのblockerとして
引き継ぎ、ISSUE-177を再び修正loopへ戻さない。具体的な方針上のfindingがある場合だけ文書を修正する。
ISSUE-177のRound 4結果、reviewed head、Finding、role別件数、Check Runは上書きまたはresetしない。
P0 / P1が残った場合は、Repository Ownerの明示指示があるときだけ、ガバナンス改定と技術是正を含む1つの
bounded remediation batchを開始できる。中間headへ例外Checkまたは専門reviewを発行せず、修正済みの1つの
最終headを確定してから、Issue / PR / current main / final head / `max_round=5`へexact-boundな例外を1回だけ
発行する。Round 5は3役agentが同じ最終headをfresh contextで評価し、P0 / P1が0件ならOwnerの完了判断へ
進む。1件でも残ればTerminal HOLDとし、Round 6、追加batch、reviewer追加・交代、自動継続を行わない。

### 10.1 immutable lineage anchor

anchorはrepository、`lineage_id`、root source Issue / PR、terminal source Issue / PR、target Issue / PR、
canonical finding ID集合、1回限りの`succession_id`だけを含む。main SHA、head SHA、round、workflow run、
attemptは含めず、作成後に更新・削除・転用しない。lineage anchorにはmain SHA、head SHA、roundを
含めない。

凍結した移行元は次のとおり。observed base SHAは監査値であり、main移動後も変更しない。

| source             | observed base SHA                          | source head SHA                            | terminal reason                              |
| ------------------ | ------------------------------------------ | ------------------------------------------ | -------------------------------------------- |
| `#354` / PR `#355` | `e6c891ecde1ba3f51b739361d3cd3de4433835a3` | `1239936947aed0f198216a2c8bf4be3177eb2223` | 第6巡が必要となり、最大5巡を超えた           |
| `#358` / PR `#361` | `fbd5250251ce42d2d1505c685e3f01459d979c0e` | `514d8c64d252b22fb84f7b7834ae690025896882` | 第5巡の未解決P1が残り、第6巡は禁止されている |

canonical集合はISSUE-174 / `#358`、PR `#361`、source head
`514d8c64d252b22fb84f7b7834ae690025896882`へ束縛する。UTF-8の記載順でLF結合し、末尾LFなしで
SHA-256を計算する。ID、順序、9件という件数、digestの正本は
`docs/api-driven-development/recovery-evidence-v1.schema.json`の`lineageAnchor` constであり、Markdownへ
ID一覧を複製しない。固定digestは`52450c49b3852ceedd838c975f6854ec43009ba70f645630ecd00f826da787a1`である。

空集合、欠落、重複、余分なID、順序、件数、digestの不一致は`HOLD`にする。旧reviewは合格証跡として
再利用せず、未解決FindingだけをISSUE-179の安全要件として継承してfresh reviewで評価する。source head
SHAはanchorの可変実行fieldには入れず、復旧権限が凍結sourceを完全一致で確認する入力にする。target PR /
headが未確定、fieldの欠落・重複・未知、anchorの不一致があれば`HOLD`にする。

### 10.2 solo Owner authorization、3役agent evaluation receiptと証跡schema

Security、Operations、Repository Ownerを別roleとして必須にし、同じidentity providerとrepository scopeで
検証したstableな非PII agent principalもdistinctにする。各`approval_receipt`は署名前の`approval_payload`と
検証後の`verification_receipt`へ分離する。canonical署名対象は`record_reference`の4 fieldと
`approval_payload`だけであり、verification metadataを含めない。3件でrecord reference、target、main / head、
succession、finding digest、approval run、requester / issuerを同一にし、actor集合との交差を拒否する。
role、actor、approval ID、nonceの重複、cross-record自己承認、replay、期限切れ、署名またはreceipt不正、
未知field、不一致を拒否する。

Owner authorizationは保護Environment、GitHub署名付きOIDC、専用App CheckをIssue / PR / main / head /
最大roundへ束縛する。3役agent評価はroleごとのfresh context、distinct actor、署名、replay防止を実行時に
検証する。Owner authorizationまたは評価receiptをreadbackできるまでactivationをblockedにする。
`solo_maintainer` modeは人間のseparation of duties、悪意あるOwner、侵害されたOwner identityへの耐性を
提供せず、その安全性を主張しない。

機械可読allowlistの唯一の正本は
`docs/api-driven-development/recovery-evidence-v1.schema.json`である。record typeは`lineage_anchor`、
`approval_receipt`、`lineage_event`、`progression_event`、`attempt_event`、`writer_fence_event`、
`projection_event`だけとし、Markdownへfield一覧を複製しない。schemaのpattern、長さ、enum、
`unevaluatedProperties: false`で型違反、未知field、自由文、PIIを拒否する。raw token / claim / signature /
loginは保存せず、OIDC `jti`とfencing tokenはSHA-256値だけを保存する。

### 10.3 bounded append-only attempt history

v2は1回限りのsuccessionとheadごとのbounded progressionを分ける。

- progression: `lineage_id`、target Issue / PR、head SHA、round、round state。main SHAは含めない。
- attempt: progression、現在のmain SHA、workflow run / run attempt、hash化したOIDC `jti`。
- history: start / success / failure / cancel / timeoutをappend-only eventとして追記し、上書き・削除しない。

復旧権限とsuccessionのissue / consume / revokeは`lineage_event`、headごとのprogression authority、round
state、fencing generationのissue / revokeは`progression_event`へappend-onlyで記録する。activeな復旧権限の
発行 → succession発行 → atomic compare-and-setによる1回限りの消費を要求する。progression authority発行前の
round state / fencing event、失効後利用、orphan、順序逆転、二重発行・消費を拒否する。`round_state`は
round state eventだけ、`writer_generation`はfencing generation eventだけに持たせる。

承認集合digestは、検証済みかつ有効期限内の3 roleを各1件だけ選び、`operations`、`repository_owner`、
`security`の順で各`approval_receipt` record全体を並べ、配列をRFC 8785でcanonicalizeしてSHA-256を取る。
lineageは`lineage_id + succession_id`、progressionは`lineage_id + progression_id`、attemptは
`lineage_id + attempt_id`でpartitionし、authority、succession、target Issue / PR / head、round、
`approval_set_digest_sha256`をpartition内で不変にする。progression発行は同じ束縛の`succession_consumed`、
attempt開始は同じauthority、succession、target、head、roundのactiveかつ`finding_free`なprogressionを必須とする。
attemptのapproval集合はreceipt内のlineage、succession、target、main / headへ照合し、main移動時のfreshな集合を
許可しつつ、別partitionまたは別targetのevent接合を拒否する。

同じattempt lifecycle内では`attempt_id`、run、run attempt、`jti` hashを全eventで不変にし、startから
1つのterminal eventまで再掲してよい。`event_id`と`event_sequence`だけをevent単位で一意にする。
別attemptでのattempt tuple再利用は異なる`attempt_id`で同じrun / run attempt / OIDC `jti` hashを使う場合も含む。
別progressionへの付け替え、start重複、複数または矛盾するterminal
event、event ID / sequence重複は`HOLD`にする。上限は1 roundあたり3 attempt、1 lineageあたり15 attempt
とし、超過時は再試行しない。round stateは
`evaluation_completed`、`completed_with_findings`、`finding_free`とする。Finding修正後の新headは
旧headの`completed_with_findings`から`round + 1`へ進め、旧roundのsuccessを要求しない。ただし
`completed_with_findings`はmerge適格性に使わない。
終端の`completed_with_findings`または`finding_free`は同じprogressionの`evaluation_completed`直後に
1件だけ記録する。直接終端、二重終端、終端後の再評価を拒否する。次progression発行前に旧progression
authorityを失効させ、同一lineageで複数のactive progressionを許可しない。

mainだけが動いた場合はfreshなOwner authorization、3役agent評価と新attemptで同じprogressionを再試行できる。headが動いた場合は
旧headのprogression authorityとfencing generationを失効させ、freshなOwner authorization、3役agent評価、新head専用authority、
`round + 1`を要求する。successionは1回だけ消費済みのまま再消費しない。通常3巡、例外最大5巡、
第6巡禁止を維持する。

### 10.4 fixed merge-eligibility projection

Ruleset向けrequired checkは固定名`merge-eligibility`だけとし、動的attempt Checkは監査履歴として
扱う。projectionは最新の完全inventoryから導く現在値であり、attempt historyの代替にしない。

success遷移前にtarget PR / head単位のexclusive `writer_generation`またはfencing tokenを取得して
readbackし、下位generationの新規outbound writeを遮断する。in-flight writerをdrainし、遅延PATCHが
残らないquiescenceを確認した後だけ、現在generationがsuccessを書ける。
Check PATCH credentialは単一のtrusted holderだけが保持し、workerへ渡さない。すべてのPATCHをholderへ集約し、
holderが下位generationのrequestを拒否する。
全barrier eventは同じ`barrier_id`、target、main / head、progression、attempt、generation、fencing token、
credential owner、App / Check / Check Run IDを再掲する。generation取得からquiescence確認までをRFC 8785で
canonicalizeしたSHA-256を`completed_barrier_digest_sha256`として後続eventとprojectionへ束縛する。
main freshnessはGitHub merge queue SHA、strict up-to-date、または同等のGitHub側原子的条件へ束縛し、
main変更eventと直前readbackだけでは原子性を主張しない。原子的条件がなければsuccessを許可しない。

各`projection_event`はtarget PR / head、`main_sha`、`progression_id`、`attempt_id`、App / Check / Check Run ID、
writer generation、barrier ID / digestへ直接束縛する。`success`は`finding_free` reasonだけに限定し、
stale inventory、rollback、unknown-success recovery、activation blockedは必ず`failure`にする。
新attempt開始時は旧successを先に無効化し、success確定直前に現在のmain / head、anchor、復旧権限、
progression、attempt、review、必須Checkをfresh readbackする。main移動、head移動、再実行、重複、
pagination欠落、別App、未知field、不完全inventory、staleまたは複数のprojectionはfail-closedで
`HOLD`にする。旧PRのreview、Check、attestationはprojection入力にしない。

Check Runはrepository、target PR、target head SHA、GitHub App ID、check nameへ束縛する。PATCH前に
完全inventoryから5要素が一意に一致する正確なCheck Run IDを再取得し、別headで作成されたCheck Run
IDを更新しない。Hana専用GitHub Appの必要権限契約は`Checks: write`と`Metadata: read`を含む。

最終`success` PATCHの応答がtimeout、切断、または成否不明なら、fail-closedを証明済みと主張しない。
現在writerより上位generationのtrusted invalidatorだけが、generation取得、下位generationの新規write遮断、
drain開始、quiescence確認の順にbarrierを完了してから5要素で正確なCheck Run IDを再取得する。
同一Check Run IDのsuccessをreadbackした場合だけ同じIDを`failure`へ更新し、同一IDのfailureをreadbackする。
controller停止後も同じIDの最終failureを確認する。
barrierまたはfailure readbackを完了できなければ`runtime_activation_gate`を`HOLD`にする。

### 10.5 停止、rollback、証明限界

HOLDはstage scopeを持つ。方針・schema・契約testのfindingは`issue_177_policy`、#363の未同期/readback不足は
`issue_178_entry_gate`、復旧権限、solo Owner authorization、agent evaluation receipt、inventory、writer barrier、atomic freshnessの
不備は`runtime_activation_gate`以降だけを止める。rollbackはtarget PR / headのexclusive writer generationを
上位のtrusted invalidatorへ移してから、次の順で行う。

1. 上位writer generationを取得してreadbackする。
2. 下位generationの新規outbound success書込みを遮断する。
3. 下位generationのin-flight writerのdrainを開始する。
4. 遅延PATCHが残らないquiescenceを確認する。
5. 同一Check Run IDのsuccessをreadbackする。
6. required Checkを`failure`へ投影し、同一Check Run IDのfailureをreadbackする。
7. controllerを停止またはrevertする。
8. 同一Check Run IDの最終failureをreadbackする。

fencingを取得できない、drain / quiescenceを証明できない、success応答不明を上位generationでfailure化できない、
failure readbackを確認できない場合は`runtime_activation_gate`を`HOLD`にする。rollback後もPR #355とPR #361はTerminal HOLDのままとし、
新たな後継を作らない。

文書、unit test、in-memory testだけでは実行時の安全性を証明できない。GitHub上の保護Environment、
署名付きOIDC、専用App、完全inventory、Ruleset投影のfreshなstatus-only証跡と独立reviewが揃うまで、
回復済みまたは`AUTO_MERGE_ELIGIBLE`と扱わない。

---

## 11. Stop / Block Rules

Codex は以下で止まる。

- 同じ失敗が 3 回続いた
- Issue のスコープを超える変更が必要
- OpenAPI と実装のどちらが正か不明
- PII / secret / child photo / storage_key の露出疑い
- destructive operation が必要
- 実DB、実ユーザーデータ、production deploy、secret/vendor設定への操作が必要
- DB reset / force push / Ruleset変更などの人間承認が必要
- auto-merge有効化前、または判定が`HUMAN_REQUIRED`か`HOLD`

止まったら Issue を `blocked` にするか、PR に missing decision を明記する。

## 12. Safety baselineと段階有効化

- `approval_policy="never"`、Full Access、CI bypassを採用しない。
- 推奨baselineは`approval_policy="on-request"`、`approvals_reviewer="auto_review"`、
  `sandbox_mode="workspace-write"`とし、networkは必要時だけ限定承認する。
- 1 Issue / 1 PR、OpenAPI-first、生成物の直接編集禁止、PII非保存を維持する。
- 証跡はIssue ID、PR番号、head SHA、変更領域ID、review role、round、actionable finding件数、
  必須check名とstatus、固定された最終判定reasonだけにする。
- PR本文、コメント本文、prompt全文、実ユーザー情報、画像、生成本文、secretをartifactへ保存しない。

有効化順はISSUE-164の判定、ISSUE-165のreview gate、ISSUE-166のRuleset、ISSUE-167のdry-runである。
ISSUE-167で誤許可0件を確認し、人間がGOを出すまでも`HOLD`条件を最優先する。HOLDでないPRも、
人間GOまではmergeを`HUMAN_REQUIRED`にする。

ISSUE-166のGitHub設定契約、status-only workflow、設定前snapshot、postflight、rollbackは
`docs/api-driven-development/loop-engineer-github-merge-controls/README.md`を正とする。Rulesetとrepository
settingsは人間承認後だけ変更し、ISSUE-167の人間GOまではnative auto-mergeをどのPRにも予約しない。
