---
id: ISSUE-032
title: MVP release readiness を一元管理する
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
  - ux
  - release
---

## 目的 (Why)

Hana は MVP の中核機能が揃いつつあるが、リリース可否を判断する証跡が Issue / PR / perf docs / ADR に分散している。

Codex が自動で開発を進めても、最後に人間が「今どこまで戻せるか」「何が未確認か」を判断できるように、MVP release readiness を 1 つの Issue に集約する。

## スコープ (What)

- Core loop のリリース判定表を作る
  - auth
  - child profile
  - photo upload
  - AI generation
  - edit/save memory
  - album/detail
- 30 秒記録フローの確認手順を定義する
- privacy/security smoke の確認項目を定義する
- AI 生成品質レビューの観点を定義する
- slow network / mobile smoke の確認観点を定義する
- release blocker と accepted risk を分けて記録する

## やらないこと (Out of Scope)

- production deploy
- 課金、家族共有、月別ふりかえりの実装
- App Store / 法務文書の最終判断

## 影響範囲

- `docs/issues/`
- `docs/perf/`
- `docs/api-driven-development/security-and-privacy.md`（ISSUE-036 で作成済みの security/privacy 正本）
- PR / release 判断プロセス

## 受け入れ条件 (Acceptance Criteria)

- [x] MVP core loop の確認表がある
- [x] `pnpm pr:gate` の結果を記録できる
- [x] 手動 golden path の確認手順がある
- [x] privacy/security smoke の確認手順がある
- [x] release blocker / accepted risk / deferred work が分かれている
- [x] 人間が merge / release 判断するゲートが明記されている

## セキュリティ・プライバシー考慮

- 子どもの写真・AI 生成本文・storage_key・メールアドレスを証跡に貼らない
- スクリーンショットを保存する場合は実データを使わない
- AI vendor / child data / deletion は人間レビュー必須

## 参考

- `Hana_PRD_v1.md` §6 MVP仕様
- `Hana_PRD_v1.md` §19 ISSUE化
- `AGENTS.md`
- `docs/release/mvp-release-readiness.md`
- `docs/perf/README.md`
