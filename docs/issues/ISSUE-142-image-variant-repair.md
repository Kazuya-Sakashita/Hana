---
id: ISSUE-142
title: 欠損画像variantを自動修復する
priority: P1
status: review
size: M
created_at: 2026-07-31
github_issue: 301
release_gate: image_reliability
requires_human_review:
  - reliability
  - image_pipeline
---

# ISSUE-142: 欠損画像variantを自動修復する

## 目的 (Why)

一時的なvariant生成・Storage障害を恒久的なoriginal fallbackにせず、自動回復させる。

## 受け入れ条件 (Acceptance Criteria)

- [x] original、thumbnail、previewの生成状態を追跡できる
- [x] 欠損variantだけを冪等に再生成する
- [x] 指数バックオフ、最大試行、dead-letter相当の運用確認がある
- [x] original欠損や形式不正は安全に失敗する
- [x] 一時Storage障害後に自動回復する統合テストがある
- [x] 一覧表示は修復中も安全なfallbackを維持する
- [x] storage keyや画像URLをログへ出さない

## 実装

- 3種類の画像状態、修復状態、試行回数、次回時刻、claim tokenをImageへ追加
- claim、Storage処理、失敗記録を分離し、timeout時もbackoffを永続化
- 欠損variantだけをupsertし、成功後にStorage上の存在を再確認
- 10回失敗でdead letter、最大24時間の指数バックオフ
- `CRON_SECRET` とサーバー側apply設定で保護した件数のみ返す内部エンドポイント
- 未サニタイズoriginalを一覧・詳細のfallbackに使わない安全ガード
- 定期workflowと運用・ステージング確認Runbook

## 検証

- `pnpm pr:gate`: PASS（139 files / 1067 tests、build含む）
- `pnpm qa:issue142:variant-repair-db`: PASS（ローカル合成PostgreSQL、5 tests）
  - Storage一時障害後の回復
  - transaction timeout後のbackoff永続化
  - stale claimのlease回収
  - 修復先行・削除先行の競合
- Reliability / Image Pipeline / Security / UX専門レビュー: APPROVE（マージ阻害事項なし）

## 人による確認

`docs/runbooks/image-variant-repair.md` のステージング手順を、専用QAアカウントと合成画像だけで実施する。
Privacy と Image Pipeline の承認後に限り、デプロイ環境へ
`IMAGE_VARIANT_REPAIR_APPLY=confirmed` を設定する。実ユーザーデータは確認に使用しない。
