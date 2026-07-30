---
id: ISSUE-137
title: confirm時に原画像を再エンコードしてEXIFを除去する
priority: P0
status: review
size: M
created_at: 2026-07-31
github_issue: 296
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - privacy
  - image_security
---

# ISSUE-137: confirm時に原画像を再エンコードしてEXIFを除去する

## 目的 (Why)

private Storageの原画像やsigned originalへGPS・端末名・撮影時刻が残ることを防ぐ。

## スコープ (What)

- confirm時のサーバー側再エンコード
- orientation反映とmetadata除去
- 安全なoriginal置換
- EXIF/GPS fixtureによる回帰テスト
- サーバー側の除去完了状態をDBに記録
- 未処理originalのsigned URL発行停止
- 既存の有効画像を対象にした冪等なdry-run/apply backfill

## やらないこと (Out of Scope)

- 複数instance間の画像処理lease（ISSUE-142の状態管理設計で扱う）
- variant欠損の自動修復（ISSUE-142）

## 受け入れ条件 (Acceptance Criteria)

- [x] JPEG、PNG、WebPを安全に再エンコードする
- [x] orientationを反映しEXIF・GPS・端末情報を除去する
- [x] originalのsigned URL取得物にもmetadataが残らない
- [x] 置換失敗時にImageを確定しない
- [x] 画質、寸法、容量上限を文書化する
- [x] EXIF/GPS入りfixtureのテストがある
- [x] metadata値やstorage keyをログへ出さない
- [x] 未処理の既存originalにはsigned URLを発行しない
- [x] 識別子を出力せず既存の有効画像件数をdry-runできる
- [x] 明示的なapply指定で既存の有効画像を冪等に再処理できる
- [ ] DB migration適用後のdry-run件数を確認する
- [ ] Privacy担当者が実ユーザー画像へのapplyを承認し、完了を確認する

## Blocked by

None - can start immediately.

## 検証結果

- full tests: 132 files / 1028 tests
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build:ci`
- `git diff --check`
- `pnpm pr:gate`
- Privacy / Image Pipeline / Reliability 再レビュー: コード上のブロッカーなし
- dry-run: DB migration未適用のため対象件数取得前に安全停止（画像変更なし）
