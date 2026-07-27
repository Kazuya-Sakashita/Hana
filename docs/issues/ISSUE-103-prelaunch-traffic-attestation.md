---
id: ISSUE-103
title: 公開前 traffic の Go/Hold attestation を追加する
priority: P0
status: done
size: S
created_at: 2026-07-27
github_issue: 230
parent: PRELAUNCH-VALIDATION
blocked_by: []
external_blockers: []
requires_human_review: []
---

# ISSUE-103: 公開前 traffic の Go/Hold attestation を追加する

## 目的 (Why)

公開前検証 traffic を流す直前に、secret 値や実ユーザー情報を記録せず、環境設定と人間確認事項を Go/Hold として再現可能に判定する。

## スコープ (What)

- required env は値を出さず set / missing だけ確認する
- migration 適用、proxy client IP、rate limit、privacy mailbox、public QA、最新 PR gate、privacy copy baseline は human attestation として扱う
- 未確認項目が 1 つでもあれば HOLD にする
- contract mode を `pnpm pr:gate` に追加する
- 公開前検証の運用チェックリストと unit test を更新する

## やらないこと (Out of Scope)

- production secret 値の表示・保存
- DB migration の実行や production DB 接続
- 実メール、raw payload、screenshot、trace、HAR の保存
- API / OpenAPI / DB schema / LP copy の変更
- 外部状態を自動確認したという claim

## 影響範囲

- `scripts/qa/issue-103-prelaunch-traffic-attestation.cjs`
- `docs/release/prelaunch-waitlist-readiness.md`
- `docs/design/current-lp-evaluation.md`
- `package.json`
- `tests/unit/app/prelaunch-traffic-attestation.test.ts`
- `docs/issues/README.md`

## 受け入れ条件 (Acceptance Criteria)

- [x] contract mode が read-only / redacted policy を検証する
- [x] preflight mode は required env の値を出さず存在だけ判定する
- [x] human attestation が不足すると HOLD になる
- [x] 全項目確認時だけ GO になる
- [x] focused tests と `pnpm pr:gate` が通る

## セキュリティ・プライバシー考慮

- stdout / stderr は check ID、status、target、安定した failure reason だけを出す
- secret、接続文字列、実メール、request / response body を出力しない
- script は file contract と process env の存在だけを読み、外部接続や file write を行わない
- GO は外部状態の自動検証ではなく、運用担当者の明示確認を含む

## 検証

- [x] `pnpm qa:issue103:prelaunch-traffic -- --mode=contract`
- [x] `pnpm exec vitest run tests/unit/app/prelaunch-traffic-attestation.test.ts`
- [x] `pnpm pr:gate`
