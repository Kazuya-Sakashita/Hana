---
id: ISSUE-099
title: LP 公開用 keepsake 画像 asset を追加する
priority: P1
status: review
size: S
created_at: 2026-07-27
github_issue: 222
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-099: LP 公開用 keepsake 画像 asset を追加する

## 目的 (Why)

LP-P1-04 では、既存 concept image を mood evidence として扱い、公開 LP には文字なし・実写真なし・Hana らしい photo mat / keepsake asset を用意する必要がある。公開前検証 LP の主要ビジュアルを、Quiet Heirloom の柔らかい実在感に寄せる。

## スコープ (What)

- 公開 LP 用の生成ビットマップ asset を `public/lp/` に追加する
- `/lp` の hero keepsake visual を新 asset へ差し替える
- 合成イメージであり実ユーザー写真ではない disclosure を維持する
- LP 評価表で `LP-P1-04` を ISSUE-099 対応済みとして記録する
- public LP QA contract と focused test を更新する

## やらないこと (Out of Scope)

- 待機リスト API / DB / OpenAPI contract の変更
- privacy / legal claim の追加
- 実ユーザー写真、実名、メール、画像 URL、`storage_key`、AI 生成本文の利用
- 画像内テキストや UI screenshot の追加

## 影響範囲

- `public/lp/hana-public-keepsake-still-life.webp`
- `src/app/lp/page.tsx`
- `scripts/qa/issue-075-lp-public-qa.cjs`
- `docs/design/current-lp-evaluation.md`
- `docs/issues/README.md`
- `tests/unit/app/lp-public-keepsake-asset.test.ts`
- `tests/unit/app/prelaunch-lp-route.test.ts`
- `tests/unit/app/waitlist-release-readiness.test.ts`
- `tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- `tests/unit/app/lp-evaluation-status-sync.test.ts`

## 受け入れ条件 (Acceptance Criteria)

- [x] 公開 LP で使用する生成ビットマップ asset が `public/lp/` に保存されている
- [x] asset は文字なし、人物なし、実ユーザー写真なし、画像 URL / `storage_key` なしで扱われている
- [x] `/lp` の主要ビジュアルが新しい public asset を参照している
- [x] 合成イメージであり実ユーザー写真ではない disclosure が維持されている
- [x] `LP-P1-04` が ISSUE-099 対応済みとして記録されている
- [x] 関連テストと `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- 生成ビットマップは公開 LP 用の合成 still-life asset で、人物・顔・実ユーザー写真を含めない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文を扱わない
- AI 学習、保持期間、完全削除、配信基盤確定などの未確認 claim を追加しない

## 検証

- [x] `pnpm exec vitest run tests/unit/app/lp-public-keepsake-asset.test.ts tests/unit/app/prelaunch-lp-route.test.ts tests/unit/app/waitlist-release-readiness.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts tests/unit/app/lp-evaluation-status-sync.test.ts`
- [x] `pnpm qa:issue075:lp-public -- --mode=contract`
- [x] `pnpm pr:gate`
