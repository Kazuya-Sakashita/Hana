---
id: ISSUE-074
title: LP Hero を keepsake 主役の構図へ再構成
priority: P1
status: todo
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

- [ ] Hero の主役が 1 つに絞られている
- [ ] 390 / 430 / 768 / 1280px で Hero の文字・CTA・visual が重ならない
- [ ] AI slop blacklist に該当する hero pattern がない
- [ ] Visual Art Direction review で hero composition が 4.0 / 5 以上
- [ ] Accessibility review で 44px tap target と focus-visible に P0/P1 blocker がない

## Blocked by

- `ISSUE-071`
- `ISSUE-073`

## セキュリティ・プライバシー考慮

- Hero asset は実写真ではなく synthetic / generated / safe asset を使う
- 画像内 copy は本番 UI copy の正本にしない

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`
