# 0019. Telemetry契約をbare UUIDと全dimension matrixへ統一する

- Status: accepted
- Date: 2026-08-08
- Deciders: Kazuya-Sakashita
- Related: ISSUE-188 / GitHub Issue #381
- Supersedes implementation evidence from: ISSUE-152 / GitHub Issue #322 / PR #378

## Context

PR #378の正式な第5巡で、OpenAPIとruntimeのUUID受理範囲、Web Vitals dimension matrix、
ProductEvent outbox、status-only metric reason、M9の7日評価に7件の矛盾が確認された。
旧PRへ追加commitすると常時HOLDの第6巡になるため、旧PRを未マージでcloseし、ISSUE-188へ置換した。

## Decision

- Web Vitals `event_id`、ProductEvent `flow_id`、Memory `Idempotency-Key`はハイフン区切りの
  bare UUIDだけを受け付ける。`urn:uuid:`は拒否し、大小文字はlowercaseへcanonical化する。
- UUID versionとvariantはOpenAPI `format: uuid`より狭めず、nil、version 9、非RFC variantを受理する。
- Web Vitalsの`operation × status × duration_bucket`全105組をOpenAPIと共有runtime helperで一致させる。
- Web Vitals route groupはOpenAPIの7値を共有allowlistとして全入口で使う。
- ProductEvent `event_name × elapsed_bucket`を共有pure helperで検証し、不正outbox rootを送信しない。
- status-only evidenceはmetric IDごとのreason allowlistを検証する。
- status-only evidenceはM1〜M12の完全なmetric集合を必須にし、欠測metricからPASSを生成しない。
- M9は最初のeligible `memory_viewed`のoccurrence-minute区間と7日maturityを使い、receipt timeを
  entryまたはmaturityの起点にしない。completenessのview ID集合と評価入力を完全一致させる。
- telemetry envelopeのUUIDはsampling、dedup、expected / received比較前にlowercaseへcanonical化する。
- outboxはbinding continuityをpayloadより先に判定し、未来queueと不正retry metadataを送信しない。
- outboxの24時間TTLとretry上限はUUIDv7の発生minuteを起点にし、terminal 4xxはraw entryを削除して
  `DELIVERY_REJECTED`だけを残す。4xxの例外は401 / 403のbinding再取得と408 / 425 / 429のretryだけにする。
- malformed、primitive、binding帰属不能なoutbox rootは現在continuityを`STORAGE_UNAVAILABLE`へ固定し、
  構文解析できた別continuity rootだけを現在continuityのdegradationなしで削除する。
- ProductEvent runtimeはOpenAPIどおりJSONだけをparse前に受理し、cross-actor event IDの存在を応答で
  区別しない。payload固有validationはactor別DB lookupより先に完了する。actor DB quota到達時はglobal
  event ID lookupを行わず、他actor既存IDと未知IDを同じ429へ固定する。unique raceも同じ順序で再判定する。
- completenessはmanifestと独立した保護authority policy登録を必須にする。authority HMACは観測開始前に
  query version、source、actor scope、観測窓、eligible operation、cohort / exclusion rule、sampling policy /
  key commitmentを拘束し、未来のevent IDは登録しない。独立registry receiptはwindow開始前の登録を証明する。
- 観測後の保護jobはwindow終端をcutoffとしてevent ID / operation / flow / actor / occurrenceの完全なuniverseを
  別keyでsealする。manifestはsealed universeとexpected IDを保護されたmanifest keyで完全一致させる。
- ingest receiptはDB由来`received_at`に加えてcanonical envelope digest、query / window、source、authority /
  universe contextを署名する。受領順は署名時刻で決め、同時刻はHOLDにする。M2 / M3 / M9のDB Memory exact setも
  actor / window / authority contextとともに専用keyで署名する。
- rate metricのminimum / targetはcode policyへ固定する。M2 / M3 / M7はProfileとflow / Profile-weekの両minimumを
  検証し、M8 / M9は保護されたtarget decisionとbaseline chronologyが有効なevaluation cohortだけを判定する。
- status-only evidenceはexact private schemaだけを受理し、caller指定keyではなく保護されたversioned evidence keyで
  commitmentを作る。suppression topologyは固定table schemaからserver側で導出する。
- manifest、authority、universe、sampling commitment、registry、ingest receipt、Memory truth、evidence、metric
  decision、samplingのkey reuseはいずれもHOLDする。
- status-only degradation ledgerはGitHub Issue #384へ分離し、`issue-190-v1`専用activationがない限り
  production ProductEvent ingestを503でHOLDする。
- query versionを`issue-188-v2`へ上げ、旧evidenceと混在させない。

## Compatibility and approval

OpenAPIで従来受理し得たUUID URNと矛盾Web Vitals dimensionを拒否するためbreaking changeである。
mainとの差分から新しいexact `oasdiff` reportを生成し、次をすべて満たすまでHOLDとする。

1. report件数と正規化SHA-256を人間が明示承認する。
2. ISSUE-188名義の期限付きexact-report waiverを記録する。
3. PRへ保護された`openapi-breaking-approved` labelを付ける。
4. 最新SHAを6 roleがfresh round 1からレビューし、全件GOにする。

ISSUE-152のreport hash、waiver、review、ISSUE-173例外proofは再利用しない。

Candidate exact reportは21件（error 16 / warning 5）、GitHub Action互換の改行正規化後
SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`である。
2026-08-08T01:48:02Zに`Kazuya-Sakashita`が上記21件とexact report SHA-256だけを
明示承認した。waiverの期限、保護label、最新SHAのfresh reviewとCIのいずれかが欠けた場合はHOLDする。

## Consequences

- OpenAPI-valid / runtime-invalidのvalidation oracleを除去できる。
- flow IDとMemory idempotency keyは大小文字やUUID variantに左右されず同じ値へ相関する。
- 壊れたoutbox、矛盾dimension、metric reasonのcaller bypassをnetworkまたはevidenceへ通さない。
- callerがmanifest、received、評価eventから同じ早期eventを省略、relabel、flow / actor rebindingしても、
  pre-window policy、post-window sealed universe、trusted receiptによりHOLDできる。
- callerが受信配列、Memory集合、metric threshold、private commitment key、suppression groupを変更しても
  PASSや再識別可能なsmall-cell outputを作れない。
- 別sessionのraw outboxを送信せず、durable degradation authority未完成の状態でproduction eventを蓄積しない。
- 旧clientがUUID URNまたは矛盾Web Vitals payloadを送る場合は422になるため、client/serverの原子的更新が必要になる。

## Rollback

production telemetry activationの3つの独立gateを維持したままPR全体をrevertする。OpenAPIだけ、
clientだけ、serverだけを部分的に戻さず、query versionを旧値へ再利用しない。
