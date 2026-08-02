---
id: ISSUE-114
title: 写真アップロードを段階別に再試行できるようにする
priority: P0
status: done
size: M
created_at: 2026-07-28
github_issue: 249
blocked_by:
  - ISSUE-113
requires_human_review:
  - security
  - product
  - accessibility
---

# ISSUE-114: 写真アップロードを段階別に再試行できるようにする

## 目的 (Why)

モバイル回線が一時的に切れても同じ写真を選び直さず、失敗した段階から30秒記録フローを再開できるようにする。

## スコープ (What)

- 選択済みファイルと再エンコード結果をタブ内メモリに保持する
- prepare / PUT / confirmの失敗段階を区別する
- PUT失敗は新しい一回限りのupload targetを発行し、同じ再エンコード済みデータをPUTする
- confirm失敗は画像本体を再送せずconfirmから再試行する
- confirmは同じ`storage_key`で既存Imageへ収束する冪等契約にする
- 写真変更時は旧処理をabortし、世代IDが古い応答を無視する
- refによる同期ガードで再試行の多重タップを防ぐ

## やらないこと (Out of Scope)

- タブ終了後の再開、バックグラウンドアップロード、オフラインキュー
- 孤立画像の定期削除
- Storage bucket構成とDB schemaの変更

## 受け入れ条件 (Acceptance Criteria)

- [x] PUT失敗時に写真を選び直さず、同じ写真で再試行できる
- [x] confirm失敗時に画像本体を再送信せず、confirmから再試行できる
- [x] 写真変更後に旧リクエストの結果が画面へ反映されない
- [x] 再試行中の多重タップで処理が重複しない
- [x] 失敗段階と次の操作が色だけに依存せず伝わる
- [x] ログへ画像URL、presigned URL、`storage_key`、写真メタデータを出力しない

## セキュリティ・プライバシー考慮

- 再エンコード結果とupload targetはReact stateや永続領域ではなくrefに保持する
- 成功時と写真変更時にupload cacheを破棄する
- ログへ画像URL、presigned URL、`storage_key`、写真メタデータを出力しない
- テストはopaqueな合成targetだけを使い、実写真・URL・保存キーを証跡に残さない

## 検証

- [x] 合成PUT失敗 / confirm再試行 / 遅延応答テスト
- [x] 多重タップ / abort / 世代ID契約テスト
- [x] Security / Product-UX / Accessibility専門レビュー
- [x] `pnpm pr:gate`（99 files / 790 tests、build成功）
- [x] `git diff --check`

## 専門レビュー

- Round 1:
  - Security: GO
  - Product-UX / Accessibility: GO
  - Reliability: HOLD（PUT失敗時の旧target再利用、confirmの非冪等性、upload中の写真変更導線）
- Round 2:
  - Reliability: GO（新target再発行、confirm冪等化、Abort + 世代IDを確認）
  - Security: HOLD（外部サービスの生エラー文言をログへ出力）
- Round 3:
  - Security: GO（固定reasonのみを記録するruntimeテストを確認）
- 最終判定: 3領域ともマージ阻害なし

## 参考

- GitHub Issue #249
- `Hana_PRD_v1.md` の30秒記録フロー
- `docs/openapi/openapi.yaml` のupload endpoints
