---
title: Hana Product Validation Funnel Go/Hold Contract
status: active
contract_version: 2026-08-09.1
last_updated: 2026-08-08
owners:
  - product
  - privacy
---

# Funnel Go/Hold Contract

この文書は、Hana MVPの記録体験、継続、見返し、感情価値を判定する測定契約である。
個別ユーザーの行動履歴を作ることではなく、事前に固定した集計だけでProductとPrivacyが
Go / Hold / No-Goを判断できる状態を目的とする。

## Source of truth

優先順位は次のとおりとする。

1. `docs/openapi/openapi.yaml` — 収集可能なeventとAPI契約
2. `prisma/schema.prisma`とAccepted ADR — 保存済みdata model、認証、AI送信、保持、privacy
3. この文書 — funnel、cohort、欠測、閾値、判定の定義
4. `Hana_PRD_v1.md` — product要求と検証仮説

この文書は新しいevent、API、永続fieldを追加しない。計測には既存のProfile、Memoryと、
ISSUE-111で許可済みの5 eventだけを使う。runtimeの相関、集約、削除はISSUE-192とISSUE-185、
pilot protocolはISSUE-160、releaseのfail-closed gateはISSUE-162が実装する。

## Claim status

| status         | 意味                                            | active UI / LP / store copy                      |
| -------------- | ----------------------------------------------- | ------------------------------------------------ |
| 確認済み事実   | main実装、OpenAPI、Accepted ADRで確認できる能力 | 条件と範囲を併記して説明できる                   |
| 検証仮説       | 目標値または利用者価値として検証中              | 「目標」「検証中」と明記した調査文脈だけで使える |
| 未検証         | cohort、外部証跡、人間reviewのいずれかが不足    | 達成済みの事実として使わない                     |
| 未実装・対象外 | active MVPに実装がない、または明示的にscope外   | 現在または近日提供する能力として使わない         |

### Active claims

| claim                             | status         | contract                                                                                                               |
| --------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 提供形態                          | 確認済み事実   | MVPはNext.jsのmobile-first Web。native appはactive MVP scopeではない                                                   |
| PWA installability                | 未実装・対象外 | manifest / service workerは未実装で、active MVPとrelease gateの対象外。Productが再採用するまでは提供予定とも表現しない |
| 認証                              | 確認済み事実   | Supabase AuthのSNS-only。Google先行、Appleは後続。Hanaはpasswordを持たず、private `/v1` APIはCookie sessionだけを使う  |
| 記録経路                          | 確認済み事実   | 写真1〜5枚からAI下書き、またはAIを使わない手動入力を選び、確認・編集して保存できる                                     |
| 30秒 / 60秒                       | 検証仮説       | ISSUE-160で経路別のp50 30秒以内、p85 60秒以内を検証する。達成前は「30秒」「短時間」「すぐ」を性能事実として公開しない  |
| AI外部送信                        | 確認済み事実   | 明示opt-in後だけ、EXIF除去済み画像と許可fieldをAnthropicへ送る。AIを使わない経路を残す                                 |
| vendor retention / training / ZDR | 未検証         | ISSUE-161のPrivacy / Legal / AI reviewがGoになるまで断定しない                                                         |
| AI下書きの受容性と感情価値        | 未検証         | ISSUE-160の同意済みpilotで確認する。生成品質や感情成果を達成済みと断定しない                                           |

## Allowed data

### Product events

| event            | 用途                                     | 制約                             |
| ---------------- | ---------------------------------------- | -------------------------------- |
| `record_started` | 記録フロー開始、所要時間の起点           | `elapsed_bucket=not_applicable`  |
| `photo_selected` | 写真選択から保存までのconversion分母     | 同一`flow_id`で重複排除          |
| `ai_draft_shown` | AI下書き表示から保存までのconversion分母 | AI経路だけに存在する             |
| `memory_saved`   | 記録フロー完了の補助signal               | DBのMemory作成を保存の正とする   |
| `memory_viewed`  | 見返しと再記録の起点                     | 本文、memory ID、URLを収集しない |

payloadは`event_name / event_id / flow_id / elapsed_bucket`だけを許可する。actorは認証済み
`user_id`からserver側HMACで作り、raw user ID、氏名、メール、生年月日、画像情報、URL、
`storage_key`、prompt、生成本文をeventへ含めない。HMAC actorも仮名化された個人データであり、
退会purgeとkey lifecycleはISSUE-185が完了するまでPrivacy gateをGoにしない。

### Confirmed records

- 登録cohortは`Profile.createdAt`、保存完了は削除されていない`Memory.createdAt`を正とする。
- `recordedAt`は利用者が変更できるため、funnelとretentionの日時には使わない。
- eventはbest-effortであり、保存の成否をeventだけで判定しない。
- 論理削除・物理削除された個人データを計測のために復元しない。
- PRD内に疑似SQL schemaを複製せず、fieldとrelationは`prisma/schema.prisma`を正とする。

## Time, cohort, and identity boundaries

- すべての窓はUTCの半開区間`[start, end)`で固定する。
- 初回記録は`Profile.createdAt`から24時間後までとし、24時間を観測完了したProfileだけを使う。
- D7は登録時刻から7日後以上8日後未満、D30は30日後以上31日後未満とする。
- D7 / D30はそれぞれ8日 / 31日を観測完了したProfileだけを分母にする。
- 週次記録は月曜00:00 UTCから次の月曜00:00 UTCまでとし、7日すべて在籍したProfile-weekだけを使う。
- 月次見返しはcalendar month UTCを全期間観測でき、月初に有効なMemoryを1件以上持つProfileだけを使う。
- 再閲覧後再記録は、7日後まで観測できる最初の`memory_viewed`から7日以内の最初のMemory作成を使う。
- event flowは`actor_hash + actor_key_version + flow_id`で識別し、同一event名の最初の1件だけを使う。
- event依存cohortは1つの`actor_key_version`だけを使う。観測窓中のkey rotationでversionを跨ぐcohortは
  結合せず無効化し、新versionの観測窓を開始する。
- eventからDB Memoryへの相関は、ISSUE-192で`flow_id`と`Memory.idempotencyKey`に同じUUIDを使い、
  DB作成を保存の正にできるまで未確認とする。

### Evidence entry windows

evidence versionの`window_start_utc / window_end_utc`はeligible unitのentryを選ぶ範囲であり、
全履歴を意味しない。DB時刻をanchorとするunitはanchorが、ProductEventをanchorとするunitは
DB `event_id`から復元した発生minuteの半開区間全体が`[window_start_utc, window_end_utc)`に入る場合だけ使う。
ProductEventのDB `createdAt`はreceipt timeとして遅延と順序の検証だけに使い、entryやmaturityの起点にしない。

- M1 / M5 / M6: `Profile.createdAt`をanchorとし、それぞれ24時間 / 8日 / 31日のmaturity後に集計する。
- M2: `photo_selected`、M3: `ai_draft_shown`の発生minute区間をanchorとし、区間終端から30分のmaturity後に集計する。
- M7: `week_start_utc`をanchorとし、週全体がwindow内にあり、`week_end_utc`後に集計する。
- M8: `calendar_month_start_utc`をanchorとし、月全体がwindow内にあり、翌月開始後に集計する。
- M9: entry window内で各Profileが最初に送ったeligible `memory_viewed`の発生minute区間をanchorとし、区間終端から7日後に集計する。
- `generated_at_utc`が各unitのmaturityより前なら、そのunitを失敗扱いせずcohort全体をHoldにする。

### Eligibility and exclusions

- production環境だけを対象にし、事前登録したsynthetic / internal test actor allowlistを除外する。
- allowlistと除外理由は観測開始前にversion固定し、結果を見た後の追加・遡及除外を禁止する。
- M2 / M3は20 distinct Profile以上かつ20 flow以上、M7は20 distinct Profile以上かつ20 Profile-week以上を必要とする。
- 退会purgeなどで観測中cohortのeligible unitを再現できなくなった場合、値を復元せず該当cohortをHoldにする。
- bot、失敗、timeoutを結果確認後に恣意的除外せず、各metricのmissing ruleとISSUE-160のcensoring ruleに従う。

## Decision matrix

`required`はProduct Goに必須、`guardrail`は悪化時にGoを止める必須保護指標、`diagnostic`は
状態を説明するだけで単独のGo根拠にしない。min未満、観測窓未完了、欠測、version不一致はHoldである。

| ID  | gate                | eligible unit / window                          | numerator or value                         | min                       | missing rule                         | target                                             |
| --- | ------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------- | ------------------------------------ | -------------------------------------------------- |
| M1  | required            | 24時間を観測完了したProfile                     | 24時間以内にMemoryを1件以上作成したProfile | 20 Profile                | DB再現不能ならHold                   | 70%以上                                            |
| M2  | required            | `photo_selected`から30分を観測したdistinct flow | 30分未満に同じUUIDで相関したDB Memory作成  | 20 Profile / flow         | ISSUE-192完了前またはevent欠測はHold | 85%以上                                            |
| M3  | required            | `ai_draft_shown`から30分を観測したdistinct flow | 30分未満に同じUUIDで相関したDB Memory作成  | 20 Profile / flow         | ISSUE-192完了前またはevent欠測はHold | 75%以上                                            |
| M4  | required usability  | ISSUE-160のAI / 手動各経路の初回試行            | 操作可能画面の提示からDB保存確認までの秒数 | 各経路5完了               | retry、timeout、中断の分類不能はHold | 各経路p50 ≤30秒、p85 ≤60秒、完了5/5                |
| M5  | required            | D7窓を観測完了したProfile                       | D7窓にMemoryを1件以上作成したProfile       | 20 Profile                | DB再現不能ならHold                   | 40%以上                                            |
| M6  | required            | D30窓を観測完了したProfile                      | D30窓にMemoryを1件以上作成したProfile      | 20 Profile                | DB再現不能ならHold                   | 25%以上                                            |
| M7  | required            | 7日を観測完了したProfile-week                   | 週内にMemoryを1件以上作成したProfile-week  | 20 Profile / Profile-week | DB再現不能ならHold                   | 40%以上                                            |
| M8  | guardrail           | 月初にMemoryを持つ観測完了Profile               | 月内に`memory_viewed`が1件以上あるProfile  | 20 Profile                | ISSUE-192のcompleteness Go前はHold   | 独立baseline cohort後、評価cohort前にProductが固定 |
| M9  | guardrail           | view後7日を観測できるdistinct Profile           | 7日以内にMemoryを1件以上作成したProfile    | 20 Profile                | view event欠測または相関不能ならHold | 独立baseline cohort後、評価cohort前にProductが固定 |
| M10 | required usability  | ISSUE-160のAI経路5名                            | 軽微編集以下で保存可能、重大な創作         | 5回答                     | 回答欠測はHold                       | 保存可能4/5以上、重大な創作0件                     |
| M11 | guardrail usability | ISSUE-160の5名                                  | 「見返したときに残してよかった」肯定       | 5回答                     | 回答欠測はHold                       | 4/5以上                                            |
| M12 | guardrail usability | ISSUE-160の5名                                  | 「急かされた・責められた」強い肯定         | 5回答                     | 回答欠測はHold                       | 0/5                                                |

M8とM9は、最初の独立cohortをbaseline取得だけに使う。同じcohortを見て閾値を決めてGoにしてはならない。
Productが閾値、方向、再計測期限を署名付きdecision recordで固定し、次の独立cohortで初めて判定する。
decision recordへtarget方向、再計測期限、保護されたbaseline evidence receiptとbaseline / evaluationの
cohort roleを含め、baseline receiptとdecisionを別のversioned keyで署名する。
`baseline.window_end_utc <= baseline.generated_at_utc <= target_fixed_at_utc < evaluation.window_start_utc`と、
evaluation evidence生成時刻が再計測期限以前であることを必須にする。
M1 / M2 / M3 / M5 / M6 / M7のminimumとtargetはこの表からcode policyへ固定し、aggregate callerによる
上書きを許可しない。M2 / M3はdistinct Profileとflow、M7はdistinct ProfileとProfile-weekの両方がminimumを
満たす場合だけrateを判定する。M8 / M9のdecision recordは保護されたversioned keyで検証し、欠落、改変、
chronology不一致、baseline cohortの自己評価はHoldにする。

productionの`elapsed_bucket`から正確なp50 / p85を再構成しない。分位点はISSUE-160で事前固定した
nearest-rank algorithmを使い、AI / 手動経路を混ぜない。pilotのusability Goをproduct validationや
release Goへ読み替えない。

## Missing data and telemetry completeness

- event送信失敗を離脱、未保存、未閲覧として扱わない。DB Memory作成は保存の正とする。
- event依存のM2、M3、M8、M9はISSUE-192の相関・重複・順序・completeness証跡がGoになるまでHoldとする。
- evidence生成は署名済みcompleteness inputを再評価し、query version、全評価actor scope、各metricのentry windowを
  一致させる。1日または1 actorだけのPASSを月次cohortへ流用しない。funnel completenessがPASS / completeで
  なければM2、M3、M8、M9を`telemetry_incomplete`のHoldへ強制する。
- event endpoint、retention job、aggregate query、actor key versionのいずれかが観測期間中に未確認なら該当cohortはHoldにする。
- 観測窓未完了、min不足、重複排除不能、時計境界不明、削除で分母を再現不能な場合もHoldにする。
- 欠測を補完、推定、外挿してGoへ変更しない。
- `memory_saved` eventの欠測と利用者離脱を同一視せず、ISSUE-192のDB相関結果を使う。
- ISSUE-192がeventごとのserver truthまたはdurable ack / retryとexpected-versus-receivedを証明できない限り、
  best-effort event依存metricのcompletenessはPASSにしない。

### Account deletion during observation

- 観測開始時のeligible censusはISSUE-192の制限付きjobで固定し、actor hashやuser IDを証跡へ出さない。
- maturity前に退会purgeされたunitはright-censoredとして元のeligible censusに残し、結果を見た後の
  任意除外を禁止する。観測成功数を`s`、元のeligible数を`N`、censor数を`c`とする。
- 高いほど良いproduction rateは、全censorを失敗とする下限`s / N`と、全censorを成功とする上限
  `(s + c) / N`を制限付きjobで計算する。下限がtarget以上ならPASS、上限がtarget未満ならFAIL、
  両端で判定が分かれる場合はHOLDとする。exact値はstatus-only evidenceへ出さない。
- maturity後に確定・署名済みの非識別statusは保持できるが、raw Profile、Memory、event、actor hashはISSUE-185に従いpurgeする。
- purge前にcensus / censoringを固定できなかったcohort、または削除後に再計算が必要なcohortはHoldとし、復元しない。
- census / censoringの固定失敗を理由に利用者の退会purgeを遅らせず、該当evidenceだけをHoldにする。

## Privacy aggregation and suppression

- raw eventとactor hashはISSUE-192の最小権限aggregate jobだけが読み、ad hoc queryやPR reviewerへ開示しない。
- 制限付きaggregate jobは判定のためにexact count / rate / percentileを一時的に計算できるが、
  raw値をrepo、PR、CI、release dossierへ出力しない。
- Product / Privacyの制限付き集計画面でratio / countを表示する場合は、分母、分子、補集合
  `分母 - 分子`がすべて5以上の場合だけ値を表示する。
- 行・列・合計の差分から抑止cellを復元できる場合、追加cellをsecondary suppressionする。
- 数値表示条件を満たさないcellは値、率、分位点を出さず`<5 / suppressed`とする。数値を抑止しても、
  事前固定したeligible unit、min、target、completenessを検証したjobは`metric ID + PASS / FAIL / HOLD`
  だけを出力できる。cohort size、count、rate、percentile、属性は併記しない。
- status-only判定に必要なmin、completeness、query versionをjobが証明できなければHoldとする。
- 5名pilotは同意済み全体cohortだけを扱い、属性別に分割しない。個別観測とp50 / p85 / rate / countは
  pilot protocolの期限まで制限付き一時領域だけで扱い、repo、PR、CI、release dossierにはmetric IDとstatusだけを残す。
- raw eventの保持・削除はADRとISSUE-192、退会時の全key version purgeはISSUE-185を正とする。

## Evidence version

1回の判定は次を固定した単一のevidence versionを参照する。

- `contract_version`
- `source_sha`
- `window_start_utc` / `window_end_utc`
- `query_version`
- `event_schema_version`
- `actor_key_version`
- metricごとのanchor、entry window、maturityを固定した`metric_window_manifest`
- M8 / M9の署名済み`baseline_evidence_receipt`、`direction`、`target_fixed_at_utc`、
  `remeasurement_deadline_utc`、baseline / evaluationの`cohort_role`
- `eligible_census_digest`
- `censoring_policy_version`
- `censoring_status_digest`
- `generated_at_utc`
- 上記とmetric status一覧を保護されたevidence keyと専用domainで署名する`evidence_digest`

private `metric_window_manifest`、eligible census、censoring statusはversioned exact schemaで固定し、未知field、
metric欠落、window / query / actor key version不一致を受理しない。外部へ残すcommitmentはcaller指定keyではなく、
保護されたversioned evidence keyで作る。suppression tableもversioned fixed schemaからrow / column / total関係を
server側で導出し、callerによるreconstruction group省略を許可しない。

構成要素の変更、digest不一致、異なるevidence versionを参照するreviewは判定を無効化してHoldに戻す。
ISSUE-162はこのfail-closed ruleをrelease dossierへ実装する。
event依存cohortがkey rotationを跨いだ場合もevidence versionを無効化し、ISSUE-185がruntimeで強制する。

## Decision contract

判定は自動mergeや自動releaseを許可しない。ProductとPrivacyが同じevidence versionを確認して確定する。

### Go

次をすべて満たす。

- M1〜M7、M10〜M12がtargetを満たし、M8 / M9は独立baseline後に固定したtargetを評価cohortで満たす。
- 必須cohort、観測窓、telemetry completeness、suppression、evidence versionが有効である。
- ISSUE-192、ISSUE-160、ISSUE-161、ISSUE-185の各privacy / product gateがGoである。
- ProductとPrivacyの人間reviewが同じevidence versionへGoを記録している。

### Hold

次のいずれかに該当する。

- cohort不足、観測窓未完了、欠測、status-only判定条件未確認、baselineのみ、evidence version不一致がある。
- required metricまたはguardrailが最初の有効evaluationで目標未達となり、原因仮説と再計測期限を持つ改善がまだ評価されていない。
- Product、Privacy、AI vendor attestation、ISSUE-192 / 160 / 185のreviewがpendingである。
- 未検証claimの公開文言がactive UI、LP、store copyに残っている。

### No-Go

次のいずれかに該当する。

- opt-in前のAI送信、PII・画像情報・prompt・生成本文のeventまたは証跡流出が1件でもある。
- ISSUE-160で重大な創作が1件以上ある、手動経路を完了できない、または強い圧力回答が1件以上ある。
- 観測完了した有効cohortでrequired metricまたはguardrailが未達となり、改善後の独立cohortでも同じ基準を満たさない。
- Privacyが公開不可、またはProductが中核価値不成立と判断する。

No-Goはデータ削除、incident対応、公開停止など該当runbookを優先し、指標改善だけで上書きしない。

## North Star and guardrails

North Starは「月間アクティブProfileあたりの保存Memory数」とするが、単独でGoを判断しない。
activeの定義とevent completenessがISSUE-192で確定するまではdiagnosticである。保存数を増やすために
不要な通知、重複保存、罪悪感を誘うUIを最適化しないよう、M5、M6、M8、M9、M11、M12を同時に確認する。

## Current decision

**Hold（2026-08-07）**。M1〜M12の有効なcohort evidence、M8 / M9の独立baselineと固定target、
ISSUE-192、ISSUE-160、ISSUE-161、ISSUE-185、Product / Privacy reviewが未完了である。
active UIと公開LPには、30秒、短時間、感情成果、PWA / native store提供を確認済み事実として表示しない。

## Human review

同じevidence versionを参照し、個人名、raw data、自由記述をこの文書へ記入しない。

| review  | status  | required evidence                              | evidence version | reviewed at |
| ------- | ------- | ---------------------------------------------- | ---------------- | ----------- |
| Product | pending | M1〜M12、threshold、claim inventory、ISSUE-160 | pending          | pending     |
| Privacy | pending | suppression、completeness、保持、purge、vendor | pending          | pending     |

ProductまたはPrivacyがpending / Hold / No-Goなら、総合判定はGoにならない。

## Related issues

- ISSUE-111: 個人情報を含めない記録ファネル計測
- ISSUE-192: PII-safe telemetry相関・集約基盤（ISSUE-188置換）
- ISSUE-159: PRD契約とfunnelのGo・Hold基準
- ISSUE-160: 5名pilot
- ISSUE-161: AI vendor attestation
- ISSUE-162: Release evidence dossier
- ISSUE-185: ProductEvent退会purgeとHMAC key lifecycle
