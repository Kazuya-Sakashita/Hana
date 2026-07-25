---
id: ISSUE-079
title: BottomNav と action icon を quiet alignment に合わせる
priority: P1
status: done
size: M
created_at: 2026-07-25
parent: LP-APP-DESIGN-PARITY
github_issue: 177
blocked_by:
  - ISSUE-076
  - ISSUE-077
  - ISSUE-078
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

BottomNav と主要 action icon を、`ISSUE-076` / `ISSUE-077` の LP-App visual grammar と
icon language に合わせる。

現状は lucide 化は済んでいるが、BottomNav の active state が色と太さに寄り、中央記録
action が `+` 単体で少し浮きすぎている。Album / Memory Detail の favorite / delete action
も `QuietIcon` の fill / stroke / tone 規約に寄せる。

## スコープ (What)

- BottomNav の中央 record action を `ImagePlus` ベースの quiet icon にする
- BottomNav active state を色だけでなく pill / surface / indicator でも示す
- BottomNav の 44px tap target、safe area、hidden paths、prefetch 方針を維持する
- Album favorite と Memory Detail favorite/delete action を `QuietIcon` に寄せる
- Toast close は `ISSUE-077` で対応済みのため、regression test のみ確認する
- 静的 contract test と Issue index を更新する

## やらないこと (Out of Scope)

- API / DB / Auth / Storage / OpenAPI の変更
- BottomNav の表示対象 route 変更
- `/record` 集中フローで BottomNav を表示する変更
- Album / Memory Detail のレイアウト刷新
- privacy / trust copy の変更

## 影響範囲

- `src/components/bottom-nav.tsx`
- `src/features/memories/client/album-list.tsx`
- `src/components/memory-actions.tsx`
- BottomNav / action icon 系の静的 contract test
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] BottomNav 中央 action が `Plus` 単体ではなく `ImagePlus` / quiet icon language に沿う
- [x] BottomNav active state が色だけに依存せず、surface / indicator の差がある
- [x] BottomNav と action icon は 44px 以上の tap target を維持する
- [x] favorite の fill 例外は Heart のみで、delete は neutral / warning 規約から逸脱しない
- [x] `/sign-in`, `/auth/callback`, `/onboarding`, `/record` では BottomNav 非表示が維持される
- [x] Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 実装メモ

- BottomNav の中央 record action を `ImagePlus` + `QuietIcon` に変更した
- BottomNav を 5 列 grid にし、中央列に record action、右側に `aria-hidden` spacer を置いて幾何学的中央を保った
- BottomNav active state に `data-active-indicator`、`bg-paper-slip`、`shadow-soft` の surface 差を追加した
- `QuietIcon` の favorite tone は inactive を `ink-tertiary`、active を `sakura-deep` + fill に調整した
- Album favorite と Memory Detail favorite/delete action を `QuietIcon` に接続した
- `ISSUE-078` は merge 済みのため、依存メタデータとして local issue status と index を `done` へ同期した

## セキュリティ・プライバシー考慮

- 画面遷移と icon 表現だけの変更であり、写真 upload / signed URL / AI / Auth / DB には触れない
- PR body、Issue、test fixture に実写真、画像 URL、signed URL、`storage_key`、prompt、
  AI 生成本文、メールを残さない
- favorite / delete の既存 API 呼び出し、optimistic update、rollback の処理順は変更しない

## 検証

- [x] `pnpm exec vitest tests/unit/app/bottom-nav-action-icon-alignment.test.ts tests/unit/app/quiet-heirloom-common-ui.test.ts tests/unit/app/quiet-heirloom-primitives.test.ts tests/unit/app/lp-app-visual-grammar.test.ts tests/unit/app/album-memory-keepsake.test.ts tests/unit/app/album-memory-private-shelf-refinement.test.ts tests/unit/app/record-lp-app-alignment.test.ts --run`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                       | verdict | notes                                                                     |
| ----- | ------------------------------ | ------- | ------------------------------------------------------------------------- |
| 1     | Product UX / Navigation        | HOLD    | 4 列 grid で record action が中央からずれる。5 列 grid + spacer へ修正    |
| 2     | Product UX / Navigation        | GO      | 中央位置 blocker は解消。mobile visual balance は warning                 |
| 1     | Visual System / Accessibility  | GO      | active indicator、ImagePlus、44px target、favorite tone は GO             |
| 1     | Privacy / Trust / Content Safe | GO      | API/Auth/Storage/OpenAPI/AI consent boundary 変更なし。既存 rollback 維持 |

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/product-design-qa-v2.md`
- `docs/issues/ISSUE-076-lp-app-visual-grammar.md`
- `docs/issues/ISSUE-077-keepsake-primitives-icon-language.md`
- `docs/issues/ISSUE-078-record-lp-app-alignment.md`
