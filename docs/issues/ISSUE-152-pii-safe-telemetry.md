---
id: ISSUE-152
title: PII-safe telemetry集約基盤を作る
priority: P1
status: blocked
size: M
created_at: 2026-08-03
github_issue: 322
release_gate: observability
requires_human_review:
  - security
  - privacy
  - analytics
---

# ISSUE-152: PII-safe telemetry集約基盤を作る

## 目的 (Why)

API、AI、性能、記録funnelを同じPII-safe telemetry契約で集約する。

## スコープ (What)

- allowlist型の共通event schema
- sampling、保持期間、cardinality、重複契約
- 合成eventからのstatus-only集計
- 記録flowとDB確定Memoryのdurable correlation
- event別のserver truthまたはdurable client ack / retryとexpected-versus-received completeness
- privacy-safeなcohort census、退会right-censor、status-only evidence
- ingest / retention / aggregate readerのleast-privilege分離
- primary / secondary suppressionとtelemetry completeness
- 未知フィールドと高頻度送信のfail-closed検証

## やらないこと (Out of Scope)

- 外部monitoring providerの本番配線
- PII、画像情報、本文、URL、raw user IDの収集
- product thresholdとGo/Holdの決定（ISSUE-159）
- 退会purgeとHMAC key lifecycle（ISSUE-185）

## 影響範囲

- `ProductEventReport`へ発生minuteとactor拘束headerを追加し、`flow_id`とMemory `Idempotency-Key`の意味契約を同期する
- 記録画面の下書き復元、写真構成変更、保存retry、409 conflict時のflow lifecycleとサインアウト時のlocal cleanup
- actor拘束済みProductEvent client outbox、cookie-less Web Vitals v2の低cardinality変換、合成telemetry aggregate
- status-only completeness、suppression、right-censor、North Star evidenceと回帰test

OpenAPIのpathと成功response、production DB、外部monitoring providerは変更しない。requestとAppUser生成型は
第一者clientと原子的に更新する。production DB authority / retention activationは#379、全key version退会purgeと
HMAC key lifecycleはISSUE-185へ分離し、両方のreadinessが完了するまでproduction telemetry activationをHoldにする。

## 受け入れ条件 (Acceptance Criteria)

- [x] operation、stable reason、route group、status、duration bucketだけを許可する共通event schemaを定義する
- [x] request body、生成本文、画像情報、URL、storage key、raw user IDを拒否する
- [x] sampling、保持期間、cardinality上限、重複eventの扱いを定義する
- [x] funnel、Web Vitals、API、AIの合成イベントからstatus-only集計を生成できる
- [x] 記録flow IDとMemoryのidempotency keyを同一UUIDとして扱い、DB確定Memoryを保存成功の正にする
- [x] 下書き復元、写真変更、409 conflict、retry、idempotency key再生成時のflow継承・終了・再採番規則を固定する
- [x] 上記各遷移でstage eventを再送・重複・欠測してもDB保存との相関を誤らない合成testを追加する
- [x] `memory_saved`欠測、重複、順序逆転を離脱へ誤分類しない
- [x] `photo_selected`、`ai_draft_shown`、`memory_viewed`ごとにserver-side truthまたはdurable client outboxのack / retryを持つ
- [x] eventごとのexpected-versus-received、loss、duplicate、reorderをstatus-onlyで検証し、silent lossをcompleteness PASSにしない
- [x] 観測開始時のeligible censusと退会right-censorをactor非識別のaggregateとして固定し、削除後の分母縮小を検知する
- [x] censorを全失敗 / 全成功とするworst-case区間からPASS / FAIL / HOLDだけを生成し、exact census / censor countを証跡へ出さない
- [x] raw event accessのauthority契約とproduction HOLD境界を固定する（DB role / retention実効化は#379）
- [x] production ProductEvent ingestを#379とISSUE-185の独立したversioned activationへ二重拘束する
- [x] 分母・分子・補集合と関連表へprimary / secondary suppressionを適用する
- [x] event completeness、query version、actor key version、eligible census digest、censoring policy / status digestをstatus-only evidenceへ含める
- [x] North Starのactive unit、UTC entry window、重複排除、event completenessを固定する
- [x] 未知フィールドと高頻度送信をfail-closedまたはrate limitするテストを追加する
- [x] API契約変更がある場合はOpenAPIを先に更新する

## セキュリティ・プライバシー考慮

許可リスト外のfieldを拒否し、合成eventだけで検証する。

## 実装結果

> 2026-08-08: 正式な第5巡で7件の必須修正が残ったため未完了。追加commitは常時HOLDの第6巡になるため、GitHub Issue #322とPR #378を未マージでcloseし、全受け入れ条件をISSUE-188 / GitHub Issue #381へ置換した。

- 共通event schema、sampling、90日保持、cardinality、completeness、suppression、right-censor、status-only evidenceを固定した
- ProductEventを送信前にdurable outboxへ保存し、204応答だけをackとして同一event IDで再送するようにした
- 発生minuteをUUIDv7 event IDへ埋め込み、既存DB `event_id / created_at`から発生minuteとreceipt timeを復元できるようにした
- `getUser()`と`getClaims()`を突き合わせたJWT `session_id`拘束binding v3をoutbox rootとheaderへ固定し、同一sessionのtoken rotationだけをcontinuity tagで継続するoutbox v4へ更新した
- 401 / 403後の強制binding再取得を1回・有限timeoutに制限し、拒否binding tombstone、continuity単位degradation、AbortController、binding generationで旧sessionの再送と遅延書込みを遮断した
- durable enqueue失敗時のdirect sendを廃止し、capacity / TTL / storage / auth degradationをfail-closedに保持した
- 記録flowとMemory `Idempotency-Key`を同期し、下書き復元・写真変更・retry・409 conflictの遷移規則を実装した
- Web Vitalsをbrowser内で固定dimensionへ変換し、raw ID・値・path・navigation typeを送らず、cookieをomitするv2 requestへ同期した
- Web Vitals / APIの10% samplingをversioned server-only HMACへ統一し、manifestへkey versionとkey commitmentをcommitした
- completeness評価でreceived envelopeのruntime / canonical RFC3339再検証、半開観測窓、内容が異なるduplicate、actor key version、UUIDv7発生minuteをfail closedにした
- 合成ブラウザE2Eで検証済みJWT `session_id`と、Memory `Idempotency-Key` / ProductEvent `flow_id` / 204 ack / DB truthの相関を検証するようにした
- ProductEvent DB role / retention fallbackはreviewer上限を超えない独立した承認境界として#379へ分離した
- Web Vitals edge attestation / 共有rate limitは#380へ分離し、両境界とも有効化前のproduction ingestを503にした
- 本番credential、退会purge、HMAC key lifecycleはISSUE-185の人間承認境界を維持し、#379とISSUE-185の
  versioned activationが両方揃うまでproduction ProductEvent ingestを503にした
- ProductEventの発生時刻をDB `event_id`由来のminute区間へ固定し、区間全体がevidence window内にない場合をHOLDにした
- Web VitalsのUUID受理範囲をOpenAPIへ揃え、共有threshold表でstatusとduration bucketの矛盾を422にした
- right-censorを高いほど良いproduction rate 8指標へ限定し、M12などをHOLDにした
- samplingのcanonical NUL区切り入力を事前計算済みHMAC test vectorで固定し、query versionを`issue-152-v3`へ更新した

## 検証結果

- `pnpm openapi:lint` PASS（既存warningのみ）
- `pnpm openapi:gen` PASS
- `pnpm openapi:auth-contract` PASS（24 operations / 20 private）
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check` PASS
- `pnpm test` PASS（194 files中188 PASS / 6 skip、1764 tests中1741 PASS / 23 skip）
- `pnpm pr:gate` PASS（`origin/main`取り込み後の全検査・buildを含む）
- 合成browser E2Eは5 / 5 PASS。Memory `Idempotency-Key`、3段階ProductEventの同一`flow_id`、全204 ack、DB truthの相関を確認した
- 最新`oasdiff breaking`は19件（error 14 / warning 5）、GitHub Actionと同じ改行正規化後のexact report SHA-256は`b44a1678c98362151a61d0d7ebbdf64c7eabc678e2e0b41dd3d5f9f319a99a8e`
- 2026-08-07T22:10:52Zに`Kazuya-Sakashita`が上記19件のexact reportだけを明示承認し、旧16件waiverを`superseded`、最新waiverを期限2026-08-21で記録した
- PR #378へ`openapi-breaking-approved` labelを復元し、labelを含む最新workflow eventでwaiverを検証する
- 第1巡はcommit `1814d03`をsecurity / privacy / analyticsの3名が独立reviewし、3 / 6 / 5件のactionable findingで全員HOLD
- 第2巡はcommit `bcbfd06`を6つの必須roleが独立reviewし、重複を除く所見を修正した
- 第3巡はcommit `a4c54da`を6つの必須roleが独立reviewし、privacy以外のactionable findingを修正した
- 第4巡前preflightでanalytics 2件、security 1件、privacy 3件を検出して修正し、3領域とも独立再レビューで`NO FINDINGS`。正式な第4巡には数えない
- 正式な第4巡はcommit `b51a946`を6つの必須roleが独立reviewし、implementation / securityはGO、test reliability 4件、analytics 3件、API contract 1件、privacy 1件でHOLD
- 第4巡HOLDは例外証跡を付けた専用App run `31225195289`で`specialist-review-gate`と`merge-eligibility`へ反映し、9件を修正した
- 正式な第5巡はcommit `8764fad`を6つの必須roleが独立reviewし、analytics 3件、implementation 1件、test reliability 1件、API contract 2件、security / privacy 0件でHOLD
- 専用App run `31227992622`が第5巡の7 findingsを`specialist-review-gate` / `merge-eligibility` failureとして発行した
- 第6巡は常にHOLDのためPR #378を凍結し、旧review・例外proof・breaking waiverを再利用しないISSUE-188へ置換した

## 専門review履歴

| 巡  | 対象SHA   | role                        | 判定 | actionable findings |
| --- | --------- | --------------------------- | ---- | ------------------: |
| 1   | `1814d03` | security                    | HOLD |                   3 |
| 1   | `1814d03` | privacy                     | HOLD |                   6 |
| 1   | `1814d03` | analytics / spec acceptance | HOLD |                   5 |
| 2   | `bcbfd06` | spec acceptance / analytics | HOLD |                   4 |
| 2   | `bcbfd06` | implementation correctness  | HOLD |                   6 |
| 2   | `bcbfd06` | test reliability            | HOLD |                   6 |
| 2   | `bcbfd06` | API contract                | HOLD |                   3 |
| 2   | `bcbfd06` | security / authorization    | HOLD |                   5 |
| 2   | `bcbfd06` | privacy / data protection   | HOLD |                   4 |
| 3   | `a4c54da` | spec acceptance / analytics | HOLD |                   1 |
| 3   | `a4c54da` | implementation correctness  | HOLD |                   2 |
| 3   | `a4c54da` | test reliability            | HOLD |                   4 |
| 3   | `a4c54da` | API contract                | HOLD |                   3 |
| 3   | `a4c54da` | security / authorization    | HOLD |                   1 |
| 3   | `a4c54da` | privacy / data protection   | GO   |                   0 |
| 4   | `b51a946` | spec acceptance / analytics | HOLD |                   3 |
| 4   | `b51a946` | implementation correctness  | GO   |                   0 |
| 4   | `b51a946` | test reliability            | HOLD |                   4 |
| 4   | `b51a946` | API contract                | HOLD |                   1 |
| 4   | `b51a946` | security / authorization    | GO   |                   0 |
| 4   | `b51a946` | privacy / data protection   | HOLD |                   1 |
| 5   | `8764fad` | spec acceptance / analytics | HOLD |                   3 |
| 5   | `8764fad` | implementation correctness  | HOLD |                   1 |
| 5   | `8764fad` | test reliability            | HOLD |                   1 |
| 5   | `8764fad` | API contract                | HOLD |                   2 |
| 5   | `8764fad` | security / authorization    | GO   |                   0 |
| 5   | `8764fad` | privacy / data protection   | GO   |                   0 |

## 参考

- GitHub Issue #322
- ISSUE-024
- ISSUE-111
- ISSUE-159
- ISSUE-185
- GitHub Issue #379（ISSUE-186: ProductEvent DB authority / retention fallback）
- GitHub Issue #380（ISSUE-187: Web Vitals edge attestation / shared rate limit）
- GitHub Issue #381（ISSUE-188: 第5巡HOLDからの置換。全受け入れ条件と7 findingsを引き継ぐ）
- GitHub PR #378（未マージclose。第5巡HOLD証跡を凍結）
