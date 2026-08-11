---
id: ISSUE-194
title: Loop Engineer回復をmanual-onlyで終端する人間ルート方針を定義する
priority: P0
status: in_progress
size: S
created_at: 2026-08-11
github_issue: 392
release_gate: development_governance
requires_human_review:
  - security
  - operations
  - repository_owner
---

# ISSUE-194: Loop Engineer回復をmanual-onlyで終端する人間ルート方針を定義する

## 目的 (Why)

hardware security keyを購入しない現状で、Terminal HOLD後のLoop Engineer回復を自動化せず
manual-onlyで終端する。通常開発の保護されたmerge経路と回復権限・activation経路を分離し、
停止した回復campaignを再開または迂回しない。

## スコープ (What)

- Loop Engineer回復、例外、credential、Check更新、activationをmanual-onlyの停止状態へ固定する
- 通常開発のHana App required Checksと手動merge判断は継続可能と明記する
- PR #355、#361、#389、#391およびIssue #362、#390のTerminal HOLDを維持する
- `origin/main`から新規に作成し、凍結branchの成果物を継承しない
- H2 / H3は自動開始せず、別Issueを作成するかを人間が改めて判断する
- hardware security keyがない間、実権限の発行・消費・activationを`BLOCKED`とする
- 最大3巡の独立reviewとfail-closed停止条件を定義する

## やらないこと (Out of Scope)

- Ruleset、Environment、repository settingsの変更
- GitHub App、token、credential、secret、署名鍵の作成・変更
- workflow、runtime、schema、OpenAPI、アプリコード、testの変更
- recovery Check、`review-round-exception`、`merge-eligibility`の作成・更新
- 凍結PRへのpush、review、Check、merge
- 凍結branchのcode、commit、diff、schema、test、fixture、review、Check、attestationの再利用
- H2 / H3 Issueの作成、実装、activation
- hardware security keyの購入

## 影響範囲

- `AGENTS.md`
- `docs/adr/0017-loop-engineer-approval-boundary.md`
- `docs/adr/0019-human-root-manual-only-governance.md`
- `docs/api-driven-development/codex-automation-runbook.md`
- `docs/issues/README.md`

OpenAPI、生成型、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] 回復権限planeと通常merge-control planeを明確に分離する
- [x] 通常のHana App required Checksは回復権限、exception、activationを付与しないと明記する
- [x] Terminal HOLD対象と禁止操作を固定し、Issue・PRの作り直しによる迂回を禁止する
- [x] frozen成果物のnon-inheritance境界を明記する
- [x] manual-only状態で許可される人間操作と禁止される自動操作を列挙する
- [x] H1のmergeだけではH2 / H3、credential発行、Check更新、activationを開始しない
- [x] hardware security keyがない間の実権限経路を`BLOCKED`にする
- [x] Ruleset、Environment、workflow、App、token、runtimeを変更しない
- [x] reviewは同一head SHAに対する独立した3観点を1巡とし、最大3巡に制限する
- [x] Round 1または2のfindingは巡ごとに1つのbounded修正batchへ統合する
- [x] Round 3でfinding、scope変更、reviewer不足、SHA不一致が残ればIssueを`blocked`として終了する
- [x] 第4巡、reviewer交代によるbudget reset、例外workflow、Terminal HOLD後継の自動作成を禁止する
- [ ] `pnpm format:check`、`pnpm issues:check`、`pnpm pr:gate`、`git diff --check`が成功する
- [x] 問題がない場合も自動mergeせず、Repository Ownerが手動squash mergeを判断する

## Review計画

各巡で同一merge-base、Issue、head SHA、diffを使い、他reviewerの結果を事前共有しない。

1. Spec / Acceptance
2. Security / Authority Boundary
3. Operations / Liveness / Rollback

Round 1と2でfindingがあれば、全findingを固定して1回の修正batchにまとめる。修正後は新head SHAで
次巡を行う。Round 3で解消しなければ追加修正・第4巡へ進まず、原因と未解決事項を報告する。

## セキュリティ・プライバシー考慮

H1はcredential、secret、OIDC claim、実ユーザーデータを取得・保存しない。証跡はIssue、PR、
merge-base、head SHA、review role、round、finding件数、固定statusだけに限定する。

## Validation Ledger

- `pnpm format:check`: pass
- `pnpm issues:check`: pass（173 issues）
- `git diff --check`: pass
- 全unit / contract test: pass（1544 tests、23 skipped）
- `pnpm build:ci`: pass（sandbox外でport bindを許可して確認）
- `pnpm pr:gate`: GitHubの正規Check待ち。ローカルではsandboxのport bind制限により最終buildだけを
  同一processで完走できなかったため、成功とは記録しない

## Rollback

文書PRをrevertし、通常開発を既存のmain規約へ戻す。Terminal HOLD対象、Ruleset、Environment、App、
credential、runtimeには変更を加えないため、回復権限や実環境のrollback操作は発生しない。

## 参考

- GitHub Issue #392
- ADR-0017
- ADR-0019
- PR #355 / #361 / #389 / #391
- GitHub Issue #362 / #390
