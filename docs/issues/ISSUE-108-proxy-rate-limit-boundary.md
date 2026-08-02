---
id: ISSUE-108
title: proxy client IP と rate limit 境界を強化する
priority: P0
status: done
size: S
created_at: 2026-07-28
github_issue: 239
parent: ISSUE-105
blocked_by: []
external_blockers: []
requires_human_review:
  - security
  - release
---

# ISSUE-108: proxy client IP と rate limit 境界を強化する

## 目的 (Why)

waitlist rate limit が proxy client IP の採用順と header 欠落時の安全側挙動を一貫して扱い、Retry-After 契約を維持できるようにする。

## スコープ (What)

- trusted proxy 設定時だけ `x-forwarded-for` の先頭にある local 用途でない valid IP を client bucket key にする
- 先頭値が missing / invalid / private の場合は同条件の `x-real-ip` へ fallback する
- 両 header が missing / invalid の場合は共有 `unknown` bucket を使う
- IPv6 / IPv4-mapped IPv6 を canonical key に正規化する
- active bucket を最大 1024 件に制限し、期限切れ bucket を request 時に削除する
- client bucket 分離、unknown bucket、window reset、capacity を unit test で固定する
- route integration test で 429 と実際の残り時間に沿う `Retry-After` を維持する

## やらないこと (Out of Scope)

- rate limit の上限12件 / 10分 window の変更
- Redis / provider edge rate limit / bot detection の導入
- proxy header を渡す hosting platform の設定
- client IP のログ・永続化
- OpenAPI / API response / DB / LP / privacy copy の変更

## 影響範囲

- `src/features/waitlist/server/rate-limit.ts`
- `src/app/v1/waitlist/route.ts`
- `.env.example`
- `scripts/qa/issue-091-waitlist-readiness-contract.cjs`
- `tests/unit/features/waitlist/rate-limit.test.ts`
- `tests/integration/v1/waitlist.test.ts`
- `docs/release/prelaunch-waitlist-readiness.md`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] forwarding header は trusted proxy 設定時だけ採用される
- [x] forwarded chain の先頭 canonical client IP で bucket が分離される
- [x] `x-real-ip` fallback が検証される
- [x] header なし / invalid の場合は共有 bucket で安全側に rate limit される
- [x] active bucket が上限内に保たれ、期限切れ bucket が削除される
- [x] 429 の `Retry-After` が window reset までの残り秒数を返す
- [x] unit / integration tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- hosting proxy が外部入力の forwarding header を除去・上書きすると確認できた環境でだけ trusted proxy 設定を有効にする
- client IP は process memory の bucket key にだけ使い、ログ・response・evidence・DB に残さない
- `unknown` / overflow bucket は複数利用者で共有されるため、header 設定不備や高 cardinality traffic では availability より abuse 抑止を優先する
- in-memory limiter は process-local の best effort であり、複数 instance の全体制御を保証しない

## 検証

- [x] `pnpm exec vitest run tests/unit/features/waitlist/rate-limit.test.ts`
- [x] `pnpm exec vitest run tests/integration/v1/waitlist.test.ts`
- [x] `pnpm pr:gate`
