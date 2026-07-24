---
id: ISSUE-070
title: アルバムと記録詳細を private shelf 体験へ調整
priority: P1
status: todo
size: M
created_at: 2026-07-24
parent: QUIET-HEIRLOOM-REFINEMENT
github_issue: 156
blocked_by:
  - ISSUE-066
  - ISSUE-067
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

アルバムと記録詳細を、実用リスト中心から「private shelf / 1 ページを取り出す」体験へ寄せる。

多件数一覧と pagination QA を壊さず、上部に featured page または大きな photo mat を置き、記録詳細では写真と物語本文が主役になるよう操作帯と保存直後表示を静かにする。

## スコープ (What)

- `/album` の上部に featured page / large keepsake preview などを追加する
- 多件数一覧、load more、favorite toggle の操作性を維持する
- `/memory/[memoryId]` の操作帯と保存直後表示を静かにする
- 390px / 430px / 768px で横あふれ、重なり、tap target を確認する

## やらないこと (Out of Scope)

- pagination API の変更
- favorite / delete / edit の API 仕様変更
- 実写真や production account を使った証跡作成

## 受け入れ条件 (Acceptance Criteria)

- [ ] `/album` の上部に featured page / large keepsake preview など、1 枚を眺める体験が追加されている
- [ ] 多件数一覧、load more、favorite toggle の操作性と QA 観点が維持されている
- [ ] `/memory/[memoryId]` で写真、meta、title/body が主役で、操作帯が過度に目立たない
- [ ] 保存直後の notice がカード感を強めすぎず、安心して読み返せる表現になっている
- [ ] 390px / 430px / 768px で横あふれ、重なり、tap target 不足がない
- [ ] Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない

## セキュリティ・プライバシー考慮

- 証跡には実写真、画像 URL、`storage_key`、prompt、AI 生成本文を残さない
- screenshot は synthetic / local data のみを使う

## 参考

- `ISSUE-066`
- `ISSUE-067`
- `docs/design/album-memory-keepsake-qa.md`
