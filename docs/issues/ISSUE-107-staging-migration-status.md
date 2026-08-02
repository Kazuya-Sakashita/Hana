---
id: ISSUE-107
title: staging migration status を redacted に確認する
priority: P0
status: done
size: S
created_at: 2026-07-27
github_issue: 238
parent: ISSUE-105
blocked_by: []
external_blockers: []
requires_human_review:
  - database
  - release
---

# ISSUE-107: staging migration status を redacted に確認する

## 目的 (Why)

staging の migration 適用状態を、接続文字列や Prisma の生出力を evidence に残さず pass / hold で確認できるようにする。

## スコープ (What)

- contract mode は外部 DB や外部 process へ接続しない
- status mode は `--target=staging` と `DIRECT_URL` が揃う場合だけ `prisma migrate status` を実行する
- Prisma の終了状態だけを pass / hold に正規化する
- `waitlist_signups` migration がローカル migration 履歴に含まれることを contract で確認する
- runner の contract mode を `pnpm pr:gate` に接続する

## やらないこと (Out of Scope)

- migration 適用は行わない
- `migrate deploy` / `migrate dev` / `migrate reset` / `db push`
- schema、migration SQL、DB data の変更
- DATABASE_URL / DIRECT_URL / Prisma raw stdout / stderr の出力や保存
- OpenAPI / API / LP / privacy copy の変更

## 影響範囲

- `scripts/qa/issue-107-staging-migration-status.cjs`
- `tests/unit/app/staging-migration-status.test.ts`
- `prisma.config.ts`
- `docs/release/prelaunch-waitlist-readiness.md`
- `package.json`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] contract mode は外部 DB へ接続しない
- [x] runtime mode は `prisma migrate status` だけを実行し raw output を出さない
- [x] target attestation / `DIRECT_URL` missing、CLI error、status 失敗は HOLD になる
- [x] focused tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- connection string、host、database 名、Prisma raw stdout / stderr を出力しない
- Prisma 子 process には allowlist 済み env だけを渡し、QA 実行時の dotenv 読込を止める
- status mode は 30 秒で `SIGKILL` し、timeout / signal / error を HOLD に正規化する
- pass は migration status の確認だけを示し、ISSUE-105 全体や公開前 traffic の GO を意味しない

## 検証

- [x] `pnpm qa:issue107:migration-status -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/staging-migration-status.test.ts`
- [x] `pnpm pr:gate`
