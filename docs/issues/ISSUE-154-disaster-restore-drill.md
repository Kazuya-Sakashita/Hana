---
id: ISSUE-154
title: DB・Storage・Authの復旧契約と合成restore drillを作る
priority: P0
status: blocked
size: M
created_at: 2026-08-03
github_issue: 330
blocked_by:
  - ISSUE-105
release_gate: disaster_recovery
requires_human_review:
  - reliability
  - privacy
---

# ISSUE-154: DB・Storage・Authの復旧契約と合成restore drillを作る

## 目的 (Why)

DB、Storage、Authを横断する災害復旧契約と隔離環境でのrestore drillを作る。

## スコープ (What)

- data class別RPO/RTOと責任分界
- 復旧順序とreconciliation runbook
- 削除済みデータを復活させない条件
- freshな隔離projectでの合成drill

## やらないこと (Out of Scope)

- 実ユーザーデータを使う復旧演習
- 接続情報や識別子の証跡保存

## 受け入れ条件 (Acceptance Criteria)

- [ ] data classごとのRPO、RTO、backup対象、provider責任、Hana責任を定義する
- [ ] DB、Storage、Authの復旧順序と整合性reconciliationをrunbook化する
- [ ] 削除済みaccount、memory、imageを復旧対象へ戻さない検証条件を定義する
- [ ] freshな隔離projectと合成データだけでrestore drillを実行する
- [ ] 復旧時間、欠損件数、不整合件数、最終判定だけを証跡に残す
- [ ] 中断条件、rollbackまたはforward-fix判断、再演習頻度を定義する

## セキュリティ・プライバシー考慮

実ユーザーを含まない隔離projectと合成データだけを使う。

## 参考

- GitHub Issue #330
