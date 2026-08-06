---
id: ISSUE-182
title: children RLS role作成membershipを決定論化する
priority: P0
status: blocked
size: S
created_at: 2026-08-07
github_issue: 369
release_gate: database_security
requires_human_review:
  - security
  - database
---

# ISSUE-182: children RLS role作成membershipを決定論化する

## 目的 (Why)

PR #368の第3巡implementation-correctness reviewで検出したPostgreSQL 16の`createrole_self_grant`依存を解消し、children RLS role作成時のschema owner membershipを決定論化する。

## スコープ (What)

- migration transaction内で`createrole_self_grant`を空へ固定してから`hana_child_owner`を作成する
- schema owner接続の非既定値がmigration結果へ影響しないことをPostgreSQL 16で検証する
- 作成後のmembership optionとruntime RLS正常経路を確認する
- PR #368の検証済み変更を後継PRへ引き継ぐ

## やらないこと (Out of Scope)

- stagingまたはproductionへのmigration適用・cutover
- 実secretまたは実ユーザーデータの使用
- OpenAPIの403/404契約変更
- PR #361およびISSUE-174〜179の変更
- auto-mergeの予約

## 影響範囲

- children RLS migrationのrole作成
- PostgreSQL 16 synthetic migration test
- ADR-0016とcutover runbook

OpenAPIの公開契約と生成API型は変更しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] `createrole_self_grant='set, inherit'`の接続でもmigrationが期待するschema owner membership optionを作る
- [x] migration適用後にruntime attestationとowner CRUDが成功する
- [x] fresh PostgreSQL 16、`pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm pr:gate`が成功する
- [ ] 最新head SHAの独立専門reviewとGitHub checksがすべて成功する
- [x] 実環境migration、cutover、auto-mergeを実行しない

## セキュリティ・プライバシー考慮

検証はloopbackの合成`hana_ci`だけを使い、実secret、child row、ユーザー情報を証跡へ含めない。実環境migrationと`rls` cutoverはHUMAN_REQUIREDのまま維持する。

## 参考

- GitHub Issue #369
- PR #368 / GitHub Issue #367
- ADR-0016
- ADR-0017

## 後継

PR #370は第3巡の専門reviewで証跡不整合と実DB三値テスト不足が見つかりTerminal HOLD。
残存findingと検証済み実装はISSUE-183 / GitHub Issue #371へ引き継ぐ。
