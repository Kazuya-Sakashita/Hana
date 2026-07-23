---
id: ISSUE-050
title: Memory photo alt privacy policy
priority: P0
status: review
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 105
blocked_by:
  - ISSUE-049
requires_human_review:
  - accessibility
  - privacy
  - design
---

## 目的 (Why)

思い出写真の alt を、privacy と screen reader usefulness の両方に合わせる。
写真の内容を推測して詳述すると sensitive な育児情報を読み上げすぎる可能性がある一方、
詳細画面の hero photo を空 alt にすると主要コンテンツである写真の存在が伝わらない。

## スコープ (What)

- photo alt privacy policy を docs に残す
- home / album の linked thumbnails は visible title と重複するため decorative alt にする
- memory detail hero photo は generic alt にする
- current active UI を静的テストで守る
- Issue index を `ISSUE-050 review` に同期する

## やらないこと (Out of Scope)

- 画像内容の自動説明
- ユーザー入力の per-photo alt
- API / schema / DB 変更
- visual redesign

## 影響範囲

| 領域         | 影響                                                 |
| ------------ | ---------------------------------------------------- |
| OpenAPI      | なし                                                 |
| 生成型       | なし                                                 |
| アプリコード | home thumbnails、album thumbnails、detail hero photo |
| テスト       | photo alt privacy policy の静的確認                  |
| ドキュメント | ISSUE-050 正本、photo alt policy、Issue index        |

## 受け入れ条件 (Acceptance Criteria)

- [x] policy doc が privacy と screen reader usefulness を分けている
- [x] home / album linked thumbnails が visible title を重複読みしない
- [x] detail hero photo が stable generic alt を持つ
- [x] active UI に写真内容の推測説明を追加していない
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## 検証

- `pnpm test -- tests/unit/app/photo-alt-privacy-policy.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 実写真・画像 URL・storage_key・AI 生成本文は docs / tests に追加しない
- alt は写真内容を推測しない generic wording に限定する
- 詳細な写真説明や per-photo alt は後続の privacy / accessibility review が必要

## 参考

- GitHub Issue #105
- `docs/design/photo-alt-privacy-policy.md`
- `docs/design/design-inventory-roadmap.md`
