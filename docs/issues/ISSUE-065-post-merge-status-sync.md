---
id: ISSUE-065
title: ISSUE-041 完了後の状態同期
priority: P2
status: done
size: S
created_at: 2026-07-24
parent: MAINTENANCE
github_issue: 150
---

## 目的 (Why)

PR #149 で ISSUE-041 / GitHub Issue #87 が完了・merge・close されたため、ローカル Issue 正本と
Issue Index の status / queue を同期する。

## スコープ (What)

- `docs/issues/ISSUE-041-perf-authenticated-image-qa.md` を `status: done` に更新する
- Issue Index の Status Snapshot を更新する
- Blocked Queue を空にする
- Done Archive に ISSUE-041 と ISSUE-065 を追加する

## やらないこと (Out of Scope)

- アプリコード、API、DB、Storage、AI 仕様の変更
- 新しい認証済み実データ QA の実施
- Lighthouse / Network / CDP / HAR / log / screenshot などの raw 証跡保存

## 影響範囲

| 領域         | 影響                    |
| ------------ | ----------------------- |
| OpenAPI      | なし                    |
| 生成型       | なし                    |
| アプリコード | なし                    |
| ドキュメント | Issue 正本、Issue Index |
| QA           | Markdown / 状態確認     |

## 受け入れ条件 (Acceptance Criteria)

- [x] ISSUE-041 が `status: done`
- [x] Issue Index の `blocked` が 0
- [x] Ready / In Progress / Review / GitHub Intake queue が空
- [x] Done Archive に ISSUE-041 と ISSUE-065 が含まれる
- [x] 今回差分の `docs/issues` に実データ、画像 URL、storage_key、AI 生成本文を追加しない

## 検証

- `pnpm exec prettier --check docs/issues/README.md docs/issues/ISSUE-041-perf-authenticated-image-qa.md docs/issues/ISSUE-065-post-merge-status-sync.md`
- `! rg -n 'status: (review|blocked)' docs/issues/ISSUE-041-perf-authenticated-image-qa.md docs/issues/README.md`

## セキュリティ・プライバシー考慮

- Issue metadata と index のみを更新し、実データ、画像 URL、storage_key、AI 生成本文は扱わない
- ISSUE-041 の保存済み証跡は sanitized JSON の参照に限定する
