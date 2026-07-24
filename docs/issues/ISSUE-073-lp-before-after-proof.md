---
id: ISSUE-073
title: LP Before / After の価値証拠を強化
priority: P0
status: review
size: M
created_at: 2026-07-25
parent: LP-PUBLIC-READINESS
github_issue: 164
blocked_by:
  - ISSUE-071
requires_human_review:
  - design
  - privacy
---

## 目的 (Why)

Hana の差別化である「写真のみ → 写真 + ことば」の価値を、LP 上で一目で伝わる証拠にする。

現在の prototype は synthetic な短文例を置いたが、PRD が求める Before / After の説得力としてはまだ弱い。

## スコープ (What)

- 実データではない日常写真風の safe asset を用意する
- 「写真だけ」と「Hana で残すと」の差分を、文章量を増やしすぎずに示す
- AI 生成本文ではなく、人間レビュー済みの synthetic 例として扱う
- Product UX / Brand / Privacy の観点で再レビューする

## やらないこと (Out of Scope)

- 実ユーザー写真の利用
- 実名、誕生日、メール、位置情報を含む例示
- AI 生成本文の全文を証跡として残すこと

## 受け入れ条件 (Acceptance Criteria)

- [x] Before / After が 3 秒で「何が変わるか」を伝える
- [x] 写真のみ、写真 + title、写真 + 短い本文の差分が分かる
- [x] synthetic asset / copy であることが証跡上明確
- [x] 実写真、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- [x] Product UX / Brand / Privacy の read-only review で P0 blocker がない

## Blocked by

- `ISSUE-071`

## セキュリティ・プライバシー考慮

- サンプルは synthetic のみ
- AI 生成品質の評価が必要な場合も本文全文ではなく、分類と score で残す

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`

## 実装メモ

- LP の Before / After に同一の safe synthetic still-life asset を配置し、Before は `画像` / `撮影日`、After は `写真` / `タイトル` / `短いことば` の差分として示す
- After 側の短文は人間作成の synthetic sample とし、実名、メール、生年月日、位置情報、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- LP 上にも「合成アセットと人間作成の短い例文」「実データなし」を表示し、視覚ユーザーとスクリーンリーダーの双方に実データではないことを伝える
- 待機リストフォームの placeholder はメール形式のサンプルを避け、PR evidence にメールアドレス風文字列を残さない

## 初回 read-only review

| Reviewer                         | Verdict | P0 指摘                                                                                        | 対応                                                             |
| -------------------------------- | ------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Product UX / HEART + JTBD        | Hold    | テスト範囲のメール形式 placeholder、Issue status / AC 不整合                                   | `placeholder` を非メール形式に変更し、Issue を `review` へ同期   |
| Brand / Visual Art Direction     | Hold    | Issue status / AC 不整合                                                                       | Issue evidence を同期                                            |
| Privacy / Trust / Content Safety | Hold    | メール形式 placeholder、Issue status / AC 不整合、synthetic disclosure が `aria-hidden` 内のみ | placeholder と Issue evidence を修正し、可読な disclosure を追加 |

## 再レビュー結果

| Reviewer                         | Verdict | P0 blocker | Notes                                                                                                      |
| -------------------------------- | ------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| Product UX / HEART + JTBD        | Go      | なし       | 3秒理解と JTBD の価値証拠は十分 Go                                                                         |
| Brand / Visual Art Direction     | Go      | なし       | `合成サンプル` 表記とパネル影の抑制で Quiet Heirloom に寄せた                                              |
| Privacy / Trust / Content Safety | Go      | なし       | 実写真、画像 URL、`storage_key`、prompt、AI 生成本文、実名・メール・生年月日・位置情報の混入は見当たらない |

## 検証

- `pnpm exec vitest tests/unit/app/lp-before-after-proof.test.ts --run`
- `pnpm exec vitest tests/unit/app/lp-before-after-proof.test.ts tests/unit/app/lp-static-prototype-review.test.ts --run`
- `pnpm format:check`
- `git diff --check`
- `pnpm pr:gate`
