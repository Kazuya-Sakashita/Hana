---
id: ISSUE-159
title: PRD契約とfunnelのGo・Hold基準を再同期する
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 327
release_gate: product_validation
requires_human_review:
  - product
  - privacy
---

# ISSUE-159: PRD契約とfunnelのGo・Hold基準を再同期する

## 目的 (Why)

PRDのactive product contractとfunnelのGo/Hold基準を現行実装・ADR・privacy契約へ揃える。

## スコープ (What)

- 30/60秒、認証、AI送信、MVP範囲の矛盾解消
- 主張の事実/仮説/未検証分類
- 初回、D7/D30、週次、再閲覧後再記録の定義
- cohort、欠測、少数集計、判定基準

## やらないこと (Out of Scope)

- 未検証の30秒・AI品質を事実として断定すること
- 少数利用者を特定できる集計

## 受け入れ条件 (Acceptance Criteria)

- [ ] 30秒と60秒、cookie/SNS認証、外部AI送信、MVP範囲の矛盾を解消する
- [ ] 各主張を確認済み事実、仮説、未検証へ分類する
- [ ] 初回記録、D7、D30、週次記録、再閲覧後再記録の定義を固定する
- [ ] 最低cohort数、欠測、少数集計の非表示、Go/Hold/No-Go条件を定義する
- [ ] North Starが保存数だけを最適化しないよう、再閲覧と感情価値の補助指標を定義する
- [ ] ProductとPrivacyの人間review欄を用意する

## セキュリティ・プライバシー考慮

少数集計を非表示とし、ProductとPrivacyの人間reviewを必須にする。

## 参考

- GitHub Issue #327
- Hana_PRD_v1.md
