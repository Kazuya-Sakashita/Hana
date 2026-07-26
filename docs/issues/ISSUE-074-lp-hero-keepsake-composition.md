---
id: ISSUE-074
title: LP Hero を keepsake 主役の構図へ再構成
priority: P1
status: done
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 165
blocked_by:
  - ISSUE-071
  - ISSUE-073
requires_human_review:
  - design
  - accessibility
---

## 目的 (Why)

LP の first view を、説明スライドではなく Quiet Heirloom らしい「一枚の静かな構図」に寄せる。

専門レビューでは、背景、Hana、phone mock、CTA、trust row が同時に立ち、Hero の主役が割れていると指摘された。

## スコープ (What)

- Hero の visual anchor を 1 つに絞る
- 2 台の phone mock を使う場合は、情報量を減らすか、1 台に整理する
- keepsake preview / photo mat / paper slip の質感を主役にする
- Hero CTA は primary 1 つ、secondary 1 つまでに抑える
- Mobile / tablet / desktop で first view の重なりを確認する

## やらないこと (Out of Scope)

- 本番 app shell の redesign
- API / DB / Auth / Storage の変更
- Store / waitlist の backend 実装

## 受け入れ条件 (Acceptance Criteria)

- [x] Hero の主役が 1 つに絞られている
- [x] 390 / 430 / 768 / 1280px で Hero の文字・CTA・visual が重ならない
- [x] AI slop blacklist に該当する hero pattern がない
- [x] Visual Art Direction review で hero composition が 4.0 / 5 以上
- [x] Accessibility review で 44px tap target と focus-visible に P0/P1 blocker がない

## 実装メモ

- 2 台の phone mock と hero 内の trust row を削除し、`hero-keepsake-anchor` の単一 visual anchor に再構成した
- `hana-before-after-safe-still-life.svg` を Hero の keepsake preview にも使い、背景 visual は mood support へ弱めた
- Hero CTA は primary 1、secondary 1 に限定した。Store / waitlist の backend 接続は ISSUE-072 のスコープに残す
- 390 / 430px では CTA を縦積みにし、768px では single column、1280px では copy と visual を左右に分ける responsive contract を追加した
- Accessibility review の HOLD を受け、注記と重なりうる hero 内の装飾を削除した
- `ISSUE-073` merge 済み状態を local issue index 上で `done` に同期した

## Blocked by

- `ISSUE-071`
- `ISSUE-073`

## セキュリティ・プライバシー考慮

- Hero asset は実写真ではなく synthetic / generated / safe asset を使う
- 画像内 copy は本番 UI copy の正本にしない

## 検証

- [x] `pnpm exec vitest tests/unit/app/lp-hero-keepsake-composition.test.ts tests/unit/app/lp-before-after-proof.test.ts tests/unit/app/lp-static-prototype-review.test.ts --run`
- [x] Chrome CDP layout check: 390 / 430 / 768 / 1280px で horizontal overflow なし、copy / CTA / visual / 装飾 overlap なし
- [x] `pnpm typecheck`
- [x] `pnpm lint`
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                              | verdict | notes                                                                                                                             |
| ----- | ------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Visual Art Direction / Quiet Heirloom | GO      | Hero の主役が単一 keepsake preview になり、説明スライド感と phone mock 競合が解消。hero composition は 4.2 / 5                    |
| 1     | Accessibility / Responsive Frontend   | HOLD    | 390 / 430px で hero 内の花装飾が注記に重なる可能性。装飾非表示または余白確保が必要                                                |
| 1     | Brand / AI Slop Blacklist             | GO      | lottie / neon / isometric / dashboard / multi-phone hero / gradient orb の blacklist 該当なし。synthetic preview 表記も残っている |
| 2     | Accessibility / Responsive Frontend   | GO      | 花装飾を Hero から削除。Chrome CDP 実測で 390 / 430 / 768 / 1280px の horizontal overflow と overlap がないことを確認             |

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`
