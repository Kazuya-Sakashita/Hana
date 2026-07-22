---
id: ISSUE-034
title: Codex 自動開発向け PR gate を CI に追加する
priority: P0
status: done
size: S
created_at: 2026-07-21
github_issue: 61
release_gate: mvp_quality
ready_for_codex: true
automation_level: pr_ready
blocked_by: []
requires_human_review:
  - ci
---

## 目的 (Why)

Codex が Draft PR まで自動で進めるには、「このコマンドが通れば PR-ready」と判断できる共通ゲートが必要。

現在 CI は typecheck / lint / format と OpenAPI drift check が中心で、`pnpm test` と `pnpm build` が必須ゲートになっていない。まずは軽量な PR gate を作り、Codex の自動実装後に必ず通す。

## スコープ (What)

- `package.json` に `pr:gate` script を追加する
- CI の基本ゲートで以下を実行する
  - `pnpm format:check`
  - `pnpm lint`
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm build`
- PR template に `pnpm pr:gate` の確認項目を追加する
- stale path `src/app/api/*` を `src/app/v1/*` に更新する
- `pnpm build` の本番挙動は残し、PR gate では Google Fonts 取得をテスト用 mock に差し替える

## やらないこと (Out of Scope)

- E2E / visual regression / Lighthouse CI
- OpenAPI route-map check（ISSUE-037）
- DB migration test with ephemeral Postgres
- branch protection 設定変更

## 影響範囲

- `package.json`
- `.github/workflows/typecheck.yml`
- `.github/pull_request_template.md`
- `tests/fixtures/next-font-google-mocked-responses.cjs`

## 受け入れ条件 (Acceptance Criteria)

- [x] `pnpm pr:gate` がローカルで実行できる
- [x] PR CI で test / build まで実行される
- [x] PR template が `pnpm pr:gate` を要求している
- [x] PR template の Route Handler パスが現行構成に合っている
- [x] PR gate の build が Google Fonts 取得に依存しない

## セキュリティ・プライバシー考慮

- CI ログに `.env.local` や secret を出さない
- 実データを使う smoke test はこの Issue では扱わない

## 参考

- `.github/workflows/typecheck.yml`
- `.github/workflows/openapi-validate.yml`
- `.github/pull_request_template.md`
