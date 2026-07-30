---
id: ISSUE-129
title: 認証後画面にプライバシー安全なページタイトルを付ける
priority: P1
status: review
size: S
created_at: 2026-07-30
github_issue: 275
blocked_by: []
requires_human_review:
  - accessibility
  - privacy
---

# ISSUE-129: 認証後画面にプライバシー安全なページタイトルを付ける

## 目的 (Why)

複数タブと支援技術で現在地を判別でき、個人情報をブラウザタイトルへ露出しないようにする。

## 受け入れ条件 (Acceptance Criteria)

- [x] 主要画面を固定の日本語タイトルで識別できる
- [x] 子どもの名前、記録タイトル、本文を含めない
- [x] LP と Privacy の既存 metadata を維持する
- [x] 未確認 claim を追加しない
- [x] 主要ルートの metadata 回帰テストがある

## セキュリティ・プライバシー考慮

- 動的な利用者データを metadata へ渡さない
- Accessibility / Privacy の人間レビュー完了までは Draft PR とする
