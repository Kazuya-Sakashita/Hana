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

## スコープ (What)

- Imageへoriginal、thumbnail、previewと修復処理の状態を追加する
- 欠損variantだけを再生成する保護済み内部cronを追加する
- retry、backoff、dead letter、削除競合、一覧・詳細fallbackを検証する

## やらないこと (Out of Scope)

- 欠損・不正なoriginalを推測で再生成しない
- 実ユーザーの画像をQA目的で作成、複製、削除しない
- 修復endpointを公開OpenAPIへ追加しない

## 影響範囲

- Prisma Image schemaとmigration
- upload confirm、signed URL、アルバム一覧、記録詳細
- internal repair route、scheduled workflow、Storage variant生成
- 合成DB / Storage QAと運用Runbook

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
- push済みのschema追加migrationは変更せず、既存サニタイズ済みoriginalの`ready`化はforward-only migrationで実施
- claim、Storage処理、失敗記録を分離し、timeout時もbackoffを永続化
- 欠損variantだけをupsertし、成功後にStorage上の存在を再確認
- `complete`も24時間ごとに再検証し、後から生じたStorage欠損を自動検出
- confirmと同じstorage-key lockを先に取得し、reservation中・未サニタイズ画像を延期
- 10回失敗でdead letter、最大24時間の指数バックオフ
- `CRON_SECRET` とサーバー側apply設定で保護した件数のみ返す内部エンドポイント
- サニタイズ済みかつ状態が`ready`のoriginalだけを一覧・詳細のfallbackに使う安全ガード
- 定期workflowと運用・ステージング確認Runbook

## セキュリティ・プライバシー考慮

- internal routeは`CRON_SECRET`でfail closedにし、applyは別の明示設定を必要とする
- response、ログ、レビュー証跡は固定状態の件数だけとし、画像ID、URL、`storage_key`、画像内容を含めない
- originalはサニタイズ済みかつ修復状態が`ready`の場合だけfallbackを許可する
- 実データを使わず、loopback Storageと専用DB `/hana_ci`以外では合成QAを停止する

## 検証

- `pnpm pr:gate`: PASS（152 files / 1184 tests、11 skipped、build含む）
- `pnpm qa:issue142:variant-repair-db`: PASS（ローカル合成PostgreSQL、7 tests）
  - Storage一時障害後の回復
  - transaction timeout後のbackoff永続化
  - stale claimのlease回収
  - 修復先行・削除先行の競合
  - confirmとrepairのstorage-key lock直列化
  - `complete`の期限到来選択と、24時間後までの再選択除外
- actual repair route + Storage HTTP contract: dry-run変更なし、欠損thumbnailだけを修復、originalと既存preview不変、再実行対象0件
- synthetic gate: 明示opt-in、loopback DB / Storage、専用DB名`hana_ci`以外は実行前に拒否
- Reliability / Image Pipeline / Security / UX専門レビュー: APPROVE（マージ阻害事項なし）
- 実ユーザー、実Storage、実写真は未使用

## 人による確認

`docs/runbooks/image-variant-repair.md` の隔離ステージング、または検証専用プロジェクトがない間のローカル合成Storage代替手順を使う。
Privacy と Image Pipeline の承認後に限り、デプロイ環境へ
`IMAGE_VARIANT_REPAIR_APPLY=confirmed` を設定する。実ユーザーデータは確認に使用しない。

## 参考

- `docs/runbooks/image-variant-repair.md`
- `docs/adr/0007-authz-at-route-handler-layer.md`
- `docs/adr/0009-image-storage.md`
- `docs/api-driven-development/security-and-privacy.md`
