---
id: ISSUE-047
title: Dialog accessibility foundation
priority: P0
status: review
size: S
created_at: 2026-07-23
parent: DESIGN
github_issue: 99
blocked_by:
  - ISSUE-046
requires_human_review:
  - accessibility
  - design
---

## 目的 (Why)

ISSUE-045 の P0 指摘のうち、既存 dialog の keyboard / focus / scroll 挙動を小さく整える。
AI 同意、記録キャンセル確認、記録削除確認はすでに dialog として表示されているが、
focus trap、Escape、background scroll lock、accessible naming が共通基盤化されていない。

## スコープ (What)

- shared dialog foundation を追加する
- 既存の AI consent / cancel confirm / delete confirm dialog を shared foundation に載せる
- `role="dialog"` / `aria-modal="true"` / `aria-labelledby` / `aria-describedby` を安定させる
- Escape と Tab の keyboard contract、body scroll lock を自動テストで検証する
- Issue index を `ISSUE-047 review` に同期する

## やらないこと (Out of Scope)

- dialog の文言や情報設計の全面変更
- 外側 click で閉じる挙動の追加
- memory photo alt policy の決定
- OpenAPI / API / DB / storage / AI 仕様の変更

## 影響範囲

| 領域         | 影響                                                  |
| ------------ | ----------------------------------------------------- |
| OpenAPI      | なし                                                  |
| 生成型       | なし                                                  |
| アプリコード | shared dialog foundation、record page、memory actions |
| テスト       | dialog accessibility foundation の静的 unit test      |
| ドキュメント | ISSUE-047 正本、Issue index                           |

## 受け入れ条件 (Acceptance Criteria)

- [x] 既存 dialog が shared foundation を使っている
- [x] すべての dialog に stable title / description association がある
- [x] Escape が non-pending dialog を閉じる
- [x] Tab / Shift+Tab の focus trap が shared foundation にある
- [x] open dialog 中の body scroll lock と cleanup が shared foundation にある
- [x] `git diff --check` が通る
- [x] `pnpm pr:gate` が通る

## 検証

- `pnpm test -- tests/unit/app/dialog-accessibility-foundation.test.ts`
- `git diff --check`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- UI foundation の変更のみで、個人情報・画像・AI 生成本文・storage_key は扱わない
- テスト fixture に実データを追加しない
- dialog の文言は既存 copy を維持し、AI vendor claim の根拠確認は後続 Issue に残す

## 参考

- GitHub Issue #99
- `docs/design/design-inventory-roadmap.md`
- `docs/issues/ISSUE-046-accessibility-token-viewport.md`
