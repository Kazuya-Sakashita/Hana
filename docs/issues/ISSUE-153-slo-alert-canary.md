---
id: ISSUE-153
title: SLO・alert・synthetic canaryを定義する
priority: P0
status: blocked
size: M
created_at: 2026-08-03
github_issue: 329
blocked_by:
  - ISSUE-105
  - ISSUE-188
release_gate: reliability
requires_human_review:
  - reliability
---

# ISSUE-153: SLO・alert・synthetic canaryを定義する

## 目的 (Why)

core loopとdestructive maintenance jobのSLO、error budget、alert、synthetic canaryを定義する。

## スコープ (What)

- availability、保存、AI、Web VitalsのSLI/SLO
- maintenance jobの監視とalert
- owner、停止、調査、復旧runbook
- stagingでの合成failure検証

## やらないこと (Out of Scope)

- staging準備前の外部通知有効化
- 本文、画像情報、URL、raw user IDの記録

## 受け入れ条件 (Acceptance Criteria)

- [ ] availability、保存成功率、AI失敗率、LCP/INP/CLSのSLIと目標を定義する
- [ ] maintenance jobのlast success、eligible backlog、dead-letter件数を監視対象にする
- [ ] 2周期未成功、dead-letter発生、backlog閾値超過などのalert条件を定義する
- [ ] owner、acknowledge、disable、調査、復旧確認をrunbookへ記録する
- [ ] stagingで合成failureを発生させ、通知から復旧確認までを検証する
- [ ] dashboard、alert、証跡へ本文、画像情報、URL、raw user IDを出さない

## セキュリティ・プライバシー考慮

合成failureとstatus-only証跡だけを使う。

## 参考

- GitHub Issue #329
