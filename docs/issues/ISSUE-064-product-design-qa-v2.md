---
id: ISSUE-064
title: Product Design QA v2
priority: P0
status: review
size: M
created_at: 2026-07-24
parent: PRODUCT-EXPERIENCE-V2
github_issue: 135
blocked_by:
  - ISSUE-060
requires_human_review:
  - design
  - accessibility
  - privacy
  - release
---

## 目的 (Why)

Quiet Heirloom の画面品質を、代表 screenshot だけでなく実 DOM / a11y / visual contract で守る。

## スコープ (What)

- `/`, `/record`, `/album`, `/memory/[id]`, `/settings`, `/onboarding` の read-only smoke 方針を決める
- tap target、horizontal overflow、heading 階層、focus、reduced motion、pressure copy を検査する
- `AppShell` / `FocusedShell` の短い縦幅、390px / 430px / 768px の実 DOM 表示を smoke 対象にする
- screenshot / accessibility snapshot の evidence policy を更新する
- CI に入れる検査と手動更新用 screenshot 生成を分ける

## やらないこと (Out of Scope)

- 大規模 screenshot 差分 CI の導入
- production data を使った QA
- `ISSUE-041` の認証済み実データ画像 QA

## 受け入れ条件 (Acceptance Criteria)

- [x] 実 DOM の design / a11y smoke が定義されている
- [x] interactive target の対象に `summary`, `[role="button"]`, focusable element が含まれる
- [x] heading 階層、tap target、focus order、horizontal overflow を実 DOM で検査する
- [x] CI で artifact を上書きしない read-only 検査になっている
- [x] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない

## 参考

- `docs/design/design-mobile-qa-review-gate.md`
- `scripts/qa/issue-059-design-mobile-gate.cjs`
