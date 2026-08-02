---
id: ISSUE-158
title: route JS・CWV・画像処理のperformance budgetをCIへ追加する
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 326
release_gate: performance
requires_human_review:
  - performance
---

# ISSUE-158: route JS・CWV・画像処理のperformance budgetをCIへ追加する

## 目的 (Why)

route JS、Core Web Vitals、画像confirm処理の性能退行をCIで止める。

## スコープ (What)

- route別JS baselineとbudget
- 主要4画面の合成synthetic計測
- 上限サイズの合成画像1枚/5枚のconfirm計測
- warning/failure閾値とbaseline更新review

## やらないこと (Out of Scope)

- 実ユーザー画像や識別子のartifact保存
- 異なるbuild engine間の数値比較

## 受け入れ条件 (Acceptance Criteria)

- [ ] route別raw/gzip JS baselineと固定上限を同じbuild engineで生成する
- [ ] 主要4画面を合成認証データで3回測定し、中央値のLCP、CLS、TBT、transfer、request数を比較する
- [ ] 上限サイズの合成画像1枚と5枚でconfirm処理の区間別latencyとmemoryを測定する
- [ ] 警告と失敗の閾値、許容variance、baseline更新reviewを定義する
- [ ] artifactにはURL、memory ID、画像内容、ユーザー情報を保存しない

## セキュリティ・プライバシー考慮

合成認証データと合成画像だけを計測に使う。

## 参考

- GitHub Issue #326
- ISSUE-016
- ISSUE-021
- ISSUE-024
