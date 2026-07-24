---
id: ISSUE-067
title: トークンと共通UIの質感調整
priority: P1
status: done
size: M
created_at: 2026-07-24
parent: QUIET-HEIRLOOM-REFINEMENT
github_issue: 153
blocked_by:
  - ISSUE-066
requires_human_review:
  - design
  - accessibility
---

## 目的 (Why)

Quiet Heirloom refinement の設計契約に沿って、共通デザイントークンと UI 基盤の質感を調整する。

現状の「整ったカード UI」感を少し引き、参照画像に近い「紙、写真台紙、細線、sage の記録導線」を共通部品で表現できるようにする。

## スコープ (What)

- primary action / save / done の色意味を sage 系へ寄せる
- sakura を focus / favorite / ornament など小さなアクセントへ限定する
- radius taxonomy を既存 UI に反映する
- 通常 card / paper surface の shadow と hairline を調整する
- contrast、tap target、focus、reduced motion の既存基準を維持する

## やらないこと (Out of Scope)

- ホーム / 記録 / アルバム固有のレイアウト刷新
- 新しい API / DB / Storage 仕様の追加
- 実写真素材や外部画像の追加

## 受け入れ条件 (Acceptance Criteria)

- [x] primary action / save / done は sage 系を基調にし、sakura は focus / favorite / ornament など小さなアクセントに限定されている
- [x] radius taxonomy が実装に反映され、主要 surface の任意 `rounded-[...]` が必要最小限になっている
- [x] 通常 card / paper surface は hairline と浅い影を基本にし、強い浮遊影は sheet / toast などに限定されている
- [x] body / helper / status text の contrast が既存基準を下回らない
- [x] 44px tap target、visible focus、reduced motion が維持されている
- [x] Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## レビュー

専門サブエージェント 3 名で read-only review を実施した。

| reviewer                    | verdict | notes                                                                        |
| --------------------------- | ------- | ---------------------------------------------------------------------------- |
| Design System               | GO      | QA generator の primary 不整合を修正後、sage primary / radius taxonomy は GO |
| Accessibility / Frontend QA | GO      | contrast、tap target、focus、manifest sync、`pnpm pr:gate` は GO             |
| Product / Privacy Scope     | GO      | 1 Issue 1 PR scope、evidence policy、privacy claim 追加なし                  |

## 検証

- `pnpm exec vitest run tests/unit/app/quiet-heirloom-common-ui.test.ts tests/unit/app/accessibility-baseline.test.ts tests/unit/app/design-mobile-qa-gate.test.ts`
- `pnpm qa:issue064:design-dom-smoke -- --mode=contract`
- `pnpm pr:gate`

## セキュリティ・プライバシー考慮

- UI token の変更のみ。PII、画像 URL、`storage_key`、prompt、AI 生成本文を扱わない
- screenshot / QA artifact は synthetic data のみを使う

## 参考

- `ISSUE-066`
- `docs/design/quiet-heirloom-design-canon.md`
- `docs/design/product-design-qa-v2.md`
