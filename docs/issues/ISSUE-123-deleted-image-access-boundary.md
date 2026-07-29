---
id: ISSUE-123
title: 削除済み記録の画像アクセスとAI再送信を遮断する
priority: P0
status: review
size: M
created_at: 2026-07-29
github_issue: 269
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - privacy
  - security
  - reliability
---

# ISSUE-123: 削除済み記録の画像アクセスとAI再送信を遮断する

## 目的 (Why)

記録の論理削除後に関連写真を再取得したり外部AIへ再送信したりできないよう、MemoryとImageの削除境界を一貫させる。

## スコープ (What)

- 記録と関連画像を同じ時刻・同じDBトランザクションで論理削除する
- signed URL発行時に画像と親記録の削除状態を確認する
- AI画像準備時と外部送信直前に画像と親記録の削除状態を確認する
- 未紐付け画像と他記録の画像を削除対象外にする
- 本人所有条件と削除競合を統合テストで固定する

## やらないこと (Out of Scope)

- 30日後の物理削除ジョブ
- 復元UI
- Storage lifecycle設定
- APIレスポンス形式の変更

## 影響範囲

- `DELETE /v1/memories/{memoryId}`
- `GET /v1/uploads/{imageId}/url`
- `POST /v1/ai/generate`
- 画像利用可否の共通server predicate
- memories / uploads / AIの統合テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] 記録削除と関連画像の論理削除が同一トランザクションで完了する
- [x] 削除後の関連画像へsigned URLを発行しない
- [x] 削除後の関連画像を外部AIへ送信しない
- [x] AI画像準備中に削除された場合も外部AIへ送信しない
- [x] 未紐付け画像と他記録の画像には影響しない
- [x] 本人所有条件と削除前後の統合テストがある
- [x] 写真URL、storage_key、本文をログや証跡へ残さない

## セキュリティ・プライバシー考慮

- 画像利用条件は`Image.deletedAt IS NULL`に加え、未紐付けまたは親Memoryが未削除であることを要求する
- AI送信直前に本人所有を含めて再検証し、削除との競合をfail closedにする
- Storageエラーは固定reasonだけをログへ出し、locatorやURLを出力しない
- テストは合成IDと固定状態だけを使い、写真や生成本文を証跡へ含めない

## 検証

- [x] memories / uploads URL / AI generate focused tests
- [x] Privacy / Security / Reliability専門レビュー
- [x] `git diff --check`
- [x] `pnpm pr:gate`

## 専門レビュー記録

### Round 1

- Privacy / Security: AI再検証後とsigned URL照会後のTOCTOU、親Memory所有者不整合を指摘
- Database / Reliability: 二重DELETEのtimestamp上書き、rollback・非影響テスト不足を指摘
- AI Safety / Test Architecture: vendor呼び出し中の削除競合と状態matrix不足を指摘
- 対応:
  - signed URL、AI送信、Memory削除で共通の画像単位transaction advisory lockを導入
  - AI vendor呼び出し完了までlock transactionを保持し、削除commitとの順序を確定
  - Memoryは`deletedAt: null`条件の`updateMany`で一度だけ削除し、二重DELETEでtimestampを上書きしない
  - signed URL predicateへ本人と親Memoryの所有者条件を追加
  - rollback model、二重DELETE、lock順序、vendor完了までのtransaction保持テストを追加
  - ADR-0010とsecurity-and-privacy正本を新しい削除契約へ更新
- 判定: REQUEST_CHANGES、Round 2で再確認する

### Round 2

- Privacy / Security: AI SDKの既定timeout・retryが画像lock transactionより長く、外部送信がlock解放後も継続し得る点を指摘
- Database / Reliability: signed URL transactionの期限未指定、lock待機前に削除時刻を生成する点、vendor成功後のtransaction失敗でquota予約が消える点を指摘
- Test Architecture: 他人画像の404境界、署名完了までのtransaction保持、実PostgreSQL競合検証が不足している点を指摘
- 対応:
  - Anthropic SDKのtransport retryを0回、timeoutを25秒に固定し、route全体で共有するAbortSignalを導入
  - AI vendor期限を25秒、画像lock transactionを30秒に設定
  - quota予約を画像初期検証・AI同意再確認後、画像lock transactionより前の独立transactionでcommit
  - signed URL生成を8秒、画像lock transactionを10秒に設定し、期限超過URLを返さない
  - 削除timestampを画像lock取得後に生成
  - 他人画像を存在秘匿の404へ固定し、AI・署名URLの期限、transaction保持、非影響状態テストを追加
  - GitHub ActionsのPostgreSQL serviceでlock待機、削除後利用不可、同一timestamp、関連外非影響を検証
- 判定: REQUEST_CHANGES、Round 3で最終確認する

### Round 3

- Privacy / Security:
  - signed URLの`Promise.race`だけでは期限後もStorage処理が継続し、original fallbackが削除後に始まり得る点を指摘
  - Storage SDKの外部エラー文字列をログへ出している点を指摘
- Database / Reliability:
  - DELETE transactionの期限未指定により、正常なAI処理との競合で5秒後に失敗する点を指摘
  - 画像lock transaction内から独立quota transaction用の接続を待つpool枯渇リスクを指摘
  - 実PostgreSQL QAにアクセス先行時のDELETE待機方向と実rollbackがない点を指摘
- Test Architecture / API Behavior:
  - foreign imageの404、transaction保持、期限、非影響、CI実DB検証を確認しAPPROVE
- 対応:
  - abort対応のSupabase Admin clientを署名処理へ渡し、8秒期限時にStorage requestを中断
  - 署名primary完了後・fallback前後でAbortSignalを再確認し、期限後のfallback開始とURL返却を禁止
  - Storageエラーログを`storage_sign_failed`固定reasonへ変更し、外部エラー文字列非出力テストを追加
  - DELETEへ`maxWait: 5s / timeout: 35s`とRoute 60秒上限を設定
  - quota予約を画像lock transaction前へ移し、2本のDB connectionを同時保持しない構造へ変更
  - quota予約後の画像削除はvendor送信前のlock・再検証で遮断し、保守的なquota消費をADRへ明記
  - 実PostgreSQL QAへアクセス先行時のDELETE待機と、Image更新失敗後のMemory/Image rollbackを追加
- 再検証:
  - focused tests: 5ファイル / 78件成功
  - 実PostgreSQL migration・双方向lock競合・rollback QA成功
  - `pnpm typecheck`、`git diff --check`成功
- 最終確認:
  - Privacy / Security: APPROVE
  - Database / Reliability: APPROVE
  - Test Architecture / API Behavior: APPROVE
  - focused tests: 5ファイル / 78件成功
  - 全体tests: 116ファイル / 919件成功
  - production build成功
  - 実PostgreSQL migration・双方向lock競合・rollback QA成功
- 判定: APPROVE
