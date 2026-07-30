---
id: ISSUE-134
title: 記録更新に楽観的排他を導入する
priority: P1
status: review
size: M
created_at: 2026-07-30
---

## 目的 (Why)

同じ記録を別タブ・別端末で編集した際に、古い画面からの更新で新しい内容を上書きしない。

## スコープ (What)

- 更新世代 `expected_updated_at` のOpenAPI契約
- 世代一致を条件にした記録更新
- 409競合時の入力保持と最新内容への復帰導線

## やらないこと (Out of Scope)

- 複数利用者の共同編集
- 自動マージ
- 競合本文のログ・監査保存

## 影響範囲

- MemoryUpdateRequest と生成型
- 記録更新 Route Handler
- 記録編集フォームと更新テスト

## 受け入れ条件 (Acceptance Criteria)

- [ ] 更新世代の送受信契約をOpenAPIで定義する
- [ ] 世代が一致する所有者更新だけ成功する
- [ ] 古い世代は安定reasonの409 ProblemDetailsを返す
- [ ] 競合時も編集フォームの入力を保持する
- [ ] 最新内容を確認して再編集できる復帰導線がある
- [ ] 同一項目の同時更新を再現する統合テストがある
- [ ] 記録本文などのPIIをログ・競合証跡へ残さない

## セキュリティ・プライバシー考慮

競合レスポンス・ログに記録内容や更新世代の実値を含めない。所有者・未削除境界はISSUE-133を維持する。

## Review gates

Product UX / Backend / Reliability レビュー、`pnpm pr:gate`、`git diff --check`。
