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
- 公開前に既存の合成QA画像を削除または再投入したことのPrivacy確認

## やらないこと (Out of Scope)

- 複数instance間の画像処理lease（ISSUE-142の状態管理設計で扱う）
- variant欠損の自動修復（ISSUE-142）
- 公開後の利用者画像を対象にしたbackfill（Hanaは現在公開前traffic HOLD）

## 受け入れ条件 (Acceptance Criteria)

- [x] JPEG、PNG、WebPを安全に再エンコードする
- [x] orientationを反映しEXIF・GPS・端末情報を除去する
- [x] originalのsigned URL取得物にもmetadataが残らない
- [x] 置換失敗時にImageを確定しない
- [x] 画質、寸法、容量上限を文書化する
- [x] EXIF/GPS入りfixtureのテストがある
- [x] metadata値やstorage keyをログへ出さない
- [ ] 既存の合成QA画像を公開前に削除または再投入したことをPrivacy担当者が確認する

## Blocked by

None - can start immediately.

## 検証結果

- focused tests: 2 files / 50 tests
- full tests: 130 files / 1015 tests
- `pnpm typecheck`
- `pnpm lint`
- `pnpm build:ci`
- `git diff --check`
- Privacy / Image Pipeline / Reliability 再レビュー: コード上のブロッカーなし
