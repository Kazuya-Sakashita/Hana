---
id: ISSUE-183
title: children access statusの実DB証跡をexact-SHA境界へ同期する
priority: P0
status: review
size: S
created_at: 2026-08-07
github_issue: 371
release_gate: database_security
requires_human_review:
  - security
  - database
---

# ISSUE-183: children access statusの実DB証跡をexact-SHA境界へ同期する

## 目的 (Why)

PR #370の第3巡Terminal HOLDで検出した証跡不整合と実DBテスト不足を解消し、children RLS変更をexact-SHAへ束縛した後継PRで再検証する。

## スコープ (What)

- PR #370の検証済み実装を後継PRへ引き継ぐ
- 最新headのreview/checksをコミット内で自己完了にせず、専用Appの外部merge条件として扱う
- dirty `createrole_self_grant` migration再適用後に、実PostgreSQLで`hana_child_access_status`のowned / foreign / missing三値を直接検証する

## やらないこと (Out of Scope)

- stagingまたはproductionへのmigration適用・cutover
- 実secretまたは実ユーザーデータの使用
- OpenAPIの403/404契約変更
- PR #361およびISSUE-174〜179の変更
- auto-mergeの予約、ruleset bypass、CI bypass

## 影響範囲

- ISSUE-182のTerminal HOLD記録とIssue台帳
- PostgreSQL 16 synthetic child RLS integration test
- exact-SHA専門reviewと専用App merge gateの証跡境界

OpenAPI、生成API型、migration SQL、runtime実装は変更しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] ISSUE-182のstaleなreview/checks完了表示を未完了へ戻す
- [x] dirty-GUC migration再適用後、実DBでowned / foreign / missing三値を直接検証する
- [x] fresh PostgreSQL 16、`pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm pr:gate`が成功する
- [x] 実環境migration、cutover、auto-mergeを実行しない

## External merge conditions

次はコミット内で完了チェックを付けず、最新head SHAへ束縛された外部証跡だけで判定する。

- 最大3巡以内の6名独立専門reviewがすべてGO
- 専用Appの`pr-gate`、`validate`、`local-registry`、`specialist-review-gate`、`merge-eligibility`がすべて成功
- GitHubが現在のmainに対してmergeableと判定

## セキュリティ・プライバシー考慮

検証はloopbackの合成`hana_ci`だけを使い、実secret、child row、ユーザー情報を証跡へ含めない。実環境migrationと`rls` cutoverはHUMAN_REQUIREDのまま維持する。

## Rollback

障害時は`CHILD_OWNER_SCOPE_MODE=route`へ戻してappを再起動する。成功済みmigration履歴は編集せず、DB object変更が必要なら新しいcompensating forward migrationを別Issueで扱う。

## 参考

- GitHub Issue #371
- PR #370 / GitHub Issue #369
- ADR-0016
- ADR-0017
