---
id: ISSUE-049
title: Delete restore trust contract
priority: P0
status: review
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 103
blocked_by:
  - ISSUE-048
requires_human_review:
  - privacy
  - release
  - design
---

## 目的 (Why)

記録削除 dialog の「7日もどせます」という active UI copy を、現在の restore 能力に合わせる。
DB は logical delete だが、ユーザーが自分で復元できる UI / API / support flow はまだないため、
プロダクト上は復元可能性を約束しない。

## スコープ (What)

- active delete dialog から 7日復元 promise を外す
- 現在の delete / restore trust contract を docs に残す
- restore promise の再混入を静的テストで防ぐ
- Issue index を `ISSUE-049 review` に同期する

## やらないこと (Out of Scope)

- restore UI / API の実装
- delete endpoint / DB / storage の挙動変更
- account deletion / storage cleanup flow の実装
- OpenAPI 変更

## 影響範囲

| 領域         | 影響                                        |
| ------------ | ------------------------------------------- |
| OpenAPI      | なし                                        |
| 生成型       | なし                                        |
| アプリコード | memory delete confirmation copy             |
| テスト       | delete restore trust contract の静的確認    |
| ドキュメント | ISSUE-049 正本、trust contract、Issue index |

## 受け入れ条件 (Acceptance Criteria)

- [x] active delete dialog が 7日復元を約束していない
- [x] delete copy が album から非表示になることを説明している
- [x] docs が logical delete 実装と product restore availability を分けている
- [x] restore promise を出すには human release / privacy review が必要だと残っている
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## 検証

- `pnpm test -- tests/unit/app/delete-restore-trust-contract.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 削除確認 copy と docs の変更のみで、画像・AI 生成本文・storage_key は扱わない
- 実データ fixture は追加しない
- 復元を約束するには、復元 UI / API / support flow と release review が必要

## 参考

- GitHub Issue #103
- `docs/design/delete-restore-trust-contract.md`
- `docs/design/design-inventory-roadmap.md`
