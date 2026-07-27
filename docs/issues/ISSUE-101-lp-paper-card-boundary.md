---
id: ISSUE-101
title: LP の紙片と card 境界を Quiet Heirloom に寄せる
priority: P2
status: review
size: S
created_at: 2026-07-27
github_issue: 226
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-101: LP の紙片と card 境界を Quiet Heirloom に寄せる

## 目的 (Why)

LP-P2-02 として、公開 `/lp` の一部 surface が整った card UI に見える状態を、Hana の Quiet Heirloom らしい photo mat / paper slip の質感へ寄せる。通常 surface は強い elevation ではなく、hairline、余白、薄い内側 highlight で区切る。

## スコープ (What)

- LP 専用 `lp-paper-surface` / `lp-paper-slip` / `lp-paper-link` / `lp-paper-field` / `lp-paper-divider` primitive を追加する
- `/lp` hero、value、trust、waitlist 周辺の paper slip / photo mat 境界を揃える
- Waitlist form 内の補助 surface と入力 field を紙片寄りにする
- LP 評価表で `LP-P2-02` を ISSUE-101 対応済みとして記録する
- 関連 unit contract と public QA を更新・確認する

## やらないこと (Out of Scope)

- 待機リスト API / DB / OpenAPI contract の変更
- public trust copy の意味変更
- privacy / legal claim の追加
- 実ユーザー写真、画像 URL、`storage_key`、AI 生成本文の追加

## 影響範囲

- `src/app/globals.css`
- `src/app/lp/page.tsx`
- `src/components/waitlist-signup-form.tsx`
- `docs/design/current-lp-evaluation.md`
- `docs/issues/README.md`
- `tests/unit/app/lp-paper-card-boundary.test.ts`
- `tests/unit/app/lp-soft-keepsake-corners.test.ts`
- `tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts`
- `tests/unit/app/lp-evaluation-status-sync.test.ts`
- `tests/unit/app/lp-public-keepsake-asset.test.ts`
- `tests/unit/app/waitlist-release-readiness.test.ts`
- `tests/unit/app/quiet-heirloom-refinement-contract.test.ts`

## 受け入れ条件 (Acceptance Criteria)

- [x] `LP-P2-02` が ISSUE-101 対応済みとして記録されている
- [x] 通常 surface は強い shadow ではなく hairline / 余白 / 内側 highlight で区切られている
- [x] photo mat / paper slip / pill の役割が LP 専用 primitive と test で固定されている
- [x] public trust copy、API、保存処理、ログ出力は変更していない
- [x] 関連テスト、public QA、`pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- visual surface の調整のみで、メール保存、AI 同意、privacy copy の意味は変更しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文を扱わない
- AI 学習、保持期間、完全削除、配信基盤確定などの未確認 claim を追加しない

## 検証

- [x] `pnpm exec vitest run tests/unit/app/lp-paper-card-boundary.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts tests/unit/app/lp-evaluation-status-sync.test.ts tests/unit/app/lp-public-keepsake-asset.test.ts tests/unit/app/waitlist-release-readiness.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- [x] `pnpm qa:issue075:lp-public -- --mode=contract`
- [x] `pnpm pr:gate`
