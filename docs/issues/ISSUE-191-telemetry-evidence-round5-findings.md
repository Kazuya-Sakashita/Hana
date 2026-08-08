---
id: ISSUE-191
title: 'ISSUE-188置換: telemetry evidenceの最終Round 5所見を解消する'
priority: P1
status: review
size: M
created_at: 2026-08-08
github_issue: 385
release_gate: observability
requires_human_review:
  - security
  - privacy
  - analytics
  - api_contract
---

# ISSUE-191: ISSUE-188置換: telemetry evidenceの最終Round 5所見を解消する

## 目的 (Why)

PR #382が最終Review Round 5でHOLDになったため、Round 6へ進まず、重複を除いた6修正単位を新しい証跡と通常3巡以内の専門reviewで解消する。

## スコープ (What)

- M1〜M9のmetric別anchor、entry window、maturity policy
- funnel completenessからM2 / M3 / M8 / M9へのHOLD伝播
- M8 / M9のtarget direction、再計測期限、baseline cohort roleと署名済みbaseline証跡
- sealed universe chronologyの有効対照と単一変異test
- M2 / M3 Memory exact setの全行actor ownership
- protected actor key versionとstatus-only evidenceの結合
- ISSUE-188が置換したISSUE-152の未完了実装と契約

## やらないこと (Out of Scope)

- PR #382の再オープン、マージ、Round 6 review
- ISSUE-188のreview、例外proof、breaking waiverの合格証拠としての再利用
- 本番DB authority、退会purge、degradation ledgerのactivation
- 6修正単位と無関係な公開API機能追加

## 影響範囲

- telemetry evidence生成、private manifest、censored rate判定へ影響する
- M2 / M3 / M8 / M9のfail-closed statusへ影響する
- synthetic actor ownershipとactor key versionのprivacy境界へ影響する
- status-only artifactへPII、raw actor、exact countを追加しない
- 公開API差分は新しいexact reportと明示承認が必要である

## 受け入れ条件 (Acceptance Criteria)

- [x] M1〜M9のmetric別anchor / entry / maturityをexact schemaで固定し、誤った期間と早すぎる集計をHOLDにする
- [x] funnel completeness不成立時、M2 / M3 / M8 / M9を`telemetry_incomplete`のHOLDにする
- [x] M8 / M9のdirection、再計測期限、baseline cohort role、baseline証跡を署名対象にし、任意digestと期限切れdecisionを拒否する
- [x] sealed universe chronologyを、有効なPASS対照と再署名済みcutoff mismatch / seal-before-cutoffの単一変異で検証する
- [x] M2 / M3 Memory exact setに別actorの別flow行を混入してもHOLDにする
- [x] `actor_key_version`をprotected versionへ完全一致させ、caller任意値やPII様値を拒否する
- [x] evidence / query / schema identifierを更新し、ISSUE-188の署名済み証跡を受理しない
- [x] status-only artifact、log、fixtureへPII、子どもの情報、生actor識別子を出力しない
- [x] focused / full test、typecheck、lint、OpenAPI lint / gen、CI buildを通す
- [x] ISSUE-191専用のbreaking exact report、ADR、期限付きwaiver、人間承認を取得する
- [ ] 固定base / head SHAを6専門roleがRound 1からreviewし、通常上限3巡以内に全role GOを得る

## セキュリティ・プライバシー考慮

- 署名済みDB truthの全行を期待actorへ限定する
- actor key versionは保護された構成からだけ取得する
- private manifestはexact schemaとversioned keyで検証する
- evidenceはstatus-onlyを維持し、raw event、actor、count、rateを含めない
- completenessが未確認のevent依存metricをPASS / FAILとして公開しない

## 参考

- GitHub Issue #385
- ISSUE-188 / GitHub Issue #381
- GitHub PR #382（最終Round 5 HOLD、未マージ）
- ISSUE-173
- `docs/product-validation/funnel-go-hold-contract.md`
