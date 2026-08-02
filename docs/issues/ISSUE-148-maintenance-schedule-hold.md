---
id: ISSUE-148
title: 未構成環境のmaintenance scheduleを明示的にHOLDする
priority: P0
status: done
size: S
created_at: 2026-08-03
github_issue: 318
release_gate: maintenance_operations
requires_human_review:
  - reliability
  - operations
---

# ISSUE-148: 未構成環境のmaintenance scheduleを明示的にHOLDする

## 目的 (Why)

公開先が未構成の期間に定期workflowを失敗させ続けず、明示的な有効化まではendpointを呼ばない。

## スコープ (What)

- 画像maintenance scheduleの共通activation flag
- 手動実行時の明示的なinvoke選択
- YAML contract test
- ISSUE-105完了後の有効化・停止runbook

## やらないこと (Out of Scope)

- ISSUE-105のHOLD解除
- GitHub Actions secretやrepository variableの実設定
- internal endpoint、DB、Storage、画像データの変更
- 各maintenance処理のapply設定変更

## 影響範囲

- 未confirm画像cleanup workflow
- confirm済み未紐付け画像cleanup workflow
- 画像variant修復workflow
- maintenance運用runbookとworkflow契約テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] activation flagが未設定または無効なら、schedule実行はendpointを呼ばずneutral successで終了する
- [x] 手動実行は明示的な確認入力を要求し、必要なURLまたはsecretがなければfail-closedになる
- [x] disabled、enabled、設定欠落の各状態をworkflow contract testで検証する
- [x] ログとsummaryへURL、secret、画像識別子を出さない
- [x] ISSUE-105完了後の有効化手順と停止手順をrunbookへ記録する

## セキュリティ・プライバシー考慮

HOLD jobはendpoint設定を参照しない。invoke jobもsecret値を出力せず、設定欠落時はrequest前に停止する。実環境、実ユーザー、実写真を検証に使用しない。

## 検証結果

- `pnpm qa:issue148:maintenance-workflows`: PASS（12 tests）
- `pnpm pr:gate`: PASS（156 test files / 1226 tests、12 skipped、build含む）
- `git diff --check`: PASS
- 実環境、endpoint、secret、DB、Storageへの接続・変更なし

## 参考

- GitHub Issue #318
- GitHub Issue #234 / ISSUE-105
- `docs/runbooks/maintenance-schedule-activation.md`
