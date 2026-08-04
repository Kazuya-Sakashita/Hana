---
id: ISSUE-169
title: App preflightのpnpm参照先をtrusted checkoutへ固定する
priority: P0
status: review
size: S
created_at: 2026-08-04
github_issue: 348
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-169: App preflightのpnpm参照先をtrusted checkoutへ固定する

## 目的 (Why)

ISSUE-166の実GitHub設定検証で、App security preflightがpnpmのversion metadataを
workspace rootから探し、trusted checkout内の`package.json`を見つけられず停止する問題を解消する。

## スコープ (What)

- App security preflightのpnpm/action-setup参照先
- merge gateとwaiver失効controllerを含むtrusted checkoutのpnpm/action-setup参照先
- trusted checkoutを使うworkflow contract test
- ISSUE-169のローカルIssue台帳

## やらないこと (Out of Scope)

- GitHub App権限の変更
- Environment secretまたはprivate keyの再発行
- Ruleset、repository settings、auto-merge予約の変更
- production deploy、DB migration、実ユーザーデータ

## 影響範囲

- `.github/workflows/loop-engineer-app-security-preflight.yml`
- `.github/workflows/loop-engineer-merge-gates.yml`
- `.github/workflows/loop-engineer-breaking-waiver-revoked.yml`
- `tests/unit/app/loop-engineer-github-app-security-preflight-contract.test.ts`
- `tests/unit/app/loop-engineer-github-merge-controls-contract.test.ts`
- `docs/issues/`

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] pnpm/action-setupが`trusted-control/package.json`を明示的に参照する
- [x] workflow contract testが参照先の退行を検知する
- [x] 対象テストと`pnpm pr:gate`が成功する
- [ ] mainへのmerge後、App security preflightがsuccessになる
- [x] App権限、Environment secret、実ユーザーデータの扱いを変更しない

## セキュリティ・プライバシー考慮

private keyとinstallation tokenの扱いは変更しない。テストと証跡には固定status/reason、Issue番号、
workflow run IDだけを使い、secret値、token、repository一覧を保存しない。

## 参考

- GitHub Issue #348
- GitHub Issue #338 / ISSUE-166
- GitHub Actions run 30903345640
- 固定reason: `pnpm_package_json_path_missing`
