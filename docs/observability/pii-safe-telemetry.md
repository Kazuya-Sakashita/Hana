# PII-safe telemetry contract

- Status: active
- Version: `issue-191-v1`
- Event schema: `hana-telemetry-event/v2`
- Retention: 90 days

## Boundary

API、AI、Web Vitals、記録funnelを、個人の行動履歴や自由記述を作らずに同じ固定dimensionへ変換する。
外部monitoring provider、ProductEventの退会purge、HMAC key rotation、product thresholdはこの契約の
対象外であり、それぞれ後続Issueとproduct validation contractを正とする。DB roleとretention fallbackの
実効化はGitHub Issue #379で行う。status-only degradation ledgerはGitHub Issue #384で行い、
両方が完了するまでproduction telemetry activationをHoldにする。

## Event schema

共通eventは次のenvelopeと、5個の固定dimensionだけを持つ。

```json
{
  "schema_version": "hana-telemetry-event/v2",
  "event_id": "00000000-0000-4000-8000-000000000001",
  "occurred_at_utc": "2026-08-07T00:00:00Z",
  "dimensions": {
    "operation": "api_request",
    "reason": "validation_error",
    "route_group": "record",
    "status": "client_error",
    "duration_bucket": "from_100_to_500ms"
  }
}
```

`operation`、`reason`、`route_group`、`status`、`duration_bucket`はcode allowlistからだけ選ぶ。
unknown field、unknown value、自由なpath / URL / error messageはfail closedにする。`event_id`と日時は
dedupとwindow検証用のenvelopeであり、aggregate outputや通常logへ複製しない。

禁止fieldはrequest / response body、氏名、メール、生年月日、raw user ID、actor hash、画像情報、
URL、storage key、prompt、AI生成本文、親の編集本文、自由記述、token、secretである。派生hashも
個人dataを再リンクできる場合は通常logへ出さない。

## Source mapping

| source     | operation                          | reason / status                       | route / duration                                              |
| ---------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------- |
| funnel     | 既存5 event名                      | `stage_observed / success`            | `record`または`memory`、既存elapsed bucket                    |
| Web Vitals | `web_vital_{cls,fcp,inp,lcp,ttfb}` | `not_applicable`と固定rating          | browser内でpathを固定route groupへ変換し、raw valueをbucket化 |
| API        | `api_request`                      | stable Problem `reason`とstatus class | operationごとの固定route group、duration bucket               |
| AI         | `ai_generation`                    | allowlist済み失敗理由と固定outcome    | `ai`、duration bucket                                         |

samplingはfunnel / AIを100%、Web Vitals / APIを10%とする。10% sourceのsampling decisionは
server-only key、key version、source、event IDをdomain-separated HMAC-SHA256へ入力して決定し、
利用者属性、結果、本文で変えない。keyまたはkey versionが欠落・不一致ならproduction ingestと
completenessをfail closedにする。dimension cardinalityはcode allowlistの直積を上限とし、
未知値を`other`へ丸めて受理せず拒否する。
HMAC入力は`domain + NUL + source + NUL + key_version + NUL + event_id`のcanonical byte列とし、
固定key・version・source・event IDに対する事前計算済みdigestと10% thresholdのtest vectorで検証する。

Web Vitals requestは`hana-web-vitals-report/v2`の固定dimensionだけを送る。raw metric ID、raw value、path、
navigation typeはrequestへ入れず、`fetch`の`credentials: omit`と`keepalive`だけを使う。serverは
body parseとlogより前にbounded rate limitを適用し、validation後・log前にkeyed 10% samplingする。
sample-outは204かつlogなしで、sampling policy versionと期待manifestの不一致はcompleteness Holdである。
event IDはOpenAPIでハイフン区切りのbare UUIDへ限定し、`urn:uuid:`を拒否する。大小文字はserverで
lowercaseへcanonical化してからsamplingする。statusとduration bucketは共有threshold表とOpenAPIの
全105組で同じ判定にし、矛盾する組み合わせは422で拒否する。Web Vitalsのroute groupは
`public / auth / home / record / memory / settings / other_private`だけを許可する。

## ProductEvent flow lifecycle

記録作成ではProductEvent `flow_id`とMemory作成の`Idempotency-Key`に同じUUIDを使う。
両方ともハイフン区切りのbare UUIDだけを受け付け、lowercase canonical値で相関する。nil UUID、
version 9、非RFC variantもOpenAPI `format: uuid`の契約どおり受理し、version / variantを追加制限しない。

| transition                    | flow rule                  | stage rule                                          |
| ----------------------------- | -------------------------- | --------------------------------------------------- |
| 新規記録                      | 新しいUUID                 | `record_started`から開始                            |
| 同じtabの下書き復元           | 保存済みUUIDを継承         | 同じflow / stageはserverとoutboxでdedup             |
| uploadまたは保存の通信retry   | UUIDを継承                 | 同じ`event_id`をackまで再送                         |
| 写真追加・削除・並べ替え      | 旧flowを終了して新しいUUID | 新flowで現在存在するstageを再送                     |
| `memory_idempotency_conflict` | 旧flowを終了して新しいUUID | 内容を保持し、新flowで再試行                        |
| DB Memory作成成功             | UUIDをMemoryへ保存         | DB Memoryを保存の正とし、`memory_saved`は補助signal |

client outbox v4は送信前にsessionStorageへ5 fieldのProductEventと`queuedAt / attempts / nextAttemptAt`、
outbox rootへserver-minted telemetry bindingと固定degradation statusを1つだけ保存する。binding v3は
`getUser()`で検証したactorと`getClaims()`で検証したJWT `sub / session_id`、期限bucketへ拘束し、
同じ`session_id`のtoken rotationだけをopaque continuity tagで継続する。request headerだけに使い、
body、DB row、通常log、evidenceへ出さない。204だけをackとし、同じevent IDと発生minuteを指数backoffで
再送する。4xxは原則terminalとして再送せずraw entryを削除し、`DELIVERY_REJECTED`だけを残す。
401 / 403はbinding再取得、408 / 425 / 429はretryの例外とする。event IDは発生minuteを先頭48 bitへ
埋め込んだUUIDv7とし、restricted aggregateはDB event IDから
minuteを復元し、DB `created_at`をreceipt timeとして使う。最大50件、TTL 24時間で、容量超過時に
古い未ack eventを追い出してcompletenessを偽装しない。TTLとretry上限は`queuedAt`ではなくUUIDv7の
発生minuteから計算し、future、24時間超、発生minuteより前のqueueをnetwork前に破棄する。outboxが使えないbrowserでは記録操作を止めないが、
該当観測窓のcompletenessは証明できないためHoldにする。
別actorまたは別`session_id`のbinding不一致、サインアウト、退会完了では送信前にoutbox全体を破棄し、
別sessionへの再送を禁止する。token rotation中の旧bindingが401 / 403になった場合だけ、同じopaque
continuityを確認した新bindingで同じevent IDを再送する。401 / 403後の`GET /me`強制再取得は有限timeoutで
1回だけ行う。別continuity、確認済み未認証、再取得timeoutでは旧rootを破棄する。一時的に再取得できない場合は
拒否bindingをtombstone化し、旧rootを保持したまま送信を止め、新しい同一continuity bindingだけで再開する。
送信と再取得は`AbortController`とbinding generationで隔離し、旧generationの遅延応答が新sessionのoutboxや
current-user cacheを変更しないようにする。degradationはcontinuity単位で保持し、別sessionでは`NONE`から
開始する。401 / 403による停止または破棄はackではなく、該当観測窓をHoldにする認証境界である。
outbox復元と新規enqueueは`event_name × elapsed_bucket`をserverと同じpure allowlistで検証する。
malformed、primitive、binding帰属不能なrootはnetworkへ送らずraw値を削除し、現在continuityへ
`STORAGE_UNAVAILABLE`だけを永続化する。構文解析でき、別continuityと検証できたrootだけは、現在continuityを
degradeせず削除する。

## Server truth and completeness

- `memory_saved`: 同じUUIDのDB Memory作成がserver truth。
- `photo_selected`、`ai_draft_shown`、`memory_viewed`: durable outboxの204 ackとDB ProductEventがtruth。
- Web Vitals: endpoint受理と固定dimension logの組をtruthとし、raw valueは保持しない。
- API / AI: serverで確定したstatusとstable reasonだけをtruthとする。

ProductEvent ingestはactor advisory lock内でactor-scoped idempotency / stage確認、actor DB quota、global event ID
collisionの順に評価する。quota到達時はglobal IDを照会せず、他actor既存IDと未知IDを同じ429 Problem Details、
同じheaderへ固定する。unique race後の再判定も同じ順序を使う。

sourceごとに観測開始前のversioned expectation policyと観測終了後のsealed event universeを分離する。
authority jobはwindow開始前にquery version、source、actor scope、半開観測窓、eligible operation、cohort rule、
synthetic / internal actor exclusion allowlistのversion / commitment、sampling policy / key commitmentだけを登録する。
未来のevent IDや発生時刻は事前登録しない。独立した
append-only registryはpolicy commitment、receipt ID、`registered_at_utc`を別keyで署名し、登録時刻がwindow開始以上なら
HOLDにする。window終端を固定cutoffとし、観測後の保護jobがcanonicalなevent ID / operation / flow / actor /
occurrenceの完全なuniverseを別keyでsealする。seal時刻がcutoffより前、policy不一致、manifestとの完全一致失敗は
HOLDにする。

manifestはsource、sampling policy version、sampling key version / commitment、degradation、sealed universe commitment、
sampling適用前のexpected event IDを、保護されたversioned manifest keyで署名する。ingest / DB receiptはevent IDだけで
なくcanonical envelope digest、source、query / window、policy / universe commitment、DB由来`received_at_utc`を署名し、
dimension改変と別windowへのreplayを拒否する。受領順はcallerの配列順ではなく署名済み`received_at_utc`で決め、異なる
eventが同時刻なら順序を推定せずHOLDにする。M2 / M3 / M9は、DB Memoryのexact set、actor、window、生成時刻、policy /
universe commitmentを専用receiptで署名する。receipt内の全Memory rowを期待actorへ完全一致させ、別actor・別flowの
rowを含む正しく署名されたsetもHOLDにする。

authority、universe、manifest、sampling、registry、ingest receipt、Memory truth、evidence、metric decisionの各keyと
sampling keyはすべて異なる32文字以上のsecretとし、通常aggregate callerへ渡さない。evaluatorは保護Environmentの
key versionとHMACをconstant-timeで検証してからversioned policyを適用する。空manifest、manifest欠落、
source不一致、degraded、
policy / sampling key version不一致、loss、unexpected eventはcompleteness Holdである。received envelopeは
型注釈を信用せずexact schemaとcanonical RFC3339 calendar dateで再parseし、発生時刻が半開観測窓の外ならHoldにする。同一event IDの
payloadが異なる重複はconflictとしてHoldにする。
expectedとreceivedが同時に欠落してもPassにしない。duplicateとreorderは
検出状態を残し、event IDと件数をoutputしない。dedup後に全expected eventが存在する場合だけcompletenessを
Passにできる。

funnel correlationは`actor_key_version / actor_token / flow_id`の組で行う。`actor_key_version`は
`TELEMETRY_ACTOR_KEY_VERSION`の`vN`形式を保護Environmentから取得し、caller値をstatus-only evidenceへ転記しない。
completeness inputとprivate metric manifestが保護versionに完全一致しない場合はHOLDにする。stageはclient発生時刻のUTC minute
bucket、受信時刻、`anchor_trust`を持ち、verified anchorだけを判定する。30分windowはminute intervalの
worst-caseでPass / Failを確定し、境界をまたぐ場合、actor不一致、key version不一致、unverified anchorは
Holdにする。時刻の正本はDB `event_id`から復元した`[minute, minute + 1 minute)`で、区間全体がevidence
entry window内にない場合はHoldにする。DB `created_at`はreceiptと遅延・順序の検証だけに使い、entryや
maturityの起点にしない。
M9はentry window内でProfileごとの最初のeligible `memory_viewed`を選び、発生minute区間の終端から
7日後まではHOLDにする。最初のDB Memoryとの順序と7日境界をminute区間のworst caseで判定し、
receipt timeをentry、maturity、conversionの起点にしない。

## Aggregation and privacy

観測開始時のeligible censusを固定してkeyed commitmentだけをevidenceへ渡す。private metric window manifestは
M1〜M9のexact setについて固定anchor、server-derived entry window、maturity rule / cutoffを保持する。Profile anchor、
occurrence minute、内側のUTC週、UTC calendar monthをcode policyから導出し、callerがentry windowやcutoffを縮められない。
eligible census、censoring statusもversioned exact schemaで検証し、未知field、metric欠落、window / query / policy不一致を
HOLDにする。commitmentはcaller指定keyを受け取らず、保護Environmentのversioned evidence keyでdomain、UTC window、
actor key versionをHMAC-SHA256へdomain-separated入力し、通常のSHA digestで置き換えない。
退会中のunitは元の分母に残し、
全censor失敗の下限と全censor成功の上限をjob内だけで計算する。下限がtarget以上ならPass、上限がtarget未満
ならFail、両端で判定が変わる場合はHoldとする。exact census / success / censor / rateは出力しない。
このright-censor rate evaluatorは高いほど良いproduction rateのM1 / M2 / M3 / M5 / M6 / M7 / M8 / M9
だけに使う。minimumとtargetはcallerから受け取らず、M1 / M2 / M3 / M5 / M6 / M7はproduct contractの固定値を
code policyとして使う。M2 / M3はdistinct Profileとflowを、M7はdistinct ProfileとProfile-weekをそれぞれ20以上要求する。
funnel completenessがPASS / completeでない場合、M2 / M3 / M8 / M9は個別rateを直列化せず
`HOLD / telemetry_incomplete`へ強制する。固定maturity cutoff前は`HOLD / window_not_mature`だけを受理する。
M8 / M9はbaseline evidence keyで署名した`baseline` role receiptをtarget decisionへ埋め込み、target、
`at_or_above`方向、target固定時刻、evaluation window、再計測期限を専用target keyでまとめて署名する。
`baseline.window_end <= baseline.generated_at <= target_fixed_at < evaluation.window_start`を満たし、
評価生成時刻が再計測期限を超えないevaluation cohortだけを判定する。
M12など方向が異なる指標は同式へ入れず、`unsupported_metric_direction`でHoldにする。
status-only evidenceはmetric IDごとのreason allowlistも検証し、callerがM12などへright-censor reasonを
直接組み合わせてPASS / FAILを作ることを拒否する。

restricted tableで数値を表示する場合もcell 5未満をprimary suppressionする。suppression対象はversioned table schemaの
固定cell IDだけを受理し、完全なrow / column / total関係をserver側で導出する。caller指定group、未知 / 重複 / 欠落cell、
負数・非整数、合計不一致、識別子を含む任意IDを拒否する。1個のsuppressed cellを差分復元できるgroupでは、最小の
visible cellをsecondary suppressionする。CI、PR、
release dossierは数値tableを持たず、metric ID、固定reason、`PASS / FAIL / HOLD`だけを使う。

## Access separation

raw ProductEventへのauthority契約を次の3経路へ分離する。

- ingest: 認証済みendpointからallowlist済みrowをinsert / idempotent readするだけ
- retention: `created_at` TTL deletionだけ。aggregate readを持たない
- aggregate reader: 承認済みversioned queryの期間readだけ。insert / update / deleteを持たない

通常のapplication handler、ad hoc BI、PR workflow、reviewerはaggregate reader authorityを持たない設計とする。
job outputはstatus-only schemaで検証し、raw row、actor hash、event ID、exact countをartifactへ保存しない。
現在の共通DB credentialだけでは実効的な権限分離を証明できないため、production activationはHoldとする。
table grant、versioned SECURITY DEFINER function、用途別non-owner credential、pg_cron不在時のretention fallbackは
GitHub Issue #379で実装・検証する。ProductEvent全key-version退会purgeとHMAC key lifecycleは
ISSUE-185で実装・検証する。旧continuityをraw identifierなしで観測窓へ不可逆に記録するstatus-only
degradation ledgerはGitHub Issue #384で実装・検証する。保護された`PRODUCT_EVENT_INGEST_ACTIVATION`、
`PRODUCT_EVENT_PURGE_ACTIVATION`、`PRODUCT_EVENT_DEGRADATION_ACTIVATION`の規定値がすべて揃うまで、
production ProductEvent endpoint自身が503でwriteを拒否する。一部だけの有効化、欠落、未知値は同じ
status-only failureとして扱い、どの境界が不足したか、secret、PIIをresponseやlogへ出さない。

匿名Web Vitalsは必須`Origin`と`Sec-Fetch-Site: same-origin`を含む同一origin JSON browser requestだけを受け、
versioned server-only HMACでsamplingする。productionでは
信頼済みedge attestation、proxy header上書き、共有client/global rate limitが揃うまでendpoint自身が503で拒否する。
process-local limiterは開発時と共有edge後のdefense-in-depthに限定する。

## North Star

North Starは「UTC calendar month内に非削除Memoryを1件以上作成したProfile」をactive unitとし、同じ月の
非削除Memoryを`memory_id`でdedupした件数を分子にする。窓は`[month start, next month start)`、
保存日時は`Memory.createdAt`を使う。ProductEventや`recordedAt`はactive判定へ使わないため、
completeness sourceはDB Memory truthである。単独ではGoにせずdiagnosticを維持する。

## Evidence

`hana-telemetry-evidence/v4`はsource SHA、UTC window、query / event schema version、保護されたactor key version、
window manifest / eligible census / censoring statusのdomain-separated keyed commitment、4つの必須sourceの
completeness、metric別statusとreason、全体status、evidence integrity digestだけを持つ。必須sourceの欠落・
余分、commitmentのdomain / window / key version不一致、metric status / reason不一致、未知値はfail closedにする。
