---
id: ISSUE-155
title: confirmed cleanupへlease・backoff・dead-letterを追加する
priority: P0
status: todo
size: M
created_at: 2026-08-03
github_issue: 323
release_gate: image_cleanup_reliability
requires_human_review:
  - reliability
  - database
---

# ISSUE-155: confirmed cleanupへlease・backoff・dead-letterを追加する

## 目的 (Why)

confirmed後に記録へ紐付かなかった画像cleanupを安全に再試行・停止・調査できるようにする。

## スコープ (What)

- lease、backoff、dead-letter状態契約
- poison itemを分離するbatch処理
- 合成PostgreSQL/Storageでの同時実行・回復検証
- countと固定reasonだけのmetrics/log

## やらないこと (Out of Scope)

- 実環境migration適用
- 画像ID、URL、storage keyのログ出力

## 受け入れ条件 (Acceptance Criteria)

- [ ] attempts、next attempt、claim token、lease、固定failure reasonの状態契約を定義する
- [ ] 一時失敗はbackoff付きで再試行し、上限到達後はdead-letterへ移る
- [ ] poison itemが同じbatchの他候補を塞がない
- [ ] 同時実行、lease失効、Storage失敗、回復を合成PostgreSQLとStorageで検証する
- [ ] metricsとログは件数と固定reasonだけを出し、画像ID、URL、storage keyを出さない
- [ ] 実環境migration適用は別の人間承認まで行わない

## セキュリティ・プライバシー考慮

合成データだけを使い、識別子をmetrics/logへ出さない。

## 参考

- GitHub Issue #323
