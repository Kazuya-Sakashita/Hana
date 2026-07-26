---
id: ISSUE-088
title: post-merge issue status drift を同期する
priority: P2
status: done
size: S
created_at: 2026-07-26
parent: MAINTENANCE
github_issue: 199
blocked_by: []
external_blockers: []
requires_human_review: []
---

## 目的 (Why)

マージ済み / close 済みの Issue について、ローカル正本 `docs/issues` の
frontmatter が `review` のまま残っている状態を解消し、Issue Index と
GitHub の実態を揃える。

## スコープ (What)

- `ISSUE-074` の status を `done` に同期する
- `ISSUE-082` の status を `done` に同期する
- `ISSUE-074` の status を検査する unit test を `done` 前提へ同期する
- `docs/issues/README.md` の Done Archive に `ISSUE-088` を追加する
- `ISSUE-075` は privacy / legal human review 待ちの `blocked` のまま維持する

## やらないこと (Out of Scope)

- アプリコード、API、DB、Auth、Storage、OpenAPI の変更
- `/lp`、`/privacy`、本体アプリ UI の変更
- `ISSUE-075` の privacy / legal human review 完了扱い
- GitHub Issue #166 の close

## 影響範囲

| 領域         | 影響                    |
| ------------ | ----------------------- |
| OpenAPI      | なし                    |
| 生成型       | なし                    |
| アプリコード | なし                    |
| ドキュメント | Issue 正本、Issue Index |
| QA           | Markdown / 状態確認     |
| Test         | status assertion の同期 |

## 受け入れ条件 (Acceptance Criteria)

- [x] `docs/issues` に `status: review` が残っていない
- [x] `status: blocked` は `ISSUE-075` のみ
- [x] GitHub Issue #165 / #183 が closed であることと整合している
- [x] PR #186 / #184 が merged であることと整合している
- [x] API / DB / Auth / Storage / LP 表示に変更がない

## 実装メモ

- GitHub Issue #199 を作成した
- GitHub Issue #165 は 2026-07-25 に closed、PR #186 は merged 済みであることを確認した
- GitHub Issue #183 は 2026-07-25 に closed、PR #184 は merged 済みであることを確認した
- `ISSUE-074` と `ISSUE-082` の frontmatter を `done` に同期した
- `tests/unit/app/lp-hero-keepsake-composition.test.ts` の status assertion を `done` に同期した
- `docs/issues/README.md` の Status Snapshot を `done: 89` / `blocked: 1` に同期した
- `ISSUE-075` は公開 copy の privacy / legal human review 待ちとして `blocked` のまま残した

## 検証

- [x] `rg -n "^status: (todo|in_progress|review|blocked)$" docs/issues/ISSUE-*.md`
- [x] `gh issue view 165 --json state,closedAt`
- [x] `gh issue view 183 --json state,closedAt`
- [x] `gh pr view 186 --json state,mergedAt`
- [x] `gh pr view 184 --json state,mergedAt`
- [x] `pnpm exec prettier --check docs/issues/README.md docs/issues/ISSUE-074-lp-hero-keepsake-composition.md docs/issues/ISSUE-082-lp-app-visual-parity-qa-gate.md docs/issues/ISSUE-088-post-merge-status-sync.md`

## セキュリティ・プライバシー考慮

- Issue metadata と index のみを更新し、実データ、画像 URL、`storage_key`、prompt、
  AI 生成本文、メールは扱わない
- `ISSUE-075` の公開判断 blocker は維持する

## 専門レビュー

専門サブエージェント 3 名で read-only review を実施し、最大 3 回まで修正と再レビューを行う。

| round | reviewer                  | verdict | notes                                                                     |
| ----- | ------------------------- | ------- | ------------------------------------------------------------------------- |
| 1     | Issue Governance          | HOLD    | Status Snapshot の `done` count が 87 のまま。Done Archive は 89 件       |
| 1     | Release Hygiene           | HOLD    | Ready / Review / Blocked queue は整合。Status Snapshot の count のみ古い  |
| 1     | Privacy / Evidence Safety | GO      | `ISSUE-075` の privacy / legal blocker と evidence safety は維持済み      |
| 2     | Issue Governance          | GO      | Status Snapshot を `done: 89` / `blocked: 1` に同期し、frontmatter と一致 |
| 2     | Release Hygiene           | GO      | Ready / In Progress / Review は空、blocked は `ISSUE-075` のみ            |

## 参考

- `docs/issues/ISSUE-074-lp-hero-keepsake-composition.md`
- `docs/issues/ISSUE-082-lp-app-visual-parity-qa-gate.md`
- `docs/issues/README.md`
