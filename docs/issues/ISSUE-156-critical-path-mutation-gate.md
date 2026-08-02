---
id: ISSUE-156
title: Critical pathのcoverage・mutation gateを導入する
priority: P1
status: todo
size: M
created_at: 2026-08-03
github_issue: 324
release_gate: test_quality
requires_human_review:
  - test_architecture
---

# ISSUE-156: Critical pathのcoverage・mutation gateを導入する

## 目的 (Why)

critical pathの重要な分岐が欠陥を検出できることをcoverageとmutationで継続測定する。

## スコープ (What)

- critical module別coverage baseline
- 認可、AI同意、画像lock、物理削除のmutation test
- survivor gate
- CI時間予算と閾値変更review

## やらないこと (Out of Scope)

- 全コードへの一律高coverage要求
- PIIを含むartifact

## 受け入れ条件 (Acceptance Criteria)

- [ ] critical moduleごとのbranch/function coverage baselineと最低閾値を定義する
- [ ] 代表的な認可、AI同意、画像lock、物理削除へmutation testを実行する
- [ ] survivorを一覧化し、未検出の重大mutationが残る場合はCIを失敗させる
- [ ] coverageとmutation artifactはPIIを含まず、保持期間を限定する
- [ ] CI時間予算と、閾値変更時の明示的なreview手順を定義する

## セキュリティ・プライバシー考慮

テストfixtureとartifactへPIIを含めない。

## 参考

- GitHub Issue #324
