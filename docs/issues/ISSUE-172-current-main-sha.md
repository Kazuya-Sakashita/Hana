---
id: ISSUE-172
title: Gateを現在のmain SHAへ束縛する
priority: P0
status: review
size: S
created_at: 2026-08-05
github_issue: 354
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-172: Gateを現在のmain SHAへ束縛する

## 目的 (Why)

Loop Engineerのreview attestationと専用Appチェックを、PR作成時のbase snapshotではなく
各判定時点の現在のmain SHAへ束縛する。

## スコープ (What)

- prepareで使うmain SHAのfresh readback
- check開始・確定・人間承認で使うmain SHAのfresh readback
- moved main SHAのcontrollerとworkflow contract test
- ISSUE-172のローカルIssue台帳

## やらないこと (Out of Scope)

- GitHub App権限、Environment、Ruleset、repository settingsの変更
- auto-merge予約、production deploy、DB migration
- API、アプリruntime、実ユーザーデータの変更

## 影響範囲

- `.github/workflows/loop-engineer-merge-gates.yml`
- `scripts/loop-engineer/github-check-generation.ts`
- `tests/unit/app/loop-engineer-github-merge-controls-contract.test.ts`
- `tests/unit/scripts/loop-engineer-github-check-generation.test.ts`
- `docs/issues/`

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] prepareは現在の`refs/heads/main` SHAとattestationのmerge baseを照合する
- [x] check開始・確定・人間承認でも現在のmain SHAをfresh readbackする
- [x] workflow実行中またはreview後にmainが進んだ場合、現在世代をfailureにして再reviewを要求する
- [x] moved main SHAの回帰テストを追加する
- [x] 対象テストと`pnpm pr:gate`が成功する
- [x] App権限、Environment、Ruleset、repository settings、auto-merge予約を変更しない

## セキュリティ・プライバシー考慮

GitHub APIから読むのはPR状態、現在のmain SHA、head SHA、固定label状態だけとする。PR本文、コメント、
実ユーザーデータ、secret、tokenはworkflow input、artifact、logへ含めない。

## Rollback

この修正を導入したsquash commitをrevertし、main workflowとcontrollerが変更前へ戻ったことを確認する。
Rulesetとrepository settingsは変更しない。

## 参考

- GitHub Issue #354
- GitHub Issue #338 / ISSUE-166
- GitHub PR #351
- 固定reason: `current_main_sha_mismatch`
