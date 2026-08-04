---
id: ISSUE-168
title: GitHub App preflightを通常gh認証から分離する
priority: P0
status: review
size: M
created_at: 2026-08-04
github_issue: 346
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-168: GitHub App preflightを通常gh認証から分離する

## 目的 (Why)

ISSUE-166の適用CLIがGitHub App user access token専用APIを通常の`gh`認証で呼び、実設定前の
read-only preflightがHTTP 403で停止する問題を解消する。

## スコープ (What)

- protected Environment内でtrusted mainコードだけを実行するGitHub App security preflight
- 専用Appの宣言権限と、installationがアクセスできるrepository全件の照合
- main SHA、workflow run、専用App IDへ結び付くstatus-only Check Run
- apply CLIによる最新preflight証跡のfail-closed検証
- 認証失敗、stale、別App、別SHA、部分失敗の回帰テスト

## やらないこと (Out of Scope)

- GitHub App、Environment、variable、secretの実作成
- Ruleset、repository settings、branch protectionの変更
- native auto-mergeの有効化またはPRへの予約
- production deploy、実DB migration、実ユーザーデータ

## 影響範囲

- `.github/workflows/`の手動preflight workflow
- `scripts/loop-engineer/`のApp検証と設定前preflight
- `docs/api-driven-development/`のISSUE-166 runbook
- GitHub API境界のunit / workflow contract test

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] 通常のGitHub CLI認証で`user/installations`を呼ばない
- [x] protected Environment内で専用Appの宣言権限がChecks write、Contents read、Metadata read、Pull requests readだけと確認する
- [x] owner全体を対象にしたinstallation tokenでアクセス可能repositoryが`Kazuya-Sakashita/Hana`だけと確認する
- [x] mainの最新SHAへ専用App名義の`app-security-preflight`を最初に`in_progress`で作り、成功時だけ同じCheck Run IDを`success`へ更新する
- [x] apply CLIはworkflow run、Check名、専用App ID、main SHA、最新ID、成功、有効期限をfail-closedで照合する
- [x] failure、stale、別App、別SHA、複数最新Check、部分API失敗を実行可能テストで確認する
- [x] App ID、login、private key、token、installation ID、repository一覧をlog、artifact、PR証跡へ出さない
- [x] Ruleset、repository settings、auto-merge予約を変更しない
- [x] rollbackとISSUE-167の人間GO境界を維持する

## セキュリティ・プライバシー考慮

private keyとinstallation tokenはprotected Environment job内だけで扱い、actionのpost処理でtokenを
失効させる。永続証跡はIssue ID、main SHA、workflow run ID、Check Run ID、固定status/reason、時刻だけに
限定する。API応答、App ID、login、repository一覧、secret値をlog、artifact、docsへ保存しない。

## 参考

- GitHub Issue #346
- GitHub Issue #338 / ISSUE-166
- GitHub Issue #339 / ISSUE-167
- ADR-0017
- GitHub REST API: App installations / GitHub Apps
