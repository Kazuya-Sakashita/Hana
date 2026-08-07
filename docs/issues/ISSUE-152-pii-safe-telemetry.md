---
id: ISSUE-152
title: PII-safe telemetry集約基盤を作る
priority: P1
status: review
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
第一者clientと原子的に更新する。production DB authority / retention activationは#379へ分離し、完了まで
production telemetry activationをHoldにする。

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
- [x] 分母・分子・補集合と関連表へprimary / secondary suppressionを適用する
- [x] event completeness、query version、actor key version、eligible census digest、censoring policy / status digestをstatus-only evidenceへ含める
- [x] North Starのactive unit、UTC entry window、重複排除、event completenessを固定する
- [x] 未知フィールドと高頻度送信をfail-closedまたはrate limitするテストを追加する
- [x] API契約変更がある場合はOpenAPIを先に更新する

## セキュリティ・プライバシー考慮

許可リスト外のfieldを拒否し、合成eventだけで検証する。

## 実装結果

- 共通event schema、sampling、90日保持、cardinality、completeness、suppression、right-censor、status-only evidenceを固定した
- ProductEventを送信前にdurable outboxへ保存し、204応答だけをackとして同一event IDで再送するようにした
- server-minted actor bindingをoutbox rootとheaderへ固定し、actor変更、サインアウト、退会完了、401 / 403でoutboxを破棄して別actorへの再送と誤帰属を防止した
- 記録flowとMemory `Idempotency-Key`を同期し、下書き復元・写真変更・retry・409 conflictの遷移規則を実装した
- Web Vitalsをbrowser内で固定dimensionへ変換し、raw ID・値・path・navigation typeを送らず、cookieをomitするv2 requestへ同期した
- ProductEvent DB role / retention fallbackはreviewer上限を超えない独立した承認境界として#379へ分離した
- 本番credential、退会purge、HMAC key lifecycleはISSUE-185の人間承認境界を維持した

## 検証結果

- `pnpm openapi:lint` PASS（既存warningのみ）
- `pnpm openapi:gen` PASS
- `pnpm openapi:auth-contract` PASS（24 operations / 20 private）
- `pnpm typecheck`、`pnpm lint`、`pnpm format:check` PASS
- `pnpm test` PASS（193 files中187 PASS / 6 skip、1644 tests中1621 PASS / 23 skip）
- `pnpm pr:gate` PASS（`origin/main`取り込み後の全検査・buildを含む）
- `oasdiff breaking`は14件（required追加9 / 旧Vitals raw field削除5）。ADR-0018とexact-report waiver承認まではHOLD
- 第1巡はcommit `1814d03`をsecurity / privacy / analyticsの3名が独立reviewし、3 / 6 / 5件のactionable findingで全員HOLD
- 第1巡の所見を修正中。最新SHAの第2巡は6つの必須roleを別reviewerが独立確認する

## 専門review履歴

| 巡  | 対象SHA   | role                        | 判定 | actionable findings |
| --- | --------- | --------------------------- | ---- | ------------------: |
| 1   | `1814d03` | security                    | HOLD |                   3 |
| 1   | `1814d03` | privacy                     | HOLD |                   6 |
| 1   | `1814d03` | analytics / spec acceptance | HOLD |                   5 |

## 参考

- GitHub Issue #322
- ISSUE-024
- ISSUE-111
- ISSUE-159
- ISSUE-185
- GitHub Issue #379（ISSUE-186: ProductEvent DB authority / retention fallback）
