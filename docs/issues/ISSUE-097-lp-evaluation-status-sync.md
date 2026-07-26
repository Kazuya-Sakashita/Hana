---
id: ISSUE-097
title: LP 評価表の relevance と trust 完了状態を同期する
priority: P1
status: done
size: S
created_at: 2026-07-27
github_issue: 218
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-097: LP 評価表の relevance と trust 完了状態を同期する

## 目的 (Why)

ISSUE-093 で LP hero の親 relevance cue と trust 詳細導線は実装済みだが、`docs/design/current-lp-evaluation.md` には `LP-P1-02` と `LP-P1-05` が未完了のように残っている。次の Issue 選定で完了済み課題を再度拾わないよう、評価表を現状へ同期する。

## スコープ (What)

- `LP-P1-02` を ISSUE-093 対応済みとして記録する
- `LP-P1-05` を ISSUE-093 対応済みとして記録する
- 次の推奨順から完了済みの `LP-P1-02` / `LP-P1-05` を外す
- Issue Index と focused test を更新する

## やらないこと (Out of Scope)

- LP 本体の追加変更
- API / DB / OpenAPI contract の変更
- privacy / legal claim の追加
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文の追加

## 影響範囲

- `docs/design/current-lp-evaluation.md`
- `docs/issues/ISSUE-097-lp-evaluation-status-sync.md`
- `docs/issues/README.md`
- `tests/unit/app/lp-evaluation-status-sync.test.ts`
- `tests/unit/app/waitlist-release-readiness.test.ts`
- `tests/unit/app/quiet-heirloom-refinement-contract.test.ts`

## 受け入れ条件 (Acceptance Criteria)

- [x] `LP-P1-02` が ISSUE-093 対応済みとして記録されている
- [x] `LP-P1-05` が ISSUE-093 対応済みとして記録されている
- [x] 次の推奨順から完了済みの `LP-P1-02` / `LP-P1-05` が外れている
- [x] Issue Index が `ISSUE-097` / `#218` の done 状態を示している
- [x] 関連テストと `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- 評価ドキュメントの状態同期のみで、公開コピー、API、保存処理、ログ出力は変更しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文を扱わない
- privacy / legal claim を新たに断定しない

## 検証

- [x] `pnpm exec vitest run tests/unit/app/lp-evaluation-status-sync.test.ts tests/unit/app/waitlist-release-readiness.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- [x] `pnpm pr:gate`
