---
id: ISSUE-188
title: 'ISSUE-152置換: PII-safe telemetry契約のRound 5所見を解消する'
priority: P1
status: in_progress
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

- [ ] operation、stable reason、route group、status、duration bucketだけを許可する共通event schemaを定義する
- [ ] request body、生成本文、画像情報、URL、storage key、raw user IDを拒否する
- [ ] sampling、保持期間、cardinality上限、重複eventの扱いを定義する
- [ ] funnel、Web Vitals、API、AIの合成イベントからstatus-only集計を生成できる
- [ ] 記録flow IDとMemoryのidempotency keyを同一UUIDとして扱い、DB確定Memoryを保存成功の正にする
- [ ] 下書き復元、写真変更、409 conflict、retry、idempotency key再生成時のflow継承・終了・再採番規則を固定する
- [ ] stage eventの再送、重複、欠測でもDB保存との相関を誤らない合成testを追加する
- [ ] `memory_saved`欠測、重複、順序逆転を離脱へ誤分類しない
- [ ] `photo_selected`、`ai_draft_shown`、`memory_viewed`ごとにserver truthまたはdurable client outboxのack / retryを持つ
- [ ] expected-versus-received、loss、duplicate、reorderをstatus-onlyで検証し、silent lossをcompleteness PASSにしない
- [ ] eligible censusと退会right-censorをactor非識別aggregateとして固定し、削除後の分母縮小を検知する
- [ ] worst-case区間からPASS / FAIL / HOLDだけを生成し、exact census / censor countを証跡へ出さない
- [ ] raw event accessのauthority契約とproduction HOLD境界を固定する
- [ ] production ProductEvent ingestをISSUE-186とISSUE-185の独立したversioned activationへ二重拘束する
- [ ] primary / secondary suppressionを適用する
- [ ] completeness、query version、actor key version、eligible census digest、censoring policy / status digestをstatus-only evidenceへ含める
- [ ] North Starのactive unit、UTC entry window、重複排除、event completenessを固定する
- [ ] 未知フィールドと高頻度送信をfail closedまたはrate limitする

### 第5巡finding

- [ ] ProductEventの`event_name × elapsed_bucket`を共通pure helperで検証し、不正な永続outbox rootを送信、再試行せず破棄してstatus-only degradationだけを残す
- [ ] metric IDごとのreason / status allowlistを固定し、M12など非対応metricでright-censor reasonからPASS / FAILを生成できない
- [ ] M9を最初のeligible `memory_viewed`、UUIDv7 occurrence-minute全区間、7日maturity、completeness、遅延receipt、境界時刻に基づいて評価する
- [ ] Web Vitals envelopeのroute groupをOpenAPIの7値へ共通化し、`ai / metrics / account`を拒否する
- [ ] Web Vitalsの`operation × status × duration_bucket`全組み合わせをOpenAPIとruntimeで同じ判定にする
- [ ] ProductEvent `flow_id`とMemory `Idempotency-Key`のUUID契約とcanonical表現をOpenAPI、client、serverで単一化する
- [ ] Web Vitals UUIDのbare UUID / URN受理方針をOpenAPI、client、serverで完全一致させる

### 検証と承認

- [ ] OpenAPIを先に更新し、生成型を`pnpm openapi:gen`だけで同期する
- [ ] query versionを`issue-188-v1`へ更新し、旧evidenceと混在させない
- [ ] 全組み合わせcontrast test、client / server / outbox / evidence回帰testを追加する
- [ ] `pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm typecheck`、全test、`pnpm pr:gate`を通す
- [ ] 新しいoasdiff exact reportを生成し、旧ISSUE-152 waiverを再利用せず新ADR、新waiver、人間承認を取得する
- [ ] 最新SHAをspec / analytics、implementation、test reliability、API contract、security、privacyの6 roleでfresh round 1からレビューする
- [ ] 全role GO、CI成功、専用App gate成功までmergeしない

## セキュリティ・プライバシー考慮

- 許可リスト外fieldと矛盾dimensionを全入口で拒否する
- 壊れたoutbox payloadをnetworkへ送らず、payloadを削除してstatus-only degradationだけを残す
- UUIDはbare canonical表現へ統一し、相関キーの曖昧性を残さない
- raw event、actor identifier、exact countをevidenceへ含めない
- production activationの既存二重gateを緩和しない

## Review recovery

- PR #378の第5巡HOLD、旧review、ISSUE-173例外proof、breaking waiverは合格証拠として再利用しない
- ISSUE-188の最初の正式reviewを第1巡として扱う
- 第5巡前に7 findingsをすべて修正し、正式review対象SHAを固定する

## 実装結果

- `event_name × elapsed_bucket`を生成schema型付きshared predicateへ集約し、client outboxとserver parserを同期した
- 不正な永続outbox rootを送信、再試行せず削除し、status-only degradationだけを残すようにした
- Web Vitalsのroute group、status / duration matrix、bare UUIDをOpenAPIとshared runtime helperへ統一した
- ProductEvent `flow_id`とMemory `Idempotency-Key`をgeneric bare UUIDとして受理し、lowercaseへcanonical化した
- metric IDごとのreason allowlistを追加し、非対応metricでright-censor reasonを使うcaller bypassを拒否した
- M9 evaluatorを最初のeligible `memory_viewed`、occurrence-minute全区間、7日maturity、DB Memory truthへ固定した
- query versionを`issue-188-v1`へ更新し、ISSUE-152 evidenceとの混在を禁止した

## 検証結果

- 対象11 files / 308 tests PASS
- `pnpm pr:gate` PASS（196 files中190 PASS / 6 skip、1869 tests中1846 PASS / 23 skip、production build成功）
- `pnpm openapi:lint` PASS（既存warningのみ）
- `pnpm openapi:gen` PASS
- 固定oasdiff imageによるmainとの差分は21件（error 16 / warning 5）
- GitHub Action互換の改行正規化後exact report SHA-256は`5b1e916b4ef35c448101624354d73f86d9d0de277fe88dbc7fe8025873e8bc35`
- 上記exact reportの人間承認、新waiver、保護label、fresh round 1 reviewはpending

## 参考

- GitHub Issue #381
- ISSUE-152 / GitHub Issue #322（未完了・置換済み）
- GitHub PR #378（第5巡HOLD・未マージclose）
- ISSUE-159
- ISSUE-173
- ISSUE-185
- ISSUE-186 / GitHub Issue #379
- ISSUE-187 / GitHub Issue #380
