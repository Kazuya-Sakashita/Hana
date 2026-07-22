---
id: ISSUE-042
title: Review Queue を GitHub の完了状態と同期する
priority: P2
status: done
size: S
created_at: 2026-07-23
github_issue: 89
---

## 目的 (Why)

GitHub Issue / PR では完了済みの作業が、ローカル `docs/issues/README.md` では
`review` queue に残っている。

このままだと Codex が次に進める Issue を選ぶ時に、完了済み作業を再調査してしまう。
GitHub の closed issue / merged PR と、ローカル Issue の status を同期する。

## スコープ (What)

- `status: review` のローカル Issue を GitHub issue / PR の実態と照合する
- GitHub issue が closed、対応 PR が merged、ローカル受け入れ条件の完了根拠があるものを `done` に更新する
- `docs/issues/README.md` の Status Snapshot / Review Queue / Done Archive を更新する
- 手動 QA など未完条件が残る場合は、完了扱いにせず follow-up または blocker として明示する

## やらないこと (Out of Scope)

- アプリコード変更
- OpenAPI / 生成型の変更
- 認証済み実データ QA (#87 / ISSUE-041) の実施
- 人間確認が必要な blocker の解除

## 影響範囲

| 領域         | 影響                          |
| ------------ | ----------------------------- |
| OpenAPI      | なし                          |
| 生成型       | なし                          |
| アプリコード | なし                          |
| DB           | なし                          |
| ドキュメント | `docs/issues/` の状態管理のみ |

## 受け入れ条件 (Acceptance Criteria)

- [x] `review` queue の各項目が GitHub issue / PR と照合されている
- [x] `done` に移す Issue には closed issue / merged PR の根拠が残っている
- [x] 未完の手動 QA がある場合、実施済みとして扱わず historical note として残している
- [x] `docs/issues/README.md` の Status Snapshot と frontmatter status の実数が一致する
- [x] `pnpm format:check` が通る
- [x] `pnpm pr:gate` が通る

## 完了同期 (2026-07-23)

3 つの read-only サブエージェントで、foundation / automation / perf・UX の 3 グループを
並行監査した。以下は GitHub issue が closed、対応 PR が merged、ローカル完了根拠が
確認できたため `done` に同期する。

| Issue       | GitHub Issue | PR  | 判定根拠                                                        |
| ----------- | ------------ | --- | --------------------------------------------------------------- |
| `ISSUE-001` | #1 closed    | #2  | Next.js / pnpm / strict TS / CI / template / ADR 初期設定済み   |
| `ISSUE-002` | #3 closed    | #4  | OpenAPI 3.1 / ProblemDetails / common responses / lint 設定済み |
| `ISSUE-003` | #5 closed    | #6  | `openapi:gen` / generated schema / drift check 設定済み         |
| `ISSUE-004` | #7 closed    | #8  | API client / error guard / PII-safe logger / tests 設定済み     |
| `ISSUE-005` | #9 closed    | #10 | Prisma / Supabase env keys / DB docs / sanitize-error 設定済み  |
| `ISSUE-020` | #70 closed   | #72 | loading files / Link prefetch policy / `pnpm pr:gate` 済み      |
| `ISSUE-021` | #69 closed   | #73 | analyzer / bundle baseline / font weight reduction 済み         |
| `ISSUE-022` | #75 closed   | #76 | AI image download + resize parallel tests / `pnpm pr:gate` 済み |
| `ISSUE-023` | #71 closed   | #74 | Query Provider / hooks / invalidation / `pnpm pr:gate` 済み     |
| `ISSUE-029` | #77 closed   | #78 | optimistic helper / toast / rollback tests 済み                 |
| `ISSUE-032` | #62 closed   | #68 | release readiness doc / gate / risk table 済み                  |
| `ISSUE-033` | #58 closed   | #63 | Codex automation runbook / max 3 parallel / human gates 済み    |
| `ISSUE-034` | #61 closed   | #64 | `pnpm pr:gate` / CI / PR template 済み                          |
| `ISSUE-035` | #59 closed   | #65 | Issue index / ready queue / selection rules 済み                |
| `ISSUE-036` | #60 closed   | #66 | security/privacy 正本 / release blockers 済み                   |
| `ISSUE-037` | #57 closed   | #67 | OpenAPI route-map check / `pr:gate` 組み込み済み                |
| `ISSUE-040` | #85 closed   | #86 | album one-item cache regression fix / unit + integration 済み   |

`ISSUE-020` / `ISSUE-021` / `ISSUE-023` には DevTools / Visual QA の historical note が残る。
これらは対応 PR merge と GitHub issue close により local status を同期するが、将来の
性能・表示 QA を行う場合は新規 Issue として扱う。

この maintenance Issue 自体は PR #93 の merge によって完了するため、この PR 内で
`status: done` として archive へ入れる。これは `ISSUE-039` と同じ台帳同期用の扱い。

## セキュリティ・プライバシー考慮

- 実データ、画像 URL、storage_key、signed URL、AI 生成本文は扱わない
- GitHub issue / PR 番号とローカルファイル名だけを完了根拠として記録する

## 参考

- GitHub Issue #89
- `docs/issues/README.md`
- `docs/issues/ISSUE-039-issue-index-done-sync.md`
