---
id: ISSUE-163
title: Loop Engineerの自動マージ方針と危険操作境界を定義する
priority: P1
status: in_progress
size: S
created_at: 2026-08-03
github_issue: 335
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-163: Loop Engineerの自動マージ方針と危険操作境界を定義する

## 目的 (Why)

通常の開発PRは複数の独立レビューとCIが揃えば人間を待たずに進められる一方、実環境や
実ユーザーデータへ影響する操作は人間承認で止まる運用契約を確定する。

## スコープ (What)

- `AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`の判定境界
- 最新commit SHAに固定した独立review条件
- 最低3名、変更領域に応じて最大6名のreview matrix
- 最大3巡の修正・再レビューとfail-closed条件
- Codex sandbox、既存開発規約、PII非保存を維持する安全境界
- 後続Issueで機械判定、review gate、Ruleset、段階導入を行うための有効化条件

## やらないこと (Out of Scope)

- PR判定scriptやGitHub Actionsの実装（ISSUE-164）
- 専門review gateの実装（ISSUE-165）
- GitHub RulesetやAuto-mergeの設定変更（ISSUE-166）
- dry-runや実際の自動マージ有効化（ISSUE-167）
- Codexのapproval policy、sandbox、network設定の緩和
- production deploy、実DB migration、実ユーザーデータを使う検証

## 影響範囲

- `AGENTS.md` / `CLAUDE.md`
- `docs/adr/0017-loop-engineer-approval-boundary.md`
- `docs/api-driven-development/codex-automation-runbook.md`
- 方針を固定するread-only unit test

OpenAPI、生成型、アプリ実装、DB、Storage、実環境には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [ ] 判定を`AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`の3状態で定義する
- [ ] 最新commit SHA、独立review、actionable finding 0件、CI、受け入れ条件、rollback記録を自動候補の必須条件にする
- [ ] 最低3名、変更領域に応じて最大6名のread-only専門review matrixを定義する
- [ ] 初回reviewerへ他reviewerの結論を渡さず、同じ仕様とdiffを独立コンテキストで確認させる
- [ ] 修正と再レビューを最大3巡とし、指摘残存、判断不一致、情報不足、検証不能をHOLDにする
- [ ] 実DB適用、データ削除、実ユーザーデータ、production deploy、secret/vendor設定、breaking waiver、force pushを人間承認対象にする
- [ ] Auth、AI、画像、Privacyなどのコード変更に追加する専門review条件を定義する
- [ ] `approval_policy="never"`、Full Access、CI bypassを採用しない
- [ ] 1 Issue/1 PR、OpenAPI-first、PII非保存を維持する
- [ ] ISSUE-167のdry-runと人間GOまでは自動マージを有効化しない

## セキュリティ・プライバシー考慮

証跡はIssue ID、PR番号、commit SHA、review role、件数、判定、CI statusだけに限定する。
PR本文、コメント本文、prompt、実ユーザー情報、画像情報、生成本文、secretは保存しない。

## 参考

- GitHub Issue #335
- ADR-0017
- `docs/api-driven-development/codex-automation-runbook.md`
- ISSUE-164 / ISSUE-165 / ISSUE-166 / ISSUE-167
