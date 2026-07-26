---
id: ISSUE-087
title: Home のアルバム棚を最新ページ込みの横スクロールに整える
priority: P1
status: done
size: M
created_at: 2026-07-26
github_issue: 194
blocked_by: []
external_blockers: []
requires_human_review:
  - design
  - accessibility
---

## 目的 (Why)

Home 画面の「アルバム / しまってある ページ」が、アルバムなのに最新ページが欠けて見える問題を解消する。
上部の大きいカードは「最近のページを大きく見る場所」、横スクロール棚は「アルバムの入口」として役割を分ける。

## スコープ (What)

- Home の横スクロール棚にも最新ページを含める
- 上部の「最近のページ」と横スクロール棚の役割が copy / visual で区別されるようにする
- 先頭カードに「最近」などの quiet label を置き、ランキングやフィード風に見えないようにする
- 390 / 430 / 768px で横スクロールの幅、余白、snap、focus-visible、tap target を維持する

## やらないこと (Out of Scope)

- Album 一覧ページの並び順変更
- 記録詳細や保存 API の変更
- 実写真 URL、`storage_key`、AI 生成本文、メールを含む fixture / QA 証跡の追加
- `ISSUE-075` の privacy / legal review gate の扱い変更

## 受け入れ条件 (Acceptance Criteria)

- [x] Home の横スクロール棚にも最新ページが含まれている
- [x] 上部の「最近のページ」と横スクロール棚の役割が copy / visual で区別されている
- [x] 「アルバムなのに最新がない」と感じにくい見出し・ラベルになっている
- [x] 先頭カードに「最近」などの quiet label があり、ランキングやフィード風に見えない
- [x] 横スクロールのカード幅、余白、snap、focus-visible が 390 / 430 / 768px で破綻しない
- [x] tap target は 44px 以上を維持する
- [x] 実写真 URL、`storage_key`、AI 生成本文、メールなどを QA 証跡やテスト fixture に含めない

## 検証

- `pnpm exec vitest run tests/unit/app/home-quiet-heirloom.test.ts tests/unit/app/home-photo-first-view-layout-fixtures.test.ts tests/unit/app/home-album-shelf-latest.test.ts`
- `pnpm qa:issue064:design-dom-smoke -- --mode=contract`
- `pnpm pr:gate`

### 2026-07-26 実装結果

- Home の横スクロール棚を `memories.slice(1)` から最新込みの `memories` に変更した
- 上部の大きいカードは「最近のページ」、棚は「最近のページたち」とし、棚側に「大きく見たページも、ここからまた開けます。」を追加した
- 棚の先頭カードに quiet label `最近` を追加し、ランキングや feed 風の copy は入れないままにした
- 最後のアルバム導線を `すべてのページを / ひらく` に変更し、1件だけの状態でも不自然にならないようにした

### 2026-07-26 検証結果

- `pnpm exec vitest run tests/unit/app/home-quiet-heirloom.test.ts tests/unit/app/home-photo-first-view-layout-fixtures.test.ts tests/unit/app/home-photo-first-view-refinement.test.ts tests/unit/app/home-album-shelf-latest.test.ts` pass (4 files / 17 tests)
- `pnpm qa:issue064:design-dom-smoke -- --mode=contract` pass
- `pnpm pr:gate` pass (format / lint / OpenAPI route-map / typecheck / 496 tests / ISSUE-064, ISSUE-075, ISSUE-082 contract QA / build:ci)

### 2026-07-26 専門レビュー結果

- Product UX / IA: Round 1 HOLD → 1件時の棚見出しを `アルバムのページ` に分岐 → Round 2 GO
- Visual Systems: GO。任意改善として全カードに quiet label 行の高さを予約し、Round 2 GO
- Frontend / A11y: GO。横スクロール、focus-visible、390 / 430 / 768px fixture、証跡安全に blocker なし

## 専門レビュー観点

| reviewer        | framework                  | 確認観点                                                       |
| --------------- | -------------------------- | -------------------------------------------------------------- |
| Product UX / IA | album mental model         | 最新が棚にもあることが自然に読め、重複に見えないか             |
| Visual Systems  | Quiet Heirloom shelf       | 先頭ラベル、紙面、snap、余白が feed / ranking 風に見えないか   |
| Frontend / A11y | responsive / focus / touch | 390 / 430 / 768px、44px target、focus-visible、overflow の維持 |
