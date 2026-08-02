---
id: ISSUE-125
title: Storageエラーログを固定reason allowlistへ統一する
priority: P1
status: done
size: S
created_at: 2026-07-30
github_issue: 271
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - security
  - privacy
---

# ISSUE-125: Storageエラーログを固定reason allowlistへ統一する

## 目的 (Why)

Storage SDK の外部エラー文に含まれうる URL、token、storage key をログへ混入させない。

## スコープ (What)

- signed upload / download と variant upload / fallback の失敗ログを固定 reason にする
- reason と固定メッセージを閉じた型で管理する
- 機密文字列を含む mock error の回帰テストを追加する

## やらないこと (Out of Scope)

- 外部ログサービス導入
- ログ保存期間の変更
- Storage API の再設計

## 影響範囲

- uploads route handlers
- signed URL generation
- Storage integration tests

## 受け入れ条件 (Acceptance Criteria)

- [x] SDK の message、URL、storage key をログへ渡さない
- [x] upload、variant、fallback の失敗を固定 reason で識別できる
- [x] 機密文字列を含む mock error でもログへ漏れない
- [x] Storage エラーログを閉じた型と単体テストで検証する
- [x] クライアント向け Problem Details 契約を維持する

## セキュリティ・プライバシー考慮

- 外部 error object をロガーへ渡さない
- reason はコード内の allowlist 以外を受け付けない
- Security / Privacy の人間レビュー完了までは Draft PR とする
