---
id: ISSUE-118
title: AI利用同意を設定画面から撤回できるようにする
priority: P0
status: review
size: M
created_at: 2026-07-28
github_issue: 253
requires_human_review:
  - privacy
  - legal
---

# ISSUE-118: AI利用同意を設定画面から撤回できるようにする

## 目的 (Why)

一度AI利用へ同意した後も、ユーザー本人が将来のAI送信を自分の意思で停止できるようにする。

## スコープ (What)

- `DELETE /me/ai-consent`を本人認証必須・冪等な撤回APIとして定義する
- 設定画面のTrust Centerに同意済みの場合だけ撤回操作を表示する
- 撤回前に、影響範囲と影響しない範囲を確認ダイアログで説明する
- 撤回前に開始したAI生成は完了する場合があることを説明し、外部送信直前にも同意を再確認する
- 撤回後はAI生成を`ai_consent_required`で拒否し、AIなしの記録操作は継続できる

## やらないこと (Out of Scope)

- 同意文面の版管理
- AI提供者への遡及削除要求
- 既存記録、過去のAI送信、アカウントの削除

## 受け入れ条件 (Acceptance Criteria)

- [x] AI利用同意の撤回APIがOpenAPIに定義され、冪等に動作する
- [x] 所有者本人だけが同意状態を変更できる
- [x] 撤回後のAI生成が`ai_consent_required`で拒否される
- [x] AIを使わない記録保存・編集・閲覧は従来どおり利用できる
- [x] 撤回が既存記録や過去送信の削除ではないことを確認前に説明する
- [x] 確認ダイアログのフォーカス管理、Escape、読み上げを自動テストする

## セキュリティ・プライバシー考慮

- 認証セッション由来の本人IDだけを更新条件に使い、任意のユーザーIDを受け取らない
- 撤回時刻や同意状態をログへ出さず、レスポンスは既存`AppUser`契約に限定する
- 本操作を既存記録や過去送信の個別削除手続きと誤認させず、遡及削除を保証しない

## 検証

- [x] OpenAPI lint / 型生成 / route map
- [x] 未認証 / 同意済み / 未同意 / 再撤回のAPI結合テスト
- [x] 撤回後の`ai_consent_required`回帰テスト
- [x] Settings UI / focus / Escape / 読み上げ契約テスト
- [ ] Privacy / Legal Human Review
- [x] 専門サブエージェントレビュー（最大3 Round）
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー記録

- Round 1: 3名ともHOLD。外部送信前の同意再確認、同意API競合、cache競合、失敗copy、成功focus、実DOMテストを修正
- Round 2: Privacy/Legal UXとAPI Security/ReliabilityはGO。UX/A11yはpending遷移時のfocusをHOLD
- Round 3: `aria-disabled`と多重送信guardでpending focusは解消。応答喪失後の再取得で撤回済みになった経路のfocusをHOLD
- Round 3後: 最大回数に達したため追加レビューは行わず、再取得で撤回済みなら成功へ昇格してstatusへfocusする修正と再現DOMテストを追加
- マージ条件: Privacy / Legal Human Review承認

## 参考

- GitHub Issue #253
- ADR-0011
- `docs/api-driven-development/security-and-privacy.md`
