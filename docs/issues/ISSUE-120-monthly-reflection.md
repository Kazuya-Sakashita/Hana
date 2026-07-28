---
id: ISSUE-120
title: 月別ふりかえりの最小体験を実装する
priority: P0
status: review
size: M
created_at: 2026-07-28
github_issue: 255
release_gate: mvp_core
blocked_by: []
requires_human_review:
  - product
  - accessibility
---

# ISSUE-120: 月別ふりかえりの最小体験を実装する

## 目的 (Why)

記録を件数の蓄積だけでなく、「この月に過ごした時間」のまとまりとして静かに見返せるようにする。

## スコープ (What)

- 記録一覧APIへ記録日の範囲指定と対象件数を追加する
- `/album?month=YYYY-MM` で対象月の記録を表示する
- 前月・翌月へ移動できる月ナビゲーションを追加する
- 対象月の月名、記録件数、記録カードを一貫して表示する
- 既存のカーソルページングを月指定と組み合わせる
- 記録がない月に責めない空状態を表示する

## やらないこと (Out of Scope)

- AI月間サマリー
- 月別通知
- カレンダー形式
- ハイライト自動選定
- 全文検索・タグ検索

## 影響範囲

- `docs/openapi/openapi.yaml`
- `docs/openapi/components/schemas/MemoryListResponse.yaml`
- `src/app/v1/memories/route.ts`
- `src/features/memories/server/`
- `src/features/memories/client/`
- `src/app/album/page.tsx`
- 関連するAPI・UIテスト

## 受け入れ条件 (Acceptance Criteria)

- [x] OpenAPIを先に更新し、指定月の本人所有・未削除記録だけを返す
- [x] 対象月の月名、記録件数、記録カードが一貫して表示される
- [x] 前月・翌月へ移動でき、未来月へは進めない
- [x] 月移動後も記録日降順とカーソルページングが維持される
- [x] 記録がない月でも空白日や未記録期間を責める文言を使わない
- [x] 他ユーザーの記録を取得できない認可テストと、キーボード操作の回帰テストがある

## セキュリティ・プライバシー考慮

- APIの所有者条件と論理削除条件を月範囲と同時に適用する
- ログ、fixture、PR証跡へ氏名、本文、画像URL、`storage_key`を追加しない
- 画像URLの発行は認可と月範囲の絞り込み後にだけ行う
- 件数は現在ユーザーと同じ月範囲条件で集計する

## 検証

- [x] `pnpm openapi:lint`
- [x] `pnpm openapi:gen`
- [x] 月境界、未来月、カーソルページング、認可のfocused tests
- [x] 月ナビゲーションのキーボード操作回帰テスト
- [x] `git diff --check`
- [x] `pnpm pr:gate`（89 files / 693 tests）

## 専門レビュー

- Product UX: 第2巡で承認
- Accessibility: 第2巡で承認
- Backend / API / Privacy: 第2巡で承認

## 参考

- GitHub Issue: #255
- `Hana_PRD_v1.md` の「月別ふりかえり」「タイムライン画面」「見返すフロー」
