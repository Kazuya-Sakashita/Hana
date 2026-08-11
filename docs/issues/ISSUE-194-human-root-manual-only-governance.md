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
- Terminal HOLD lineage、ISSUE-194または回復目的のrecovery Check、`review-round-exception`、
  `merge-eligibility`投影の作成・更新
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
- [x] reviewは最初のrole開始時にbase、head、3 role、principal、期限へ固定してRoundを消費する
- [x] Round 1または2の完全bundleにあるcontent findingは巡ごとに正確に1つのbounded修正batchへ統合する
- [x] operational failureはどのRoundでも即時、Round 3のcontent findingは最終的に`blocked`とする
- [x] 第4巡、reviewer交代によるbudget reset、例外workflow、Terminal HOLD後継の自動作成を禁止する
- [ ] `pnpm format:check`、`pnpm issues:check`、`pnpm pr:gate`、`git diff --check`が成功する
- [x] 問題がない場合も自動mergeせず、Repository Ownerが手動squash mergeを判断する

## Review計画

Roundは最初のrole開始時に消費する。開始前に同一merge-base、Issue、head SHA、diff、3 role、
fixed principal、期限を固定し、他reviewerの結果を事前共有しない。

1. Spec / Acceptance
2. Security / Authority Boundary
3. Operations / Liveness / Rollback

Round 1と2の完全bundleにcontent findingがあれば、全findingをstable IDと固定reasonへ正規化し、
正確に1回の修正batchへまとめる。修正後は新head SHAで次巡を行う。reviewer不足・交代、timeout、
schema違反、SHA不一致、scope変更、Round開始後のmain / head変更、batch外変更はどのRoundでも即時
`blocked`とする。Round 3のcontent findingも追加修正・第4巡へ進まず、原因と未解決事項を報告する。

## セキュリティ・プライバシー考慮

H1はcredential、secret、OIDC claim、実ユーザーデータを取得・保存しない。証跡はIssue、PR、
merge-base、head SHA、review role、round、finding件数、固定statusだけに限定する。

## Validation Ledger

- `pnpm format:check`: pass
- `pnpm issues:check`: pass（173 issues）
- `git diff --check`: pass
- 全unit / contract test: pass（1544 tests、23 skipped）
- `pnpm build:ci`: pass（sandbox外でport bindを許可して確認）
- GitHub `pr-gate`: Round 1 head `64a4926cd9adcc32c5bac954e5344300097b558c`でpass。
  remediation後のheadでは未確認
- local `pnpm pr:gate`: sandboxのport bind制限により最終buildだけを同一processで完走できなかったため、
  successとは記録しない

## Review Ledger

- Round: 1
- Reviewed head: `64a4926cd9adcc32c5bac954e5344300097b558c`
- Roles completed: 3 / 3
- Raw findings: 12
- Normalized backlog: `issue194-r1-backlog-v1`（P1: 6、P2: 2）
- Fixed reasons:
  - `hardware_key_conjunction`
  - `round_consumption_missing`
  - `issue173_scope_ambiguous`
  - `h2_h3_undefined`
  - `normal_check_projection_ambiguous`
  - `rollback_removes_safety`
  - `frozen_adr_identifier_reference`
  - `github_local_ac_drift`
- Remediation: exactly one bounded batch applied; Round 2 pending

## Rollback

Terminal HOLD凍結とrecovery authorityの`BLOCKED`はrollbackでも削除しない。誤りはmanual-only停止を
維持したforward-fixで修正する。通常planeの記述だけをrevertする場合も、凍結対象、credential / Check /
workflow禁止、H2 / H3非自動開始、activation禁止を残す。Ruleset、Environment、App、credential、
runtimeには変更を加えないため、外部状態のrollback操作は発生しない。

## 参考

- GitHub Issue #392
- ADR-0017
- ADR-0019
- PR #355 / #361 / #389 / #391
- GitHub Issue #362 / #390
