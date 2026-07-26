---
id: ISSUE-091
title: 待機リスト公開前 readiness gate を追加する
priority: P0
status: review
size: S
created_at: 2026-07-27
github_issue: 206
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-091: 待機リスト公開前 readiness gate を追加する

## 目的 (Why)

公開前検証 traffic を受ける前に、待機リスト登録の運用前提が PR gate で機械的に確認できる状態にする。

## スコープ (What)

- waitlist release readiness 用の contract QA script を追加する
- `pnpm pr:gate` に readiness contract を組み込む
- `WAITLIST_EMAIL_HASH_PEPPER` production 必須、`waitlist_signups` migration、rate limit、safe logging、公開 copy 境界を確認する
- 公開前検証の運用チェックリストを `docs/release/` に追加する
- `docs/issues/README.md` を同期する

## やらないこと (Out of Scope)

- 実際の production secret 値は確認・記録しない
- DB migration を実行しない
- UI / API / OpenAPI contract は変更しない
- メール配信基盤のサービス名は公開 copy に出さない

## 影響範囲

- `scripts/qa/issue-091-waitlist-readiness-contract.cjs`
- `docs/release/prelaunch-waitlist-readiness.md`
- `package.json`
- `tests/unit/app/waitlist-release-readiness.test.ts`
- `tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] readiness QA が read-only で、secret / email / raw payload / screenshot / HAR を出力しない
- [x] production では `WAITLIST_EMAIL_HASH_PEPPER` が未設定なら失敗する契約を確認できる
- [x] `waitlist_signups` migration と unique `email_hash` / `created_at` index を確認できる
- [x] rate limit と Retry-After の契約を確認できる
- [x] `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- secret 値、実メール、問い合わせ本文、raw request payload は出力しない
- 実写真、実名、生年月日、画像 URL、`storage_key`、prompt、AI 生成本文を扱わない
- readiness script は file contract だけを読む。production DB や外部サービスには接続しない

## 検証

- [x] `pnpm qa:issue091:waitlist-readiness -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/waitlist-release-readiness.test.ts`
- [x] `pnpm exec vitest run tests/unit/app/waitlist-release-readiness.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- [x] `pnpm pr:gate`
