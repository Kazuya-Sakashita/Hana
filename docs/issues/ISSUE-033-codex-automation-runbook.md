---
id: ISSUE-033
title: Codex 自動開発 Runbook を整備する
priority: P0
status: done
size: S
created_at: 2026-07-21
github_issue: 58
release_gate: mvp_quality
ready_for_codex: true
automation_level: pr_ready
blocked_by: []
requires_human_review:
  - process
---

## 目的 (Why)

Codex がある程度自動で開発を進めるには、Issue 選定、サブエージェント利用、PR-ready で止まる条件、戻せる記録の残し方を固定する必要がある。

この Issue では、Hana の既存ルールを壊さずに、Codex が `Issue → branch → implementation → validation → Draft PR → review changes → ready_to_merge` まで進めるための Runbook を追加する。

## スコープ (What)

- Codex 自動開発の責務分担を定義する
  - Issue Captain
  - Spec Scout
  - Contract Guard
  - Privacy/Security Reviewer
  - QA Reviewer
  - Design/UX Reviewer
- 自動で進めてよい範囲と人間承認ゲートを定義する
- Issue ごとの記録形式を定義する
  - Issue Brief
  - Change Ledger
  - Validation Ledger
  - Privacy Ledger
  - PR Draft
- `AGENTS.md` / `README.md` から Runbook に辿れるようにする

## やらないこと (Out of Scope)

- GitHub automation bot の実装
- 自動 merge / 自動 deploy
- production secrets / environment 操作

## 影響範囲

- `docs/api-driven-development/codex-automation-runbook.md`
- `AGENTS.md`
- `README.md`
- Codex Skill `$hana-development` の運用

## 受け入れ条件 (Acceptance Criteria)

- [x] Codex が PR-ready まで自動進行する手順が文書化されている
- [x] 3 並行までのサブエージェント運用ルールが明記されている
- [x] 自動で止まるべき人間承認ゲートが明記されている
- [x] 戻せる記録として残す ledger が定義されている
- [x] `AGENTS.md` / `README.md` から参照できる

## セキュリティ・プライバシー考慮

- privacy / AI / image / auth / DB migration は人間レビュー必須
- 実データ、AI 生成本文、storage_key、画像 URL を ledger に残さない

## 参考

- `AGENTS.md`
- `docs/api-driven-development/README.md`
- `docs/issues/ISSUE-032-mvp-release-readiness.md`
