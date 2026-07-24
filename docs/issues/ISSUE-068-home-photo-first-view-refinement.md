---
id: ISSUE-068
title: ホーム first view を写真主役へ調整
priority: P1
status: done
size: M
created_at: 2026-07-24
parent: QUIET-HEIRLOOM-REFINEMENT
github_issue: 154
blocked_by:
  - ISSUE-066
  - ISSUE-067
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

ホームの first view を、説明カード中心から「写真をしまう場所」中心へ調整する。

既存記録がある場合は最新または大切な 1 枚を大きく扱い、空状態では実写真や個人情報を含まない photo mat placeholder と静かな導線で、Hana の価値が最初の視界で伝わるようにする。

## スコープ (What)

- `/` の first view で写真または photo mat を主役にする
- 記録 CTA と bottom navigation の導線を維持する
- stats や補助説明を first view の主役から下げる
- empty / loading / long child name / 既存記録ありを確認する

## やらないこと (Out of Scope)

- 記録フロー、アルバム一覧、記録詳細の変更
- 実写真素材や外部画像の追加
- streak、未記録日数、ランキングなどの engagement 圧の追加

## 受け入れ条件 (Acceptance Criteria)

- [x] `/` の first view で写真または photo mat が主役になり、説明カードだけが先に立たない
- [x] 記録 CTA は維持され、30 秒記録導線が下部または親指圏から失われない
- [x] stats や補助説明は first view の主役にならず、必要な場合は下部に整理されている
- [x] empty / loading / long child name / 既存記録ありの状態で、横あふれや重なりがない
- [x] pressure copy、streak、未記録日数による責める表現がない
- [x] Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## レビュー

専門サブエージェント 3 名で read-only review を実施した。

| reviewer                    | verdict | notes                                                                               |
| --------------------------- | ------- | ----------------------------------------------------------------------------------- |
| Product UX / 30 秒記録      | GO      | first view の写真台紙主役化と `/record` CTA 維持は GO。pressure copy 追加なし       |
| Privacy / Trust / Content   | GO      | 実写真、画像 URL、`storage_key`、prompt、AI 生成本文、unsafe trust claim の混入なし |
| Visual / A11y / Engineering | HOLD→GO | placeholder copy と長文 title wrap、状態別 layout fixture を修正後 GO               |

## 検証

- `pnpm exec vitest run tests/unit/app/home-photo-first-view-refinement.test.ts tests/unit/app/home-photo-first-view-layout-fixtures.test.ts tests/unit/app/home-quiet-heirloom.test.ts tests/unit/app/product-experience-v2-contract.test.ts tests/unit/app/design-mobile-qa-gate.test.ts tests/unit/app/quiet-heirloom-common-ui.test.ts`
- `pnpm exec tsc --noEmit`
- `pnpm exec eslint src/app/page.tsx tests/unit/app/home-photo-first-view-refinement.test.ts tests/unit/app/home-photo-first-view-layout-fixtures.test.ts tests/unit/app/home-quiet-heirloom.test.ts`
- `git diff --check`
- `pnpm qa:issue064:design-dom-smoke -- --mode=contract`
- `pnpm build:ci`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- 実ユーザー写真や URL を証跡に残さない
- QA は synthetic account / local data で行う

## 参考

- `ISSUE-066`
- `ISSUE-067`
- `docs/design/quiet-heirloom-design-canon.md`
