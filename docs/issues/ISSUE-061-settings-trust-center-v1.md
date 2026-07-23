---
id: ISSUE-061
title: Settings Trust Center v1
priority: P0
status: todo
size: M
created_at: 2026-07-24
parent: PRODUCT-EXPERIENCE-V2
github_issue: 132
blocked_by:
  - ISSUE-060
requires_human_review:
  - design
  - accessibility
  - privacy
---

## 目的 (Why)

設定画面を、単なるアカウント表示ではなく、写真・AI・削除・データ管理を確認できる trust center にする。

## スコープ (What)

- AI 同意状態、送るもの / 送らないもの、AI を使わない選択肢を整理する
- 記録削除、復元未提供、退会・export の未実装境界を明確にする
- 「今できること」と「準備中」を分ける
- settings の状態別 screenshot / copy / a11y QA 方針を残す

## やらないこと (Out of Scope)

- AI 同意解除 API の実装
- export / account deletion の実装
- family sharing の実装

## 受け入れ条件 (Acceptance Criteria)

- [ ] settings が trust surface として成立している
- [ ] 未実装機能を「近日対応」と約束しない
- [ ] zero data retention、完全削除、復元可能を active UI で約束しない
- [ ] AI consent copy と settings copy の data boundary が一致している
- [ ] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない

## 参考

- `docs/design/product-experience-v2-plan.md`
- `docs/design/ai-consent-privacy-evidence.md`
