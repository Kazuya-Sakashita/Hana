---
id: ISSUE-036
title: security-and-privacy.md を作成し launch blocker を整理する
priority: P0
status: review
size: M
created_at: 2026-07-21
release_gate: mvp_core
ready_for_codex: true
automation_level: pr_ready
blocked_by: []
requires_human_review:
  - privacy
  - security
---

## 目的 (Why)

Hana は子どもの写真・感情記録・AI 送信を扱うため、security/privacy の判断を PRD / AGENTS / ADR / Issue に分散させたまま自動開発を進めるのは危険。

`docs/api-driven-development/security-and-privacy.md` を作成し、MVP accepted risk と pre-release blocker を分けて、Codex が毎回参照できるチェックリストにする。

## スコープ (What)

- `docs/api-driven-development/security-and-privacy.md` を作成する
- data flow / retention / third party / logs / deletion / cache を整理する
- MVP accepted risk と pre-release blocker を分ける
- public endpoint 例外を整理する
- AI / image / auth / deletion / logs の Issue gate を定義する
- AGENTS / README / ADR との参照関係を整理する

## やらないこと (Out of Scope)

- 法務文書の最終作成
- production security review
- RLS 実装
- account deletion physical purge 実装

## 影響範囲

- `docs/api-driven-development/security-and-privacy.md`
- `AGENTS.md`
- `docs/adr/`
- PR template / Issue template（必要なら）

## 受け入れ条件 (Acceptance Criteria)

- [x] security/privacy の正本が存在する
- [x] MVP accepted risk と release blocker が分かれている
- [x] AI vendor / image / auth / logs / deletion のチェック項目がある
- [x] PR/Issue で参照すべき gate が明記されている
- [x] 既存ドキュメントの矛盾が解消または明記されている

## セキュリティ・プライバシー考慮

- 実データや secret を記載しない
- vendor retention / zero data retention は人間確認の対象として残す

## 参考

- `AGENTS.md`
- `CLAUDE.md`
- `docs/adr/0007-authz-at-route-handler-layer.md`
- `docs/adr/0009-image-storage.md`
- `docs/adr/0011-ai-generation.md`
- `docs/adr/0012-image-url-caching.md`
- `docs/api-driven-development/security-and-privacy.md`
