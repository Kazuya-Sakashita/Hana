---
id: ISSUE-052
title: Post-merge issue status sync
priority: P2
status: done
size: S
created_at: 2026-07-23
parent: MAINTENANCE
---

## 目的 (Why)

ISSUE-046 から ISSUE-051 の PR が main に merge されたため、ローカル Issue 正本と
Issue Index の status / queue を GitHub の完了状態に同期する。

## スコープ (What)

- ISSUE-046 から ISSUE-051 の frontmatter を `done` に更新する
- Issue Index の status snapshot を更新する
- Review Queue を空にする
- Done Archive に完了済み Issue を追加する

## やらないこと (Out of Scope)

- アプリコード、API、DB、Storage、AI 仕様の変更
- ISSUE-041 の blocker 解消
- GitHub Issue #87 の close

## 影響範囲

| 領域         | 影響                           |
| ------------ | ------------------------------ |
| OpenAPI      | なし                           |
| 生成型       | なし                           |
| アプリコード | なし                           |
| ドキュメント | Issue 正本、Issue Index        |
| QA           | Markdown formatting / 状態確認 |

## 受け入れ条件 (Acceptance Criteria)

- [x] ISSUE-046 から ISSUE-051 が `status: done`
- [x] Issue Index の Review Queue が空
- [x] Issue Index の done count が最新
- [x] ISSUE-041 は blocked のまま残っている
- [x] `pnpm exec prettier --check docs/issues/README.md docs/issues/ISSUE-046-accessibility-token-viewport.md docs/issues/ISSUE-047-dialog-accessibility-foundation.md docs/issues/ISSUE-048-ai-consent-privacy-evidence.md docs/issues/ISSUE-049-delete-restore-trust-contract.md docs/issues/ISSUE-050-photo-alt-privacy-policy.md docs/issues/ISSUE-051-album-full-list-pagination.md docs/issues/ISSUE-052-post-merge-status-sync.md` が通る

## 検証

- `pnpm exec prettier --check docs/issues/README.md docs/issues/ISSUE-046-accessibility-token-viewport.md docs/issues/ISSUE-047-dialog-accessibility-foundation.md docs/issues/ISSUE-048-ai-consent-privacy-evidence.md docs/issues/ISSUE-049-delete-restore-trust-contract.md docs/issues/ISSUE-050-photo-alt-privacy-policy.md docs/issues/ISSUE-051-album-full-list-pagination.md docs/issues/ISSUE-052-post-merge-status-sync.md`
- `rg -n 'status: review' docs/issues/ISSUE-046-accessibility-token-viewport.md docs/issues/ISSUE-047-dialog-accessibility-foundation.md docs/issues/ISSUE-048-ai-consent-privacy-evidence.md docs/issues/ISSUE-049-delete-restore-trust-contract.md docs/issues/ISSUE-050-photo-alt-privacy-policy.md docs/issues/ISSUE-051-album-full-list-pagination.md`

## セキュリティ・プライバシー考慮

- Issue metadata と index のみを更新し、実データ、画像 URL、storage_key、AI 生成本文は扱わない
- ISSUE-041 の認証済み実データ QA blocker は維持する
