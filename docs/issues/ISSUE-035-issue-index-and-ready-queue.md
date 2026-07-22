---
id: ISSUE-035
title: Issue index と ready queue を整備する
priority: P0
status: done
size: S
created_at: 2026-07-21
github_issue: 59
release_gate: mvp_quality
ready_for_codex: true
automation_level: pr_ready
blocked_by: []
requires_human_review:
  - process
---

## 目的 (Why)

Codex が自動で次の Issue を選ぶには、`docs/issues/` 全体を毎回読み切るのではなく、現在の状態と ready queue を短く把握できる入口が必要。

この Issue では `docs/issues/README.md` を追加し、Issue status、ready 条件、並行実行ルール、次に進める候補を一元化する。

## スコープ (What)

- `docs/issues/README.md` を作成する
- ready queue の条件を定義する
- 既存 Issue の status summary を載せる
- 新規自動化 Issue の一覧を載せる
- 最大 3 並行までの実行ルールを明記する

## やらないこと (Out of Scope)

- GitHub Issues との同期
- Issue index 自動生成 script
- 既存 Issue の status 一括変更

## 影響範囲

- `docs/issues/README.md`
- Codex の Issue 選定プロセス

## 受け入れ条件 (Acceptance Criteria)

- [x] `docs/issues/README.md` から ready queue が分かる
- [x] 並行実行は最大 3 本までと明記されている
- [x] `review` 滞留 Issue が見える
- [x] 新規自動化 Issue の依存関係が分かる
- [x] Codex が次 Issue を選ぶルールが明記されている

## セキュリティ・プライバシー考慮

- Issue index に実データ、画像 URL、storage_key、AI 生成本文を載せない

## 参考

- `docs/issues/`
- `docs/api-driven-development/README.md`
- `AGENTS.md`
