---
id: ISSUE-188
title: 'ISSUE-152置換: PII-safe telemetry契約のRound 5所見を解消する'
priority: P1
status: review
size: M
created_at: 2026-08-08
github_issue: 381
release_gate: observability
requires_human_review:
  - security
  - privacy
  - analytics
  - api_contract
---

# ISSUE-188: ISSUE-152置換: PII-safe telemetry契約のRound 5所見を解消する

## 目的 (Why)

PR #378の正式な第5巡で検出された7件のtelemetry契約矛盾を、OpenAPI、client、server、status-only evidenceで一貫してfail closedに解消し、未完了のISSUE-152を置換する。

## スコープ (What)

- ISSUE-152の全受け入れ条件
- Web VitalsとProductEventのUUIDおよびdimension契約
- durable outboxの復元時検証
- metric別reason / status-only evidence
- M9のoccurrence-minuteと7日maturity評価
- 新しいbreaking report、waiver、人間承認
- 最新SHAに対する6 roleのfresh review

## やらないこと (Out of Scope)

- 外部monitoring providerの本番配線
- PII、画像情報、本文、URL、storage key、raw user IDの収集
- product thresholdとGo / Holdの決定（ISSUE-159）
- 退会purgeとHMAC key lifecycle（ISSUE-185）
- production DB authorityとretention activation（ISSUE-186 / GitHub Issue #379）
- status-only degradation ledger（GitHub Issue #384）
- Web Vitals edge attestationとshared rate limit（ISSUE-187 / GitHub Issue #380）

## 影響範囲

- Web VitalsとProductEventのrequest schemaをOpenAPI-firstで厳密化する
- UUID表現、dimension組み合わせ、outbox復元、route allowlistへ影響する
- status-only evidenceのmetric別reasonとM9 occurrence-minute evaluatorへ影響する
- generated API型はgenerator経由で同期する
- DB schema、production activation、外部monitoring providerは変更しない
- OpenAPI破壊変更は新しいexact report、ADR、waiver、人間承認を必要とする

## 受け入れ条件 (Acceptance Criteria)

### ISSUE-152から引き継ぐ条件

- [x] operation、stable reason、route group、status、duration bucketだけを許可する共通event schemaを定義する
- [x] request body、生成本文、画像情報、URL、storage key、raw user IDを拒否する
- [x] sampling、保持期間、cardinality上限、重複eventの扱いを定義する
- [x] funnel、Web Vitals、API、AIの合成イベントからstatus-only集計を生成できる
- [x] 記録flow IDとMemoryのidempotency keyを同一UUIDとして扱い、DB確定Memoryを保存成功の正にする
- [x] 下書き復元、写真変更、409 conflict、retry、idempotency key再生成時のflow継承・終了・再採番規則を固定する
- [x] stage eventの再送、重複、欠測でもDB保存との相関を誤らない合成testを追加する
- [x] `memory_saved`欠測、重複、順序逆転を離脱へ誤分類しない
- [x] `photo_selected`、`ai_draft_shown`、`memory_viewed`ごとにserver truthまたはdurable client outboxのack / retryを持つ
- [x] expected-versus-received、loss、duplicate、reorderをstatus-onlyで検証し、silent lossをcompleteness PASSにしない
- [x] eligible censusと退会right-censorをactor非識別aggregateとして固定し、削除後の分母縮小を検知する
- [x] worst-case区間からPASS / FAIL / HOLDだけを生成し、exact census / censor countを証跡へ出さない
- [x] raw event accessのauthority契約とproduction HOLD境界を固定する
- [x] production ProductEvent ingestをISSUE-186、ISSUE-185、degradation ledgerの独立したversioned activationへ3重拘束する
- [x] primary / secondary suppressionを適用する
- [x] completeness、query version、actor key version、eligible census digest、censoring policy / status digestをstatus-only evidenceへ含める
- [x] North Starのactive unit、UTC entry window、重複排除、event completenessを固定する
- [x] 未知フィールドと高頻度送信をfail closedまたはrate limitする

### 第5巡finding

- [x] ProductEventの`event_name × elapsed_bucket`を共通pure helperで検証し、不正な永続outbox rootを送信、再試行せず破棄してstatus-only degradationだけを残す
- [x] metric IDごとのreason / status allowlistを固定し、M12など非対応metricでright-censor reasonからPASS / FAILを生成できない
- [x] M9を最初のeligible `memory_viewed`、UUIDv7 occurrence-minute全区間、7日maturity、completeness、遅延receipt、境界時刻に基づいて評価する
- [x] Web Vitals envelopeのroute groupをOpenAPIの7値へ共通化し、`ai / metrics / account`を拒否する
- [x] Web Vitalsの`operation × status × duration_bucket`全組み合わせをOpenAPIとruntimeで同じ判定にする
- [x] ProductEvent `flow_id`とMemory `Idempotency-Key`のUUID契約とcanonical表現をOpenAPI、client、serverで単一化する
- [x] Web Vitals UUIDのbare UUID / URN受理方針をOpenAPI、client、serverで完全一致させる

### Round 2 findings

- [x] query version、actor scope、観測窓、全eligible event IDを独立authority HMACへ事前登録し、manifestの自己申告省略をHOLDにする
- [x] outbox復元、TTL、retry上限をUUIDv7 occurrence minuteへ拘束し、terminal 4xxを再送しない
- [x] ProductEvent payload固有validationをactor別DB lookupより前に完了し、validation順序の存在oracleを閉じる
- [x] M9 DB Memory truthのactor不一致と、E2E DB oracleへの別actor同一flow混入を回帰testでHOLD / 除外する

### Round 3 findings

- [x] authority登録をevent IDだけでなくoperation、flow、actor、occurrence、保護sampling構成へ拘束する
- [x] window開始前の独立registry receiptとingest / DB由来の受領receiptを検証し、post-hoc登録とreceipt改ざんをHOLDにする
- [x] malformed / primitive / 帰属不能outbox rootを送信せず削除し、現在continuityを`STORAGE_UNAVAILABLE`へ固定する
- [x] 4xxを原則terminal rejectionとし、401 / 403、408、425、429だけを専用経路またはretryへ残す
- [x] outbox timing metadata testを固定時刻、valid control、単一変異、exact boundaryで検証する
- [x] DB quota到達時のglobal event ID照会を防ぎ、他actor既存IDと未知IDを同じ429へ固定する

### 検証と承認

- [x] OpenAPIを先に更新し、生成型を`pnpm openapi:gen`だけで同期する
- [x] query versionを`issue-188-v1`へ更新し、旧evidenceと混在させない
- [x] 全組み合わせcontrast test、client / server / outbox / evidence回帰testを追加する
- [x] `pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm typecheck`、全test、`pnpm pr:gate`を通す
- [x] 新しいoasdiff exact reportを生成し、旧ISSUE-152 waiverを再利用せず新ADR、新waiver、人間承認を取得する
- [ ] 最新SHAをspec / analytics、implementation、test reliability、API contract、security、privacyの6 roleでfresh round 1からレビューする
- [ ] 全role GO、CI成功、専用App gate成功までmergeしない

## セキュリティ・プライバシー考慮

- 許可リスト外fieldと矛盾dimensionを全入口で拒否する
- 壊れたoutbox payloadをnetworkへ送らず、payloadを削除してstatus-only degradationだけを残す
- UUIDはbare canonical表現へ統一し、相関キーの曖昧性を残さない
- raw event、actor identifier、exact countをevidenceへ含めない
- production activationの既存2条件を緩和せず、degradation ledgerの第3条件を追加する
- degradation ledgerの専用activationを加え、3条件が揃うまでproduction ingestをHOLDする

## Review recovery

- PR #378の第5巡HOLD、旧review、ISSUE-173例外proof、breaking waiverは合格証拠として再利用しない
- ISSUE-188の最初の正式reviewを第1巡として扱う
- 第5巡前に7 findingsをすべて修正し、正式review対象SHAを固定する

## Fresh review history

Round 1はbase `e6c891ecde1ba3f51b739361d3cd3de4433835a3`、head
`e2e73989eb90a429c2c0ef5a27a8afe39f4ed88d`を6 roleが独立・read-onlyで確認した。

| role                        | 判定 | findings |
| --------------------------- | ---- | -------: |
| spec acceptance / analytics | HOLD |        1 |
| implementation correctness  | HOLD |        1 |
| test reliability            | HOLD |        3 |
| API contract                | HOLD |        2 |
| security / authorization    | HOLD |        1 |
| privacy / data protection   | HOLD |        3 |

Issue Captainが重複したmedia type findingを統合し、10件をactionableとして保持した。M9 view集合、
outbox continuity帰属、M1〜M12集合、UUID canonicalization、Node 26 test、JSON media type、未来queue、
cross-actor oracleを本Issueで修正した。status-only degradation ledgerはGitHub Issue #384へ分離し、
専用activationが完成するまでproduction ingestを503へ固定した。label付与前eventに拘束された旧CI failureは、
修正commitのfresh pull_request eventで再評価する。修正後headはfresh Round 2で6 roleすべてを再実行する。

Round 2はbase `e6c891ecde1ba3f51b739361d3cd3de4433835a3`、head
`3fe22dfa1ad19f9d0b6264733107780e7e15132f`を6 roleが独立・read-onlyで確認した。

| role                        | 判定 | findings |
| --------------------------- | ---- | -------: |
| spec acceptance / analytics | HOLD |        1 |
| implementation correctness  | HOLD |        1 |
| test reliability            | HOLD |        2 |
| API contract                | HOLD |        1 |
| security / authorization    | HOLD |        2 |
| privacy / data protection   | HOLD |        1 |

Issue Captainが重複したauthority universe findingとoutbox occurrence findingを統合し、6件をactionableとして
保持した。独立authority登録、発生minute基準TTL、terminal 4xx破棄、DB lookup前validation、M9 DB truth actor反例、
E2E actor-scoped oracleを本Issueで修正する。修正後headを固定し、通常上限のRound 3で6 roleすべてを再実行する。

Round 3はbase `e6c891ecde1ba3f51b739361d3cd3de4433835a3`、head
`201abc3f039971846a3912ce4e132d8a7de68633`を6 roleが独立・read-onlyで確認した。

| role                        | 判定 | findings |
| --------------------------- | ---- | -------: |
| spec acceptance / analytics | HOLD |        2 |
| implementation correctness  | HOLD |        3 |
| test reliability            | HOLD |        2 |
| API contract                | GO   |        0 |
| security / authorization    | HOLD |        2 |
| privacy / data protection   | GO   |        0 |

Issue Captainが生9件を6つの修正単位へ統合した。authority event semantics、sampling authority、
pre-window registrationとtrusted receiptを1つのcryptographic boundaryとして修正し、malformed outbox、
terminal 4xx、timing test、DB quota oracleを独立回帰testで閉じる。通常上限のRound 3でfindingが出たため、
修正後headに一致するISSUE-173 protected Environment / GitHub OIDC / dedicated App checkが成功するまで
Round 4を開始しない。

## 実装結果

- `event_name × elapsed_bucket`を生成schema型付きshared predicateへ集約し、client outboxとserver parserを同期した
- 不正な永続outbox rootを送信、再試行せず削除し、status-only degradationだけを残すようにした
- Web Vitalsのroute group、status / duration matrix、bare UUIDをOpenAPIとshared runtime helperへ統一した
- ProductEvent `flow_id`とMemory `Idempotency-Key`をgeneric bare UUIDとして受理し、lowercaseへcanonical化した
- metric IDごとのreason allowlistを追加し、非対応metricでright-censor reasonを使うcaller bypassを拒否した
- M9 evaluatorを最初のeligible `memory_viewed`、occurrence-minute全区間、7日maturity、DB Memory truthへ固定した
- M9のreceived / supplied view ID集合を完全一致させ、callerによる最初のview省略をHOLDにした
- status-only evidenceでM1〜M12を必須にし、metric欠測から全体PASSを生成できなくした
- envelope UUIDをsampling、manifest、dedup、completeness比較前にlowercaseへcanonical化した
- outboxのbinding帰属をpayload検証より先に行い、別continuityへのdegradation誤帰属と未来queueを拒否した
- outboxのTTLとretry上限をUUIDv7の発生minuteへ拘束し、terminal 4xxのraw entryを再送せず削除した
- ProductEvent ingestをJSON-onlyにし、cross-actor event ID collisionを204で秘匿した
- ProductEventのpayload固有validationをactor別DB lookupより先に完了させた
- query version、actor scope、観測窓、全eligible IDを別keyで事前署名するauthority登録を必須にした
- expectation manifest v4 / authority registration v2へ上げ、eventごとのoperation、flow、actor、occurrenceと
  protected sampling commitmentをauthority HMACへ拘束した
- window開始前の独立registry receiptと、event ID / DB由来received timeのingest receiptを別keyで検証し、
  protected key reuse、post-hoc登録、receipt改ざんをHOLDにした
- M2 / M3 / M9をauthority tupleとsigned receiptへ照合し、operation relabel、flow / actor rebinding、
  caller supplied receipt timeからPASSを生成できないようにした
- malformed / primitive / 帰属不能outbox rootを現在continuityの`STORAGE_UNAVAILABLE`へ置換し、4xxを
  401 / 403、408 / 425 / 429以外terminal rejectionにした
- actor-scoped dedup、DB quota、global collisionの順序を通常・unique raceで共通化し、quota時の
  他actor既存IDと未知IDを同じ429 responseへ固定した
- E2E telemetry DB oracleをserver-derived actor hashへ限定し、同じflowの別actor noiseを除外した
- degradation ledgerをGitHub Issue #384へ分離し、専用activation未完成時のproduction ingestをHOLDにした
- query versionを`issue-188-v1`へ更新し、ISSUE-152 evidenceとの混在を禁止した

## 検証結果

- Round 3修正の統合focused suite 5 files / 314 tests PASS。追加のoperation relabel / flow rebind反例2件PASS
- 最新`pnpm pr:gate` PASS（196 files中190 PASS / 6 skip、2005 tests中1982 PASS / 23 skip、production build成功）
- 最新専用PostgreSQL 16へ19 migrationを適用し、認証済みChromium E2E 5件PASS。合成containerは検証後削除
- Round 2修正対象5 files / 209 tests PASS
- `pnpm openapi:lint` PASS（既存warningのみ）
- `pnpm openapi:gen` PASS
- 固定oasdiff imageによるmainとの差分は21件（error 16 / warning 5）
- GitHub Action互換の改行正規化後exact report SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`
- 2026-08-08T01:48:02Zに`Kazuya-Sakashita`が上記21件とexact report SHA-256だけを明示承認した
- waiver `issue-188-telemetry-contract-v1`を期限2026-08-22で記録し、保護labelを付与した。
  最新head専用のRound 4 exception proofとfresh 6 role reviewはpending

## 参考

- GitHub Issue #381
- ISSUE-152 / GitHub Issue #322（未完了・置換済み）
- GitHub PR #378（第5巡HOLD・未マージclose）
- ISSUE-159
- ISSUE-173
- ISSUE-185
- ISSUE-186 / GitHub Issue #379
- ISSUE-187 / GitHub Issue #380
