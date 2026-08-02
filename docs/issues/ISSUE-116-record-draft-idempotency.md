---
id: ISSUE-116
title: 記録下書きのタブ内保全と保存API冪等化を実装する
priority: P0
status: done
size: M
created_at: 2026-07-28
github_issue: 251
blocked_by:
  - ISSUE-115
requires_human_review:
  - privacy
  - security
  - reliability
---

# ISSUE-116: 記録下書きのタブ内保全と保存API冪等化を実装する

## 目的 (Why)

再読み込みや保存応答の喪失が起きても、入力を失わず、同じ記録を重複作成せずに保存結果へ収束できるようにする。

## スコープ (What)

- 現在のユーザーIDに結び付けて、タイトル、本文、親のひとこと、日付、天気、確認済み画像ID、AI生成由来を24時間TTLで`sessionStorage`に退避する
- 下書きと同じタブ内で冪等キーを保持する
- `POST /memories`へ必須`Idempotency-Key`ヘッダーを追加する
- 同じユーザー・キー・内容の再送は既存Memoryを200で返す
- 同じユーザー・キーを異なる内容で再利用した場合は409 `memory_idempotency_conflict`を返す
- 保存成功、明示破棄、サインアウト、期限切れで下書きを消去する

## やらないこと (Out of Scope)

- クロスデバイス同期、複数下書き一覧、オフライン送信キュー
- 写真blob、画像URL、presigned URL、`storage_key`、AI promptのブラウザ保存
- 既存Memoryの編集APIへの冪等キー追加

## 受け入れ条件 (Acceptance Criteria)

- [x] 同じタブの再読み込み後に期限内の下書きを復元できる
- [x] 写真本体、署名URL、`storage_key`、AI promptをブラウザ保存しない
- [x] 保存成功、明示破棄、サインアウト、期限切れで下書きが消去される
- [x] 保存応答喪失後の同一リクエスト再送でMemoryが重複しない
- [x] 同じ冪等キーを異なる内容で再利用すると安定したProblem Details reasonで拒否される
- [x] 別ユーザーの冪等キーやMemoryを利用できないことを認可テストで確認する

## セキュリティ・プライバシー考慮

- `sessionStorage`へ書くキーを許可リストで組み立て、未知フィールドを復元しない
- 保存した所有者IDが現在のユーザーIDと異なる場合は、画面へ復元する前に下書きを消去する
- 冪等キーはユーザー単位で一意にし、APIレスポンスやログへ出力しない
- 本文ハッシュ等の派生PIIはDBへ追加せず、既存Memoryの所有者スコープ内比較で同一性を判定する
- テスト証跡には合成IDと固定文言だけを使う

## 検証

- [x] OpenAPI lint / 型生成 / route map
- [x] Prisma schema / migration / client生成
- [x] 同内容再送 / 異内容競合 / 並行再送 / 別ユーザー認可の結合テスト
- [x] 下書き許可リスト / TTL / 復元 / 消去の単体・画面契約テスト
- [x] Privacy / Security / Reliability専門レビュー
- [x] `pnpm pr:gate`
- [x] `git diff --check`

## 専門レビュー記録

- Round 1: Privacy/Security、DB/API Reliability、Product UX/A11yの3名がHOLD。所有者分離、画像紐付け競合、表示順永続化、409再試行、写真差し替え時の入力保持、破棄・復元文言を修正
- Round 2: Privacy/SecurityとDB/API ReliabilityはGO。UX/A11yが409後のフォーカス復元をHOLD
- Round 3: 409通知を画面内alertへ一本化し、再試行可能な保存ボタンへフォーカスを戻してUX/A11yもGO
- 残余リスク: 実PostgreSQLでの並行送信と、実ブラウザでの409フォーカス復元は正式公開前の統合QAで再確認する

## 参考

- GitHub Issue #251
- `Hana_PRD_v1.md` の30秒記録フロー
- `docs/openapi/openapi.yaml` の`POST /memories`
