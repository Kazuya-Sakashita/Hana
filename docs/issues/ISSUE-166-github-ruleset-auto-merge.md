---
id: ISSUE-166
title: GitHub Rulesetと安全なAuto-mergeを有効化する
priority: P0
status: in_progress
size: M
created_at: 2026-08-04
github_issue: 338
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-166: GitHub Rulesetと安全なAuto-mergeを有効化する

## 目的 (Why)

mainへの変更をPRと最新SHAの必須checkで保護し、ISSUE-167の人間GO後に限って低リスクPRへ
GitHub native auto-mergeを予約できる土台を作る。

## スコープ (What)

- main向けRuleset、repository merge settings、required checkのversioned契約
- 最新SHAへ結び付くspecialist reviewとmerge eligibilityのGitHub Actions check
- 設定前snapshot、dry-run、適用、postflight、無効化、rollbackのstatus-only手順
- 追加commit、check rerun、review invalidation、merge conflictの合成検証

## やらないこと (Out of Scope)

- ISSUE-167の5 PR dry-runとauto-merge予約
- production deploy、実DB migration、実ユーザーデータ、secretの読取・変更
- Ruleset bypass、admin相当automation token、CI bypass

## 影響範囲

- `.github/workflows/`のPR checkと手動attestation workflow
- `scripts/loop-engineer/`のGitHub gate評価と設定契約
- `docs/api-driven-development/`のdesired state、snapshot、rollback runbook
- GitHub repository settingsとmain Ruleset（人間承認後のみ）

OpenAPI、DB、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [ ] mainへの変更をPR経由に限定し、force pushとbranch deletionを禁止する
- [ ] `pr-gate`、OpenAPI validate、Issue registry、merge eligibility、specialist review gateをrequired checkにする
- [ ] required human approval countを0にし、最新SHAの専門review gateを機械証拠にする
- [ ] native auto-mergeを許可し、merge方式をsquashだけにする
- [ ] Loop Engineerは即時mergeせず、ISSUE-167の人間GOまではauto-mergeを予約しない
- [ ] `HUMAN_REQUIRED`と`HOLD`ではauto-merge予約を許可しない
- [ ] 追加commit、check rerun、review invalidation、merge conflictをfail-closedで扱う
- [ ] automation tokenへRuleset bypass、Administration、secret読取権限を与えない
- [ ] 設定前snapshot、変更、無効化、rollback後確認をstatus-onlyで記録する
- [ ] production deployと実DB migrationをmergeから分離し、個別の人間承認を維持する

## セキュリティ・プライバシー考慮

GitHubへ渡すreview証跡はIssue ID、PR番号、SHA、role、round、finding件数、固定status/reasonだけにする。
PR本文、コメント、prompt、実ユーザーデータ、画像情報、storage key、生成本文、secretはworkflow input、
artifact、logへ含めない。Rulesetとrepository settingの適用はHUMAN_REQUIREDとする。

## 参考

- GitHub Issue #338
- ADR-0017
- ISSUE-163 / ISSUE-164 / ISSUE-165 / ISSUE-167
- `docs/api-driven-development/codex-automation-runbook.md`
