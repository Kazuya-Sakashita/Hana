---
id: ISSUE-160
title: 5名pilotで30秒記録とAI下書き受容性を検証する
priority: P0
status: blocked
size: M
created_at: 2026-08-03
github_issue: 331
blocked_by:
  - ISSUE-105
  - ISSUE-152
  - ISSUE-159
  - ISSUE-161
release_gate: product_validation
requires_human_review:
  - product
  - privacy
  - ai
---

# ISSUE-160: 5名pilotで30秒記録とAI下書き受容性を検証する

## 目的 (Why)

同意済み5名と合成写真で、30秒記録、AI下書き受容性、再利用意向を測る。

## スコープ (What)

- 実施前の対象、同意、台本、停止・判定基準
- AI/手動経路の同一定義による計測
- 30秒訴求とAI品質の合否
- 集計値とstatusだけの証跡

## やらないこと (Out of Scope)

- 写真、本文、氏名、連絡先、raw session IDの証跡保存
- 基準未達の訴求を維持すること

## 受け入れ条件 (Acceptance Criteria)

- [ ] 対象条件、同意、進行台本、停止条件、Go/Hold/No-Go基準を実施前に固定する
- [ ] 5名がAI経路と手動経路で初回記録を完了し、開始点と終了点を同じ定義で測る
- [ ] 完了時間のp50、p85、完了率を測り、30秒訴求が事実か判定する
- [ ] 事実断定、本人らしさ、編集負担、信頼、再利用意向を評価する
- [ ] AI下書きは80%以上が軽微編集で保存可能、重大な創作0件を合格条件にする
- [ ] 証跡は集計値とstatusだけにし、写真、本文、氏名、連絡先、raw session IDを保存しない
- [ ] 基準未達ならLPとPRDの30秒・AI品質訴求を変更する判断を記録する

## セキュリティ・プライバシー考慮

同意済み参加者と合成写真を使い、個別sessionを再識別できる情報を保存しない。

## 参考

- GitHub Issue #331
