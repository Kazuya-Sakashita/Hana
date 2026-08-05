---
id: ISSUE-171
title: Gate evaluationをJSON-onlyで後段へ渡す
priority: P0
status: review
size: S
created_at: 2026-08-05
github_issue: 352
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-171: Gate evaluationをJSON-onlyで後段へ渡す

## 目的 (Why)

main固定のLoop Engineer workflowが、正しいJSON評価をパッケージマネージャーの前置き表示で
壊さず後段へ渡せるようにする。

## スコープ (What)

- gate evaluationを実行するpnpm scriptのJSON-only出力
- JSON-only実行を固定するworkflow contract test
- ISSUE-171のローカルIssue台帳

## やらないこと (Out of Scope)

- GitHub App権限、Environment、Ruleset、repository settingsの変更
- auto-merge予約、production deploy、DB migration
- API、アプリruntime、実ユーザーデータの変更

## 影響範囲

- `.github/workflows/loop-engineer-merge-gates.yml`
- `tests/unit/app/loop-engineer-github-merge-controls-contract.test.ts`
- `docs/issues/`

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] gate evaluationの出力ファイルへ評価JSONだけを書き込む
- [x] workflow contract testでJSON-only実行を固定する
- [x] malformed inputと`HOLD`を成功へ変えない
- [x] 対象テストと`pnpm pr:gate`が成功する
- [x] 実ユーザーデータ、secret、GitHub設定、auto-merge予約を変更しない

## セキュリティ・プライバシー考慮

workflow inputと評価結果はIssue ID、PR番号、SHA、role、件数、固定status/reasonだけに限定したままにする。
secret、token、PR本文、実ユーザーデータは出力へ含めない。

## Rollback

この修正を導入したsquash commitをrevertし、main workflowが変更前へ戻ったことを確認する。
GitHub設定とauto-merge予約は変更しない。

## 参考

- GitHub Issue #352
- GitHub Issue #338 / ISSUE-166
- GitHub Actions run 30946625026
- 固定reason: `gate_evaluation_json_polluted`
