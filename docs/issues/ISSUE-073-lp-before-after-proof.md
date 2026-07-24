---
id: ISSUE-073
title: LP Before / After の価値証拠を強化
priority: P0
status: todo
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

- [ ] Before / After が 3 秒で「何が変わるか」を伝える
- [ ] 写真のみ、写真 + title、写真 + 短い本文の差分が分かる
- [ ] synthetic asset / copy であることが証跡上明確
- [ ] 実写真、画像 URL、`storage_key`、prompt、AI 生成本文を含めない
- [ ] Product UX / Brand / Privacy の read-only review で P0 blocker がない

## Blocked by

- `ISSUE-071`

## セキュリティ・プライバシー考慮

- サンプルは synthetic のみ
- AI 生成品質の評価が必要な場合も本文全文ではなく、分類と score で残す

## 参考

- `docs/design/current-lp-evaluation.md`
- `docs/design/quiet-heirloom-design-canon.md`
