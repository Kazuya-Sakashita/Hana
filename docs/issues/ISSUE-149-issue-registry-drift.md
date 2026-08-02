---
id: ISSUE-149
title: Issue台帳とGitHub状態のdriftをCIで防ぐ
priority: P1
status: review
size: M
created_at: 2026-08-03
github_issue: 319
release_gate: development_governance
requires_human_review:
  - development
---

# ISSUE-149: Issue台帳とGitHub状態のdriftをCIで防ぐ

## 目的 (Why)

GitHub Issue、永続Issue frontmatter、Issue indexの状態ずれを機械的に検出する。

## スコープ (What)

- frontmatter schemaと重複の検証
- frontmatterからの決定的なIssue index生成
- status-onlyなGitHub状態照合
- 現在の台帳driftの同期

## やらないこと (Out of Scope)

- GitHub Issue本文、コメント、ユーザー情報のCI取得
- API、DB、Storage、実ユーザーデータの変更
- GitHub Issueの自動closeまたはreopen

## 受け入れ条件 (Acceptance Criteria)

- [x] frontmatter schema、Issue ID重複、許可statusを検証するコマンドを追加する
- [x] Issue indexをfrontmatterから決定的に生成し、手編集との差分をCIで検出する
- [x] closed GitHub Issueとlocal review状態の不一致をstatus-onlyで検出する
- [x] 現在のreview状態とindex集計をlive GitHub状態へ同期する
- [x] Issue body、コメント、ユーザー情報、secretをCI artifactやログへ保存しない

## セキュリティ・プライバシー考慮

GitHubとの照合入力はIssue番号とOPEN/CLOSEDだけに限定する。artifactへ保存せず、ログにはIssue ID、GitHub番号、local status、GitHub stateだけを出す。

## 検証結果

- `pnpm issues:check`: PASS（163 local issue files）
- `pnpm issues:check-github`: PASS（162 status-only GitHub records）
- `pnpm test`: PASS（158 files / 1238 tests、12 skipped）
- `pnpm typecheck`: PASS
- `pnpm lint`: PASS
- `git diff --check`: PASS
- 第1回レビュー: status入力欠落時のfail-openを修正し、`github=MISSING`でfail-closedへ変更
- 第2回レビュー: CI workflowのstatus-only入力とartifact非保存を直接検証する回帰テストを追加

## 参考

- GitHub Issue #319
