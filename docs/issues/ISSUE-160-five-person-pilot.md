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
  - ISSUE-191
  - ISSUE-159
  - ISSUE-161
  - ISSUE-185
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
- participant consentの取得・撤回、pilot dataの保存期限と削除
- counterbalance、retry / timeout / censoring、分位点algorithm、圧力guardrailの事前固定
- metric IDとstatusだけの証跡

## やらないこと (Out of Scope)

- 写真、本文、氏名、連絡先、raw session IDの証跡保存
- 基準未達の訴求を維持すること
- production telemetryの欠測補正、集約権限、退会purge、HMAC key lifecycle

## 受け入れ条件 (Acceptance Criteria)

- [ ] 対象条件、同意、進行台本、停止条件、Go/Hold/No-Go基準を実施前に固定する
- [ ] pilot専用同意の取得・撤回方法、保存期限、削除責任者、削除確認を実施前に固定する
- [ ] 5名がAI経路と手動経路で初回記録を完了し、経路順をcounterbalanceする
- [ ] 開始点・終了点、初回試行、retry、timeout、中断、censoringを経路間で同じ定義にする
- [ ] client monotonic timerで「記録画面の主操作が可能になった時点」から「create APIの成功とDB保存確認」までを測り、network時間を含める
- [ ] retryでtimerをresetせず、事前固定timeout時は未完了としてcensorし、成功者だけの分位点へ変えない
- [ ] p50 / p85は事前に固定したnearest-rank algorithmで算出し、経路別の値と完了率を判定する
- [ ] 事実断定、本人らしさ、編集負担、信頼、再利用意向を評価する
- [ ] AI下書きは80%以上が軽微編集で保存可能、重大な創作0件を合格条件にする
- [ ] 「急かされた」「記録できていないと責められた」と感じる圧力guardrailを5名全員からstatus-onlyで確認する
- [ ] 個別計測値は同意済みの制限付き一時領域だけで扱い、判定後の削除期限を固定する
- [ ] repo、PR、CI、release evidenceはmetric IDとstatusだけにし、p50、p85、率、件数、写真、本文、氏名、連絡先、raw session IDを保存しない
- [ ] 基準未達ならLPとPRDの30秒・AI品質訴求を変更する判断を記録する

## セキュリティ・プライバシー考慮

同意済み参加者と合成写真を使い、個別sessionを再識別できる情報を保存しない。撤回時は
pilot用対応表とraw計測を期限内に削除し、release evidenceにはmetric IDとstatusだけを残す。

## 参考

- GitHub Issue #331
- ISSUE-159
- ISSUE-185
