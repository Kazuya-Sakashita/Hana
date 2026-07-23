---
id: ISSUE-051
title: Album full-list pagination QA
priority: P0
status: done
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 107
blocked_by:
  - ISSUE-050
requires_human_review:
  - accessibility
  - design
---

## 目的 (Why)

`/album` が初回 50 件で止まって見える状態を解消する。
API は `page.next_cursor` を返しているが、UI に load more がないため、多件数時に
「最近の一部しか見えない」不安が残る。

## スコープ (What)

- existing `GET /memories` cursor contract を使って album の追加ページを取得する
- 初回 SSR payload は維持し、追加ページを append する
- infinite cache でも favorite / delete の optimistic helper が壊れないようにする
- many-memory QA contract を docs に残す
- Issue index を最新状態へ同期する

## やらないこと (Out of Scope)

- OpenAPI / API route の変更
- album card の visual redesign
- 認証済み実データ QA
- virtualized list / search / month grouping

## 影響範囲

| 領域         | 影響                                                   |
| ------------ | ------------------------------------------------------ |
| OpenAPI      | なし                                                   |
| 生成型       | なし                                                   |
| アプリコード | album list、memory query hook、optimistic helpers      |
| テスト       | album pagination と infinite cache の unit/static test |
| ドキュメント | ISSUE-051 正本、album QA contract、Issue index         |

## 受け入れ条件 (Acceptance Criteria)

- [x] `page.next_cursor` があると album に load more action が出る
- [x] 次ページ取得で初回 SSR page を置き換えず append する
- [x] 最終ページでは load more action が消える
- [x] favorite optimistic update が infinite cache でも壊れない
- [x] empty album state は維持される
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## 検証

- `pnpm test -- tests/unit/app/album-pagination.test.ts tests/unit/lib/perf/optimistic.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- UI pagination と fake unit data のみで、実写真・画像 URL・storage_key・AI 生成本文は追加しない
- `cover_thumbnail_url` は既存 API response の signed URL をそのまま表示する
- 認証済み実データ QA は `ISSUE-041` の blocker が解けるまで別管理する

## 参考

- GitHub Issue #107
- `docs/design/album-full-list-qa.md`
- `docs/design/design-inventory-roadmap.md`
