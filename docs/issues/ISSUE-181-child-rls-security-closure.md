---
id: ISSUE-181
title: children RLSのtarget guardとparameter ACLをfail closedにする
priority: P0
status: review
size: S
created_at: 2026-08-06
github_issue: 367
release_gate: database_security
requires_human_review:
  - security
  - database
---

# ISSUE-181: children RLSのtarget guardとparameter ACLをfail closedにする

## 目的 (Why)

PR #366の第3巡security reviewで検出した合成DB target検証とparameter ACLの実効権限漏れを解消し、children RLS rollout hardeningをmerge可能な後継PRへ引き継ぐ。

## スコープ (What)

- PostgreSQL URLのquery parameterによるhost、port、socket overrideを合成DB guardで拒否する
- role bootstrapは検証済みauthorityから作った明示Client configだけを使う
- migration preflightでruntimeとPUBLICのparameter ACLをfail closedで拒否する
- runtime attestationでruntime、PUBLIC、`hana_child_owner`の継承を含む実効parameter権限を拒否し、ownerのmembership topologyを固定する
- PostgreSQL 16 synthetic test、unit test、ADR、runbook、rollback evidenceを同期する
- PR #366の検証済み実装を引き継ぐ

## やらないこと (Out of Scope)

- stagingまたはproductionへのmigration適用・cutover
- 実secretまたは実ユーザーデータの使用
- OpenAPIの403/404契約変更
- PR #361およびISSUE-174〜179の変更
- auto-mergeの予約

## 影響範囲

- synthetic PostgreSQL guardとrole bootstrap
- children RLS migration preflightとruntime attestation
- security/database unit・integration test
- ADR-0016、DB setup、cutover runbook

OpenAPIの公開契約と生成API型は変更しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] `DATABASE_URL`、`DIRECT_URL`、`CHILD_DATABASE_URL`のquery parameter overrideをmutation前に拒否する
- [x] bootstrapがURL文字列を再解釈せず、検証済み明示Client configへ接続する
- [x] migration preflightがruntime/PUBLICの継承を含む実効parameter権限を変更前に拒否し、DB状態を不変に保つ
- [x] runtime attestationがruntime/PUBLIC/owner roleの継承を含む実効parameter権限、不正なowner membership、`session_replication_role != origin`を処理前に拒否する
- [x] 合成PostgreSQL 16、`pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm pr:gate`が成功する
- [ ] 最新head SHAで最大3巡以内の独立専門レビューがすべてGOとなる

## セキュリティ・プライバシー考慮

guardは接続URLの値を出力せず固定reasonだけで停止する。検証はloopbackの合成`hana_ci`だけを使い、実secret、child row、ユーザー情報を証跡へ含めない。

## 参考

- GitHub Issue #367
- PR #366 / GitHub Issue #365
- ADR-0016
- ADR-0017
