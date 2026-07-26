---
id: ISSUE-095
title: LP の表記ゆれと artifact 文言を整える
priority: P1
status: done
size: S
created_at: 2026-07-27
github_issue: 214
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-095: LP の表記ゆれと artifact 文言を整える

## 目的 (Why)

公開前検証 LP の visible copy から表記ゆれと内部レビュー寄りの artifact 文言を減らし、Quiet Heirloom の落ち着いた公開画面として読める状態にする。

## スコープ (What)

- `/lp` の visible copy で `1まい` / `1枚` の表記を整理する
- `/lp` の meta label から prototype / synthetic preview 感の強い英語表現を減らす
- 実ユーザー写真を使っていない disclosure は、日本語の公開向け表現で維持する
- current LP evaluation と Issue Index を同期する
- focused test を更新する

## やらないこと (Out of Scope)

- 画像 asset 自体は差し替えない
- privacy/legal claim を追加で断定しない
- API / DB / OpenAPI contract は変更しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文は扱わない

## 影響範囲

- `src/app/lp/page.tsx`
- `src/app/lp/loading.tsx`
- `tests/unit/app/lp-public-copy-polish.test.ts`
- `tests/unit/app/prelaunch-lp-route.test.ts`
- `tests/unit/app/lp-soft-keepsake-corners.test.ts`
- `docs/design/current-lp-evaluation.md`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] `/lp` visible copy に `1まい` が残っていない
- [x] `/lp` visible copy に `synthetic preview` が残っていない
- [x] 実ユーザー写真を使っていないことは公開向け日本語で維持されている
- [x] unsafe claim guard と public QA gate が通る
- [x] `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- 合成イメージの disclosure は残し、実ユーザー写真ではないことを公開向け日本語で示す
- AI 学習、保持期間、完全削除、配信基盤確定などの未確認 claim を追加しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文を扱わない

## 検証

- [x] `pnpm exec vitest run tests/unit/app/lp-public-copy-polish.test.ts tests/unit/app/prelaunch-lp-route.test.ts tests/unit/app/lp-soft-keepsake-corners.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts`
- [x] `pnpm qa:issue075:lp-public -- --mode=contract`
- [x] `pnpm pr:gate`
