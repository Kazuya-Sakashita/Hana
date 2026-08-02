---
id: ISSUE-115
title: AI生成に待機上限と回復導線を追加する
priority: P0
status: done
size: S
created_at: 2026-07-28
github_issue: 250
blocked_by:
  - ISSUE-114
requires_human_review:
  - privacy
  - product
  - accessibility
---

# ISSUE-115: AI生成に待機上限と回復導線を追加する

## 目的 (Why)

AI応答が戻らない場合も親を待たせ続けず、入力を失わずに再試行または手動入力へ切り替えられるようにする。

## スコープ (What)

- クライアント側のAI生成待機上限を30秒にする
- `AbortController`、実行ID、同期中ガードで生成処理を管理する
- タイムアウト後に再試行と手動入力を提示する
- 写真変更・画面離脱時に旧リクエストを中断し、遅延応答を無視する
- タイトル、本文、親のひとこと、日付、天気を失敗や再試行で保持する

## やらないこと (Out of Scope)

- AI事業者側の処理停止保証
- 再生成回数上限、AI品質フィルター、モデル切り替え
- サーバーAPI契約の変更

## 受け入れ条件 (Acceptance Criteria)

- [x] 規定時間を超えたAI通信が回復可能な失敗状態へ移る
- [x] タイムアウト後に「もう一度」と「AIを使わずに書く」を選べる
- [x] タイムアウトや再試行で入力済み内容が失われない
- [x] 同時に複数の生成リクエストを開始できない
- [x] 遅れて到着した古い生成結果が画面へ反映されない
- [x] 合成遅延・切断テストで再試行と手動入力経路を確認できる

## セキュリティ・プライバシー考慮

- timeout、abort、retryで親のひとことやAI生成本文をログへ出力しない
- リクエスト中断後も、入力内容はブラウザの永続領域へ保存しない
- 同意確認前にAI APIを呼ばない既存境界を維持する
- テスト証跡には合成状態と固定ラベルだけを使用する

## 検証

- [x] timeout / abort / 遅延応答 / 多重操作の単体テスト
- [x] 入力保持と手動入力導線の画面契約テスト
- [x] Privacy / Product-UX / Accessibility専門レビュー
- [x] Reduced Motion環境でも状態と回復手段が伝わる
- [x] `pnpm pr:gate`（101 files / 801 tests、build成功）
- [x] `git diff --check`

## 専門レビュー

- Round 1:
  - Privacy / Security: GO
  - Reliability / Concurrency: GO
  - Product-UX / Accessibility: HOLD（タイムアウト後に回復操作へフォーカスが戻らない）
- 修正:
  - タイムアウト描画後に回復用主ボタンへフォーカスを移すref/effectと回帰テストを追加
- Round 2:
  - Privacy / Security: GO
  - Reliability / Concurrency: GO
  - Product-UX / Accessibility: GO
- 最終判定: 3領域ともマージ阻害なし

## 参考

- GitHub Issue #250
- `Hana_PRD_v1.md` の30秒記録フロー
- ISSUE-114の非同期処理管理
