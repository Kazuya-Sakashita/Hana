---
id: ISSUE-121
title: ホームとアルバムの役割を整理し、最新ページの重複表示を減らす
priority: P1
status: done
size: S
created_at: 2026-07-29
github_issue: 264
release_gate: mvp_quality
blocked_by: []
requires_human_review:
  - product
  - accessibility
  - visual_design
---

# ISSUE-121: ホームとアルバムの役割を整理し、最新ページの重複表示を減らす

## 目的 (Why)

ホームを「今、記録する場所」、アルバムを「これまでを見返す場所」として整理し、同じ最新記録の重複表示による水増し感をなくす。

## スコープ (What)

- ホームには最新記録を1件だけ大きく表示する
- ホームの横スクロール棚を、総ページ数付きのコンパクトなアルバム導線へ置き換える
- アルバムのfeatured表示を削除し、月別の時系列一覧を最初の主要コンテンツにする
- 0件、1件、複数件で重複や不自然な空白がないことをテストする
- ホーム0件時は記録開始に判断を絞り、アルバム移動はBottomNavに委ねる

## やらないこと (Out of Scope)

- API・OpenAPI・データ取得契約の変更
- 月別ふりかえり機能の再設計
- 記録詳細画面の変更
- 検索、タグ、AIハイライトの追加

## 影響範囲

- `src/app/page.tsx`
- `src/app/album/page.tsx`
- ホーム・アルバムの回帰テスト

## 受け入れ条件 (Acceptance Criteria)

- [x] ホームでは最新記録を1件だけ表示し、横スクロール棚へ重複表示しない
- [x] ホームの主要な「記録する」導線を維持する
- [x] ホームから総ページ数を確認してアルバムへ移動できる
- [x] アルバムでは月別時系列一覧の各記録を1回だけ表示する
- [x] 0件は責めない空状態、1件と複数件は最新順を維持する
- [x] 記録詳細への遷移、BottomNav、画像のプライバシー制約を壊さない
- [x] 主要操作に44px以上のタップ領域、focus-visible、読み上げ可能な名前がある
- [x] 390px、430px、768pxで欠けや重なりがない

## セキュリティ・プライバシー考慮

- 画像URLの発行・認可・キャッシュ契約は変更しない
- テストとレビュー証跡には実写真、実タイトル、画像URL、`storage_key`、AI生成本文を含めない
- 最新記録は既存の本人所有・未削除条件を通したquery結果だけを表示する

## 検証

- [x] 0件、1件、複数件のfocused tests（10 files / 42 tests）
- [x] Product UX / Visual Design / Accessibilityレビュー（第3巡で全員承認）
- [x] 390px、430px、768pxのread-only responsive fixture / QA contract
- [x] `git diff --check`
- [x] `pnpm pr:gate`（110 files / 857 tests、production build）

## 専門レビュー

- Product UX: 第3巡で承認
- Visual Design: 第3巡で承認
- Accessibility: 第3巡で承認
