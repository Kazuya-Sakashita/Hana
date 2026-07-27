---
id: ISSUE-105
title: staging preflight を実行し公開前 traffic の Go/Hold を判定する
priority: P0
status: blocked
size: S
created_at: 2026-07-27
github_issue: 234
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers:
  - staging_hosting_target
  - staging_public_url
  - staging_secret_configuration
  - staging_migration_status
  - proxy_and_rate_limit_confirmation
  - privacy_mailbox_confirmation
requires_human_review:
  - release
  - security
  - privacy
---

# ISSUE-105: staging preflight を実行し公開前 traffic の Go/Hold を判定する

## 目的 (Why)

公開前検証 traffic を流す前に、staging 環境で ISSUE-103 の preflight を実行し、外部状態を含む Go/Hold を人間確認付きで確定する。

## 現在の判定

**HOLD**

2026-07-27 時点では staging の hosting target と public URL を特定できず、required env、migration、proxy、rate limit、privacy mailbox、public QA の実環境確認を完了できない。

## Read-only 確認結果

| 対象                        | 結果                                                                          | 境界                                         |
| --------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| ISSUE-103 staging preflight | HOLD                                                                          | env 値は出力していない                       |
| local `.env.local`          | `DATABASE_URL` / `DIRECT_URL` は set、`WAITLIST_EMAIL_HASH_PEPPER` は missing | local-only。staging 設定とは扱わない         |
| GitHub Environments         | なし                                                                          | GitHub repository のみ確認                   |
| GitHub Deployments          | なし                                                                          | GitHub repository のみ確認                   |
| GitHub repository secrets   | なし                                                                          | secret 値ではなく登録名の有無だけ確認        |
| deploy workflow             | なし                                                                          | typecheck / OpenAPI validation workflow のみ |

## 解除条件

- [ ] hosting target と staging public URL が確定している
- [ ] staging に `WAITLIST_EMAIL_HASH_PEPPER` / `DATABASE_URL` / `DIRECT_URL` が設定されている
- [ ] `waitlist_signups` migration の適用が確認済み
- [ ] proxy client IP header と rate limit が確認済み
- [ ] `privacy@hana.app` の受信とアクセス制御が確認済み
- [ ] staging public QA と最新 `pnpm pr:gate` が成功している
- [ ] Privacy / Legal review 済み copy から変更がない
- [ ] ISSUE-103 preflight が `GO` を返す

## やらないこと (Out of Scope)

- secret 値、DB 接続文字列、実メール、raw payload の表示・保存
- migration の実行
- production / staging 環境の変更
- API / OpenAPI / DB schema / LP / privacy copy の変更
- hosting platform の推測

## 影響範囲

- `docs/issues/ISSUE-105-staging-preflight-go-hold.md`
- `docs/issues/README.md`
- `tests/unit/app/prelaunch-staging-hold-state.test.ts`
- blocked state を参照する既存 unit test

## 受け入れ条件 (Acceptance Criteria)

- [x] 現在の HOLD 判定と read-only evidence が値を含まず記録されている
- [x] 外部 blocker と human review 項目が明示されている
- [x] `docs/issues/README.md` に blocked Issue として同期されている
- [ ] staging の実環境確認が完了している
- [ ] ISSUE-103 preflight が `GO` を返している

## セキュリティ・プライバシー考慮

- environment variable は名前と set / missing だけを扱い、値を記録しない
- 実メール、request / response body、screenshot、trace、HAR を記録しない
- external blocker が未確認の間は公開前 traffic を HOLD にする

## 検証

- [x] `pnpm qa:issue103:prelaunch-traffic -- --mode=preflight --target=staging` が HOLD
- [x] `pnpm exec vitest run tests/unit/app/prelaunch-staging-hold-state.test.ts tests/unit/app/quiet-heirloom-refinement-contract.test.ts`
- [x] `pnpm pr:gate`
