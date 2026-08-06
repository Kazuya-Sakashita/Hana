---
id: ISSUE-151
title: DB least-privilegeとRLSのtracer bulletを実装する
priority: P1
status: blocked
size: M
created_at: 2026-08-03
github_issue: 321
release_gate: database_security
requires_human_review:
  - security
  - database
---

# ISSUE-151: DB least-privilegeとRLSのtracer bulletを実装する

## 目的 (Why)

owner-scoped resourceでrequest-scoped DB roleとRLSを証明し、Phase 2の採否を判断する。

## スコープ (What)

- 対象resourceと脅威モデルのADR
- RLS policyとrollback可能なmigration
- 他ユーザー操作を拒否する実PostgreSQLテスト
- service roleと通常経路の責務分離

## やらないこと (Out of Scope)

- 実環境へのmigration適用
- 実ユーザーデータを使う検証

## 受け入れ条件 (Acceptance Criteria)

- [x] 対象resourceと脅威モデルをADRで決め、route-only方式との境界を明記する
- [x] 既存行preflight、RLS policy、rollback可能なmigrationを用意する
- [x] User AがUser Bの取得、更新、削除をDB層で拒否される実PostgreSQLテストを追加する
- [x] 通常のユーザー経路からservice role利用を除外し、管理経路との責務を分離する
- [x] 合成DBだけで検証し、実環境へのmigration適用はこのIssueに含めない
- [x] GOまたはNO-GOの根拠と後続rollout範囲をADRへ記録する

## セキュリティ・プライバシー考慮

合成DBだけを使い、実環境migrationは別承認とする。

## 参考

- GitHub Issue #321
- ADR-0007

## 後継

PR #341は第5巡の専門レビューでTerminal HOLDとなり、mergeせず終了する。
残存findingと実装はISSUE-180 / GitHub #365 / PR #366へ引き継ぐ。
GitHub Issue #321は後継PRから自動closeせず、ISSUE-180 merge後にsupersededとして状態を同期する。
