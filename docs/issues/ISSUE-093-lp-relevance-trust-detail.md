---
id: ISSUE-093
title: LP の親 relevance と trust 詳細導線を強化する
priority: P1
status: review
size: S
created_at: 2026-07-27
github_issue: 210
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-093: LP の親 relevance と trust 詳細導線を強化する

## 目的 (Why)

公開前検証 LP の first view で、忙しくて書けない親が自分ごと化しやすい入口を増やし、待機リスト登録前に trust の詳細確認へ進める導線を明確にする。

## スコープ (What)

- LP hero に、寝かしつけ後・疲れている・でも忘れたくない文脈を短く補強する
- Trust セクションから privacy の具体項目へ進める内部導線を追加する
- Privacy ページの詳細項目に anchor を追加する
- 公開前検証 copy の安全側 boundary を維持する
- Issue Index と focused test を更新する

## やらないこと (Out of Scope)

- privacy/legal claim を追加で断定しない
- メール配信基盤のサービス名を明記しない
- API / DB / OpenAPI contract は変更しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文は扱わない

## 影響範囲

- `src/app/lp/page.tsx`
- `src/app/privacy/page.tsx`
- `tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts`
- `tests/unit/app/prelaunch-privacy-policy.test.ts`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] LP hero に、書けない親への relevance cue が表示される
- [x] LP trust から privacy の取得情報・利用目的・停止削除へ進める
- [x] Privacy details に安定 anchor がある
- [x] unsafe claim guard と public QA gate が通る
- [x] `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- 公開前検証 copy の人間レビュー済み boundary を維持する
- AI 学習、保持期間、完全削除、配信基盤確定などの未確認 claim を追加しない
- 実ユーザー情報、画像 URL、`storage_key`、AI 生成本文を扱わない

## 検証

- [x] `pnpm exec vitest run tests/unit/app/lp-keepsake-journey-trust-bridge.test.ts tests/unit/app/prelaunch-privacy-policy.test.ts tests/unit/app/lp-public-qa-trust-gate.test.ts`
- [x] `pnpm qa:issue075:lp-public -- --mode=contract`
- [x] `pnpm pr:gate`
