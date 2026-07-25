---
id: ISSUE-078
title: Record 30秒 one-decision flow を LP-App visual grammar に合わせる
priority: P0
status: review
size: M
created_at: 2026-07-25
parent: LP-APP-DESIGN-PARITY
github_issue: 175
blocked_by:
  - ISSUE-076
  - ISSUE-077
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

Record 30秒フローを、`ISSUE-076` / `ISSUE-077` で固定した LP-App visual grammar と共通
keepsake primitive に接続する。

既存の upload / AI consent / manual save / save flow は維持しつつ、写真台紙、paper slip、
quiet icon、sage primary CTA、保存前 preview の見え方を LP の落ち着いた雰囲気へ近づける。

## スコープ (What)

- `/record` の写真領域を `PhotoMat` / `PhotoInner` / `PhotoPlaceholder` に寄せる
- decision cue、AI decision、story preview、secondary edits を `PaperSlip` / `KeepsakePreview` /
  shared `Textarea` に寄せる
- step / action icon の sakura 過多を抑え、sage / ink 主体の quiet language に寄せる
- 既存の 30秒 bottom sheet、safe area、AI optional path、consent boundary を維持する
- 静的 contract test と Issue index を更新する

## やらないこと (Out of Scope)

- API / DB / Auth / Storage / OpenAPI の変更
- AI 同意文言や privacy claim の新規断定
- 画像アップロード、AI 生成、保存ロジックの仕様変更
- BottomNav 全体や Album / Memory Detail の刷新

## 影響範囲

- `src/app/record/page.tsx`
- `src/components/product/surfaces.tsx` / `src/components/product/icons.tsx` の利用箇所
- `src/components/ui/textarea.tsx` の利用箇所
- Record 系の静的 contract test
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] 写真未選択 / 選択済み状態が `photo mat + photo inner` の構成で表現されている
- [x] decision cue / AI decision / story preview / secondary edits が paper-slip 系 primitive に寄っている
- [x] 本文入力が shared `Textarea` を使い、mobile で `text-base` / focus ring / paper-slip を維持する
- [x] primary save / photo selection CTA が下部 sheet の thumb zone に残る
- [x] AI を使わない保存 path、初回同意 path、AI 生成 path が維持される
- [x] sakura は大面積 CTA や step active ではなく、小さな accent に限定される
- [x] Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メールを残さない

## 実装メモ

- `/record` の写真未選択状態を `PhotoPlaceholder`、選択済み状態を `PhotoMat` + `PhotoInner`
  に接続した
- decision cue / AI decision を `PaperSlip`、story preview を `KeepsakePreview`、secondary edits を
  `PaperSlip` + `Textarea` に接続した
- step active を sakura から leaf / sage へ寄せ、`QuietIcon` で icon stroke と active 表現を統一した
- `PhotoPlaceholder` は Record から `data-testid` などを渡せるよう、`PhotoMat` props を受ける形にした
- `ISSUE-077` は merge 済みのため、依存メタデータとして local issue status と index を `done` へ同期した

## セキュリティ・プライバシー考慮

- AI 同意と送信境界は既存の privacy evidence と API gate を維持する
- 写真 upload / confirm / AI generate / save の処理順や送信項目は変更しない
- PR body、Issue、test fixture に実写真、画像 URL、signed URL、`storage_key`、prompt、
  AI 生成本文、メールを残さない

## 検証

- [x] `pnpm exec vitest tests/unit/app/record-lp-app-alignment.test.ts tests/unit/app/record-one-decision-sheet-refinement.test.ts tests/unit/app/record-bottom-sheet-flow.test.ts tests/unit/app/record-one-decision-layout-fixtures.test.ts tests/unit/app/quiet-heirloom-primitives.test.ts tests/unit/app/lp-app-visual-grammar.test.ts --run`
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                       | verdict | notes                                                                                           |
| ----- | ------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| 1     | Product UX / 30秒記録          | GO      | 30秒 path、AI optional、primary CTA、pressure copy に blocker なし。mobile visual QA は warning |
| 1     | Visual System / Accessibility  | GO      | primitive 接続、sakura 抑制、tap target、Textarea は GO。status/test 同期は対応済み             |
| 1     | Privacy / Trust / Content Safe | GO      | API/Auth/Storage/OpenAPI/AI consent boundary 変更なし。PR evidence safety 継続                  |

## 参考

- `docs/design/lp-app-visual-grammar.md`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
- `docs/issues/ISSUE-076-lp-app-visual-grammar.md`
- `docs/issues/ISSUE-077-keepsake-primitives-icon-language.md`
