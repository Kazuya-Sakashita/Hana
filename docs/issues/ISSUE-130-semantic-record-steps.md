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
- [x] 進捗表示が操作ボタンに見えず、現在・完了・未完了を常時表示する
- [x] AIを使わない手動入力経路が明確なセカンダリーボタンとして見える

## 人間レビュー記録

### Round 1

- 判定: REQUEST_CHANGES
- 進捗のピル表示がボタンに見え、現在位置が視覚的に分からない
- 「AI を つかわない」が ghost 表示で、選択可能なボタンに見えない
- 対応:
  - 「記録の進み具合」見出しと「いまここ / 完了 / 未完了」を常時表示
  - ピル型をやめ、非操作の上罫線型進捗表示へ変更
  - 手動入力を太い枠線と背景を持つ outline button へ変更
  - AI完了または手動入力が保存可能になるまで下書きステップを維持

### Round 2

- 判定: REQUEST_CHANGES
- 手動入力ボタンが通常状態では背景面に溶け込み、hover するまで操作可能と分かりにくい
- 対応:
  - 通常状態を濃い実線、塗り背景、持ち上がった影へ変更
  - 鉛筆アイコンを追加し、hover に依存しない操作表現へ変更
  - 48px の高さと focus-visible 契約を維持

## セキュリティ・プライバシー考慮

- live通知には入力内容や子どもの情報を含めない
- Interaction Design / Accessibilityレビュー完了まではDraft PRとする
