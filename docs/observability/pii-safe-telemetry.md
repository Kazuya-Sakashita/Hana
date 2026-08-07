# PII-safe telemetry contract

- Status: active
- Version: `issue-152-v1`
- Event schema: `hana-telemetry-event/v1`
- Retention: 90 days

## Boundary

API、AI、Web Vitals、記録funnelを、個人の行動履歴や自由記述を作らずに同じ固定dimensionへ変換する。
外部monitoring provider、ProductEventの退会purge、HMAC key rotation、product thresholdはこの契約の
対象外であり、それぞれ後続Issueとproduct validation contractを正とする。

## Event schema

共通eventは次のenvelopeと、5個の固定dimensionだけを持つ。

```json
{
  "schema_version": "hana-telemetry-event/v1",
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

| source     | operation                          | reason / status                       | route / duration                                             |
| ---------- | ---------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| funnel     | 既存5 event名                      | `stage_observed / success`            | `record`または`memory`、既存elapsed bucket                   |
| Web Vitals | `web_vital_{cls,fcp,inp,lcp,ttfb}` | `not_applicable`と固定rating          | sanitized pathを固定route groupへ変換し、raw valueをbucket化 |
| API        | `api_request`                      | stable Problem `reason`とstatus class | operationごとの固定route group、duration bucket              |
| AI         | `ai_generation`                    | allowlist済み失敗理由と固定outcome    | `ai`、duration bucket                                        |

samplingはfunnel / AIを100%、Web Vitals / APIを10%とする。sampling decisionはevent IDのstable hashで
決定し、利用者属性、結果、本文で変えない。dimension cardinalityはcode allowlistの直積を上限とし、
未知値を`other`へ丸めて受理せず拒否する。

## ProductEvent flow lifecycle

記録作成ではProductEvent `flow_id`とMemory作成の`Idempotency-Key`に同じUUIDを使う。

| transition                    | flow rule                  | stage rule                                          |
| ----------------------------- | -------------------------- | --------------------------------------------------- |
| 新規記録                      | 新しいUUID                 | `record_started`から開始                            |
| 同じtabの下書き復元           | 保存済みUUIDを継承         | 同じflow / stageはserverとoutboxでdedup             |
| uploadまたは保存の通信retry   | UUIDを継承                 | 同じ`event_id`をackまで再送                         |
| 写真追加・削除・並べ替え      | 旧flowを終了して新しいUUID | 新flowで現在存在するstageを再送                     |
| `memory_idempotency_conflict` | 旧flowを終了して新しいUUID | 内容を保持し、新flowで再試行                        |
| DB Memory作成成功             | UUIDをMemoryへ保存         | DB Memoryを保存の正とし、`memory_saved`は補助signal |

client outboxは送信前にsessionStorageへ4 fieldのProductEventと`queuedAt / attempts / nextAttemptAt`だけを
保存する。204だけをackとし、同じevent IDを指数backoffで再送する。最大50件、TTL 24時間で、容量超過時に
古い未ack eventを追い出してcompletenessを偽装しない。outboxが使えないbrowserでは記録操作を止めないが、
該当観測窓のcompletenessは証明できないためHoldにする。
サインアウト、退会完了、401 / 403ではoutbox全体を破棄し、別actorへの再送を禁止する。この破棄はackではなく、
該当観測窓をHoldにする認証境界である。

## Server truth and completeness

- `memory_saved`: 同じUUIDのDB Memory作成がserver truth。
- `photo_selected`、`ai_draft_shown`、`memory_viewed`: durable outboxの204 ackとDB ProductEventがtruth。
- Web Vitals: endpoint受理と固定dimension logの組をtruthとし、raw valueは保持しない。
- API / AI: serverで確定したstatusとstable reasonだけをtruthとする。

sourceごとに観測開始前のexpected event ID manifestとreceived IDを比較し、loss、duplicate、reorderを
別々に判定する。lossまたはunexpected eventがあればcompletenessはHoldである。duplicateとreorderは
検出状態を残し、event IDと件数をoutputしない。dedup後に全expected eventが存在する場合だけcompletenessを
Passにできる。ProductEventがDB Memoryより後に届いたflowは離脱へせずHoldとする。

## Aggregation and privacy

観測開始時のeligible censusを固定してdigestだけをevidenceへ渡す。退会中のunitは元の分母に残し、
全censor失敗の下限と全censor成功の上限をjob内だけで計算する。下限がtarget以上ならPass、上限がtarget未満
ならFail、両端で判定が変わる場合はHoldとする。exact census / success / censor / rateは出力しない。

restricted tableで数値を表示する場合もcell 5未満をprimary suppressionする。行・列・合計など1個の
suppressed cellを差分復元できるgroupでは、最小のvisible cellをsecondary suppressionする。CI、PR、
release dossierは数値tableを持たず、metric ID、固定reason、`PASS / FAIL / HOLD`だけを使う。

## Access separation

raw ProductEventへのauthorityを次の3経路へ分離する。

- ingest: 認証済みendpointからallowlist済みrowをinsert / idempotent readするだけ
- retention: `created_at` TTL deletionだけ。aggregate readを持たない
- aggregate reader: 承認済みversioned queryの期間readだけ。insert / update / deleteを持たない

通常のapplication handler、ad hoc BI、PR workflow、reviewerはaggregate reader authorityを持たない。
job outputはstatus-only schemaで検証し、raw row、actor hash、event ID、exact countをartifactへ保存しない。
production credential配布とProductEvent全key-version purgeはISSUE-185の人間承認境界を維持する。

## North Star

North Starは「UTC calendar month内に非削除Memoryを1件以上作成したProfile」をactive unitとし、同じ月の
非削除Memoryを`memory_id`でdedupした件数を分子にする。窓は`[month start, next month start)`、
保存日時は`Memory.createdAt`を使う。ProductEventや`recordedAt`はactive判定へ使わないため、
completeness sourceはDB Memory truthである。単独ではGoにせずdiagnosticを維持する。

## Evidence

`hana-telemetry-evidence/v1`はsource SHA、UTC window、query / event schema version、actor key version、
eligible census digest、censoring policy / status digest、source別completeness、metric別statusとreason、
全体status、evidence digestだけを持つ。構成要素の欠落・不一致・未知値はHoldにする。
