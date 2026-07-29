---
id: ISSUE-130
title: 30秒記録の3ステップを意味のある進行表示にする
priority: P1
status: review
size: S
created_at: 2026-07-30
github_issue: 276
blocked_by: []
requires_human_review:
  - interaction_design
  - accessibility
---

# ISSUE-130: 30秒記録の3ステップを意味のある進行表示にする

## 目的 (Why)

記録フローの現在位置と完了状態を、見た目だけでなく支援技術にも伝える。

## 受け入れ条件 (Acceptance Criteria)

- [x] 3ステップを意味的な順序リストとして表す
- [x] 現在ステップに `aria-current="step"` を付ける
- [x] 完了状態を読み上げテキストでも伝える
- [x] ステップ変更を polite live region で知らせる
- [x] 既存の3列レイアウトと下部CTAを維持する
- [x] 意味構造の回帰テストがある

## セキュリティ・プライバシー考慮

- live通知には入力内容や子どもの情報を含めない
- Interaction Design / Accessibilityレビュー完了まではDraft PRとする
