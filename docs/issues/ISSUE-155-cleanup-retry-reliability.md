---
id: ISSUE-155
title: confirmed cleanupへlease・backoff・dead-letterを追加する
priority: P0
status: review
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

## 影響範囲

- `images`のconfirmed cleanup状態とmigration
- confirmed未紐付け画像cleanup workerと内部cron応答
- 合成PostgreSQL/Storage QAと運用Runbook

OpenAPI、公開API、実Storage、production/staging DBには影響しない。

## やらないこと (Out of Scope)

- 実環境migration適用
- 画像ID、URL、storage keyのログ出力

## 受け入れ条件 (Acceptance Criteria)

- [x] attempts、next attempt、claim token、lease、固定failure reasonの状態契約を定義する
- [x] 一時失敗はbackoff付きで再試行し、上限到達後はdead-letterへ移る
- [x] poison itemが同じbatchの他候補を塞がない
- [x] 同時実行、lease失効、Storage失敗、回復を合成PostgreSQLとStorageで検証する
- [x] metricsとログは件数と固定reasonだけを出し、画像ID、URL、storage keyを出さない
- [x] 実環境migration適用は別の人間承認まで行わない

## 検証結果

- `pnpm qa:issue155:cleanup-db`: 合成PostgreSQL/Storageで11テスト成功
- `pnpm pr:gate`: format、lint、Issue/OpenAPI契約、typecheck、全体test、build成功
- production/staging DB migrationおよび実Storage applyは未実施

## 専門レビュー

- Round 1 reliability: HOLD（lease失効、queue飢餓、実行deadline）
- Round 1 database: HOLD（lease失効、状態制約、migration運用、index）
- Round 2 reliability: PASS
- Round 2 database: HOLD（keyset cursorのDB/JavaScript日時精度差）
- Round 3 reliability: PASS（actionable finding 0件）
- Round 3 database: PASS（actionable finding 0件）
- Merge gate Round 1 image: HOLD（同じstorage keyへの先行writerとの直列化）
- Merge gate Round 1 privacy: HOLD（storage key形式・所有者prefixの検証）
- 対応: 共通storage lock順序、backfill fencing、不正keyのStorage非接触dead-letter、合成競合テストを追加
- Merge gate Round 2: HOLD（storage lockの非blocking化、backfill期限、合成DB suiteの必須CI化）
- 対応: try-lock、期限付きnon-upsert backfill、CI時の合成DB自動実行、決定的な競合fixtureを追加

## セキュリティ・プライバシー考慮

合成データだけを使い、識別子をmetrics/logへ出さない。

## 参考

- GitHub Issue #323
- `docs/runbooks/confirmed-unlinked-image-cleanup.md`
