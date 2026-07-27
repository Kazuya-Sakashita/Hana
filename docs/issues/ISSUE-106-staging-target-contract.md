---
id: ISSUE-106
title: staging target の read-only contract を追加する
priority: P0
status: review
size: S
created_at: 2026-07-27
github_issue: 236
parent: ISSUE-105
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-106: staging target の read-only contract を追加する

## 目的 (Why)

staging の hosting platform と public URL を、値をログへ残さず set / missing と URL 安全性で確認できるようにする。

## スコープ (What)

- `STAGING_HOSTING_PLATFORM` と `STAGING_BASE_URL` の存在と公開 URL shape を判定する
- localhost、loopback、IP literal、内部向け hostname、非 HTTPS、credential 付き URL、path / query / hash 付き URL を HOLD にする
- platform と host 名を出力しない
- contract mode を `pnpm pr:gate` に接続する
- ISSUE-105 配下の staging readiness sequence を Issue Index に追加する

## やらないこと (Out of Scope)

- hosting platform の選定
- staging の作成・deploy・環境変数設定
- network request、screenshot、trace、HAR
- API / OpenAPI / DB / LP / privacy copy の変更

## 影響範囲

- `scripts/qa/issue-106-staging-target-contract.cjs`
- `docs/release/prelaunch-waitlist-readiness.md`
- `package.json`
- `tests/unit/app/staging-target-contract.test.ts`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] hosting platform と staging URL の値を出さずに存在を判定できる
- [x] localhost、loopback、IP literal、内部向け hostname、非 HTTPS、不正 URL は HOLD になる
- [x] valid public HTTPS origin のときだけ GO になる
- [x] contract mode が `pnpm pr:gate` に接続されている
- [x] focused tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- platform、URL、host、credential を stdout / stderr に出さない
- script は process env の存在と URL shape だけを読み、network request や file write を行わない
- DNS 解決や到達確認は行わず、hostname の実際の解決先が公開アドレスであることは保証しない
- target contract が GO でも ISSUE-105 全体は自動的に GO にしない

## 検証

- [x] `pnpm qa:issue106:staging-target -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/staging-target-contract.test.ts`
- [x] `pnpm pr:gate`
