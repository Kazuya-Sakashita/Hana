---
id: ISSUE-119
title: 必須入力とエラー復帰をアクセシブルにする
priority: P0
status: done
size: M
created_at: 2026-07-28
github_issue: 254
blocked_by:
  - ISSUE-116
requires_human_review:
  - accessibility
---

# ISSUE-119: 必須入力とエラー復帰をアクセシブルにする

## 目的 (Why)

読み上げ支援や認知負荷が高い状況でも、オンボーディングと記録保存のエラー原因を理解し、入力を失わずに修正・再送信できるようにする。

## スコープ (What)

- `/onboarding` と `/record` の必須表示、`required` / `aria-required` を統一する
- `aria-invalid` と個別の `aria-describedby` で入力とエラーを結び付ける
- 送信失敗後、視覚順で最初のエラーまたはエラー概要へフォーカスする
- 折りたたみ内のエラー項目を開いてからフォーカスする
- 入力を保持し、キーボードで修正・再送信できる状態を保つ

## やらないこと (Out of Scope)

- API検証規則、入力項目、保存データの変更
- 全画面のアクセシビリティ再監査
- デザインシステムの全面改修

## 受け入れ条件 (Acceptance Criteria)

- [x] 必須項目が視覚表示と `required` または `aria-required` の両方で伝わる
- [x] エラー項目に `aria-invalid` と対応する `aria-describedby` が付く
- [x] 送信失敗後、最初のエラー項目またはエラー概要へフォーカスが移る
- [x] 入力値を保持したまま修正し、キーボードだけで再送信できる
- [x] 通常進捗は過剰に割り込まず、ブロッキングエラーだけが適切に通知される
- [x] WCAG 2.4.3、3.3.1、3.3.2 の回帰テストを追加する

## 検証

- [x] フォーカス順序と概要 fallback の単体テスト
- [x] `/onboarding` と `/record` の画面契約テスト
- [x] 320 CSS px / 200% zoom / keyboard / screen reader相当 QA
- [x] Accessibility / Product UX / Frontend Reliability 専門レビュー
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## レビュー記録

- Round 1: 3名ともHOLD。同期多重送信、実DOM回帰、固定コピー、通知重複、狭幅配置を修正。
- Round 2: AccessibilityはGO、Product UXとFrontend ReliabilityはHOLD。行動可能な固定コピー、全Primary CTA共通ref、保存中の破棄無効化、409再送信回帰を追加。
- Round 3: AccessibilityとFrontend ReliabilityはGO。Product UXの最終指摘だった写真再選択時の古いエラー残留を修正し、再選択完了までDOMテストで固定。
- 再レビュー上限3回に達したため4回目は実施せず、最終指摘の修正後は主担当レビューと全自動ゲートで判定する。

## 検証結果

- `pnpm pr:gate`: 106 test files / 837 tests、契約QA、production buildが成功。
- 実ブラウザQA: `/onboarding` と `/record` を 320 / 390 / 430 / 768 CSS pxで確認し、10ケース成功。
- 320 CSS pxは、640px表示領域を200% zoomした場合のreflow相当条件として確認。
- DOM回帰で入力保持、折りたたみ展開、写真再選択・再試行後のフォーカス、409再送信、保存中破棄防止を確認。
- `git diff --check`: 成功。

## 参考

- GitHub Issue #254
- `Hana_PRD_v1.md` の30秒記録フロー
- WCAG 2.4.3 Focus Order / 3.3.1 Error Identification / 3.3.2 Labels or Instructions
