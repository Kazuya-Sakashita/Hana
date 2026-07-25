---
id: ISSUE-074
title: LP Hero を keepsake 主役の構図へ再構成
priority: P1
status: review
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

## Blocked by

- `ISSUE-071`
- `ISSUE-073`

## セキュリティ・プライバシー考慮

- Hero asset は実写真ではなく synthetic / generated / safe asset を使う
- 画像内 copy は本番 UI copy の正本にしない

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`

## 実装メモ

- Hero の背景画像と2台 phone mock を外し、`hero-keepsake` の1つの keepsake preview を visual anchor にした
- keepsake preview は photo mat / paper slip / 撮影日 / title / short copy で構成し、Hana の「写真 + ことば」価値を first view に置いた
- Primary CTA は `待機リストに登録する`、Secondary CTA は `記録例を見る` の2つに抑えた
- CTA 直下に、待機リスト登録後の用途を安全側の短文で補足した
- 920px 以下は1カラム、640px 以下は CTA を全幅化し、390 / 430 / 768 / 1280px の重なりリスクを静的契約で抑えた

## read-only review

| Reviewer                              | Verdict        | Score / Notes                                                   | P0/P1                                        |
| ------------------------------------- | -------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Visual Art Direction / Quiet Heirloom | Go             | Hero composition 4.2 / 5.0。H1 と shadow の P1 を軽く反映       | P0 なし                                      |
| Product / Conversion UX               | Conditional Go | 待機リスト後の説明と trust row の圧縮を反映                     | P0 なし                                      |
| Accessibility / Frontend QA           | Conditional Go | 44px tap target、focus-visible、figure/alt は静的確認上 P0 なし | 実ブラウザ screenshot QA は `ISSUE-075` gate |

## 検証

- `pnpm exec vitest tests/unit/app/lp-hero-keepsake-composition.test.ts --run`
- `pnpm exec vitest tests/unit/app/lp-hero-keepsake-composition.test.ts tests/unit/app/lp-before-after-proof.test.ts tests/unit/app/lp-static-prototype-review.test.ts --run`
- 実ブラウザ screenshot QA は未実施。公開前の `ISSUE-075` で 390 / 430 / 768 / 1280px の横 overflow、focus order、contrast、LCP 目安を確認する
