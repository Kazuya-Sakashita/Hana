---
id: ISSUE-141
title: 未confirm画像を期限後に安全に清掃する
priority: P1
status: done
size: M
created_at: 2026-07-31
github_issue: 300
release_gate: privacy_operations
requires_human_review:
  - privacy
  - operations
---

# ISSUE-141: 未confirm画像を期限後に安全に清掃する

## 目的 (Why)

signed upload後にconfirmされなかった写真を、確定済み画像や処理中のconfirmに触れず回収する。

## 受け入れ条件 (Acceptance Criteria)

- [x] 保持期間と対象判定を文書化する
- [x] confirm済みImageと利用中variantを削除しない
- [x] user prefixとobject時刻を検証して期限超過だけを削除する
- [x] dry-runで件数のみ確認できる
- [x] 部分失敗を再試行できる
- [x] 同時confirmとの競合で誤削除しない
- [x] cron smokeとredacted metricsがある

## 設計

- signed URL発行前に`UploadReservation`を作成する
- signed URL期限2時間に対し、cleanup保持期間は48時間とする
- confirmとcleanupは同じstorage key advisory lockを取得する
- cleanupはlock取得後にImage行、予約期限、Storage更新時刻を再確認する
- original、thumbnail、previewの既知3 keyだけを同一処理で削除し、削除後に残存確認する
- ログとresponseは固定状態別の件数だけとし、user ID、hash、key、URLを含めない

## Human gate

- Privacy: 48時間保持、対象3 key、件数限定metricsを承認する
- Operations: staging合成objectでdry-run → apply → 冪等再実行を確認する
- 実ユーザーのobjectを手動で作成、複製、削除しない

## 検証結果

- unit/integration: 42 focused tests pass
- full Vitest: 138 files / 1060 tests pass
- actual PostgreSQL 16: confirm先行、cleanup先行、別key非干渉、lock timeout、退会先行、cleanupのProfile lock先行の6ケースpass
- migration deploy: synthetic local `hana_ci`で全migration適用pass
- actual cleanup route + Storage HTTP contract: dry-runで削除0、applyで未confirmの既知3 objectだけ削除、confirm済み3 object存続、再実行`deleted: 0`を確認
- synthetic gate: 明示opt-in、loopback DB / Storage、専用DB名`hana_ci`以外は実行前に拒否
- legacy cursor: 1001 object、121 month folderを複数runで継続できることを確認
- 実ユーザー、実Storage、実写真は未使用
