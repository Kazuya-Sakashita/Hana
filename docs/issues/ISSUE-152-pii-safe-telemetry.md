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

- `ProductEventReport`のrequest shapeは維持し、`flow_id`とMemory `Idempotency-Key`の意味契約を同期する
- 記録画面の下書き復元、写真構成変更、保存retry、409 conflict時のflow lifecycleとサインアウト時のlocal cleanup
- ProductEvent client outbox、Web Vitalsの低cardinality変換、合成telemetry aggregate
- status-only completeness、suppression、right-censor、North Star evidenceと回帰test

OpenAPIのpath、response、生成型のshape、production DB、外部monitoring providerは変更しない。

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
- [x] raw event accessをingest、retention、承認済みaggregate jobへ限定する
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
- サインアウト、退会完了、401 / 403でoutboxを破棄し、別actorへの再送と誤帰属を防止した
- 記録flowとMemory `Idempotency-Key`を同期し、下書き復元・写真変更・retry・409 conflictの遷移規則を実装した
- Web Vitalsをraw値・raw route・user identifierなしの固定dimensionへ変換し、匿名公開endpointとして認証契約を同期した
- 本番credential、purge、HMAC key lifecycleはスコープどおりISSUE-185へ残した

## 検証結果

- `pnpm openapi:lint` PASS（既存warningのみ）
- `pnpm openapi:gen` PASS
- `pnpm openapi:auth-contract` PASS（24 operations / 20 private）
- `pnpm pr:gate`の全検査PASS（183 test files、1572 tests、契約QAすべてPASS。sandbox制限で停止したbuildは同一`pnpm build:ci`を制限外で再実行しPASS）
- security / privacy / analyticsの専門reviewは未実施

## 参考

- GitHub Issue #322
- ISSUE-024
- ISSUE-111
- ISSUE-159
- ISSUE-185
