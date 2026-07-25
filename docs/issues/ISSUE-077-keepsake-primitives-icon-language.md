---
id: ISSUE-077
title: 共通 keepsake primitive と icon language を実装する
priority: P0
status: review
size: M
created_at: 2026-07-25
parent: APP-DESIGN-PARITY
github_issue: 173
blocked_by:
  - ISSUE-076
requires_human_review:
  - design
  - accessibility
---

## 目的 (Why)

LP と本体アプリの差は、配色よりも `photo mat`、`paper slip`、静かな icon の使い方が画面ごとに散っていることにある。
画面別の修正へ進む前に、Hana らしい写真台紙・紙片・操作 icon を共通部品として固定する。

## スコープ (What)

- `PhotoMat` / `PhotoPlaceholder` / `PaperSlip` / `KeepsakePreview` を共通 primitive として追加する
- `QuietIcon` / `QuietIconButton` を追加し、lucide 標準、stroke、tone、fill 例外を実装する
- `Textarea` を既存 `Input` と同じ Quiet Heirloom token で追加する
- Dialog overlay を warm veil に寄せる
- Toast close を 44px tap target の icon button に寄せる
- 静的テストで primitive / icon language / tap target 契約が消えないようにする

## やらないこと (Out of Scope)

- Home / Record / Album / Memory Detail の画面構成変更
- BottomNav の中央 action 再設計
- API / DB / Auth / Storage / OpenAPI の変更
- 実 screenshot artifact の作成

## 影響範囲

- `src/components/product/surfaces.tsx`
- `src/components/product/icons.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/dialog.tsx`
- `src/components/ui/toast.tsx`
- `tests/unit/app/quiet-heirloom-primitives.test.ts`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] `PhotoMat` / `PhotoPlaceholder` / `PaperSlip` / `KeepsakePreview` が追加されている
- [x] `QuietIcon` / `QuietIconButton` が stroke、tone、active、favorite fill 例外を持つ
- [x] `Textarea` が `paper-slip` / hairline / focus-visible / radius token を使う
- [x] Dialog overlay が `bg-black/40` ではなく warm veil に寄っている
- [x] Toast close が 44px tap target を満たし、visible text button ではない
- [x] focused unit test が通る
- [x] `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- UI primitive 追加のみで、OpenAPI / DB / Auth / Storage には触れない
- screenshot / PR body に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文を残さない
- icon や装飾で AI 同意、削除、保持の説明を曖昧にしない

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- GitHub Issue: #173

## 検証

- 2026-07-25: `pnpm exec vitest tests/unit/app/quiet-heirloom-primitives.test.ts tests/unit/app/quiet-heirloom-common-ui.test.ts tests/unit/app/lp-app-visual-grammar.test.ts --run` pass
- 2026-07-25: `pnpm typecheck` pass
- 2026-07-25: `pnpm lint` pass
- 2026-07-25: `pnpm pr:gate` pass

## 実装メモ

- `src/components/product/surfaces.tsx` に `PhotoMat` / `PhotoPlaceholder` / `PaperSlip` / `KeepsakePreview` を追加した
- `src/components/product/icons.tsx` に `QuietIcon` / `QuietIconButton` を追加し、lucide 標準の tone / stroke / fill 例外を固定した
- `src/components/ui/textarea.tsx` を追加し、paper-slip / hairline / focus-visible の入力面を揃えた
- Dialog overlay を warm veil に寄せ、Toast close を 44px icon button に変更した

## Review Ledger

| round | reviewer                       | verdict         | notes                                                              |
| ----- | ------------------------------ | --------------- | ------------------------------------------------------------------ |
| 1     | Design System / Quiet Heirloom | Hold            | favorite-only fill と photo-mat + photo-inner 契約が不足。修正済み |
| 1     | Accessibility / Frontend       | Go with warning | Textarea 16px 化、非装飾 icon label 必須化を推奨。修正済み         |
| 1     | Implementation / Privacy       | Hold            | favorite-only fill が未強制。scope / privacy は問題なし。修正済み  |
| 2     | Design System / Quiet Heirloom | Go              | favorite-only fill、PhotoInner、warm veil を確認                   |
| 2     | Accessibility / Frontend       | Go              | Textarea 16px、非装飾 icon label 必須、toast 44px を確認           |
| 2     | Implementation / Privacy       | Go with warning | ISSUE-076 状態同期は PR body に明記する                            |
