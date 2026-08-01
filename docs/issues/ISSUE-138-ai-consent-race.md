---
id: ISSUE-138
title: AI同意撤回後の外部送信を競合なく遮断する
priority: P0
status: review
size: M
created_at: 2026-07-31
github_issue: 297
release_gate: mvp_quality
blocked_by:
  - ISSUE-118
requires_human_review:
  - privacy
  - ai_safety
  - backend
---

# ISSUE-138: AI同意撤回後の外部送信を競合なく遮断する

## 目的 (Why)

同意撤回が確定した後に写真や呼び名がAIベンダーへ新規送信される競合を防ぐ。

## スコープ (What)

- 同意世代または同等の直列化境界
- 送信直前の同意再検証
- 撤回と生成開始の並行テスト

## 実装契約

- AI生成のvendor送信区間と同意撤回は、同じuser単位advisory lockで直列化する
- 撤回が先にcommitした場合、生成はlock取得後の同意再検証で停止する
- 生成が先にvendor送信を開始した場合、撤回はその試行終了後にcommitする
- 同意更新transactionは生成側の最大30秒より長い40秒を許容し、待機上限超過は固定reason `ai_consent_update_busy` を返す
- 同意再検証でvendor未送信のまま停止した生成予約はquotaへ加算しない
- 本Issueの撤回境界は明示的な同意更新APIを対象とする。退会は画像アクセスlockで生成と直列化し、ISSUE-139でlock順を再設計する
- ISSUE-139で外部通信をtransaction外へ分離する際も、この順序契約を維持する

## 受け入れ条件 (Acceptance Criteria)

- [x] 撤回と生成開始が同じ直列化規則を使う
- [x] 撤回commit後に新規vendor requestを開始しない
- [x] 競合時は固定reasonを返す
- [x] 送信直前に同意世代を再検証する
- [x] 進行中requestの扱いを文書化する
- [x] 撤回と生成開始の並行統合テストがある
- [x] 写真、呼び名、prompt、生成本文をログへ出さない

## 検証結果

- `pnpm pr:gate`: PASS（141 files / 1104 tests、lint、typecheck、buildを含む）
- `pnpm vitest run tests/integration/v1/me.test.ts tests/integration/v1/ai-generate.test.ts tests/unit/features/ai/consent-lock.test.ts`: 32 tests passed
- ローカルPostgreSQL 16 + `pnpm qa:issue138:consent-boundary-db`: PASS（合成データのみ、`.env.local`無効化）
- ISSUE-143統合後も、最大5枚・12秒deadline・画像lockとAI同意lockを両立することを確認
- Security / Reliability specialist review: APPROVE

## 人間レビュー

- [x] Privacy: 撤回確定後は新しい外部送信を開始せず、先に始まった1件は完了後に撤回が確定する契約を承認（2026-08-01）
- [ ] AI Safety: 進行中送信を完了後に撤回する文言・挙動を確認
- [ ] Backend: 40秒transaction / 60秒RouteとISSUE-139への引継ぎを確認

## Blocked by

- ISSUE-118
