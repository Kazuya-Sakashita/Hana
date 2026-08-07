---
id: ISSUE-184
title: 専用App gateへchildren RLS実DB証跡を必須化する
priority: P0
status: review
size: M
created_at: 2026-08-07
github_issue: 373
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-184: 専用App gateへchildren RLS実DB証跡を必須化する

## 目的 (Why)

database変更を含むPRでは、attested exact head SHAに対するchildren所有者境界の実PostgreSQL証跡が
成功しない限り、専用GitHub Appの`pr-gate`を成功させない。

## スコープ (What)

- exact base/head Git treeのtrusted path分類と検証済みreview attestationのchange areaから実DB証跡の要否を導出する
- main固定controllerの候補jobでpin済みPostgreSQL 16を起動する
- database変更ではbootstrap、migration、children RLS実DBテストを`pnpm pr:gate`より先に実行する
- 標準`pr-gate` workflowのPostgreSQL imageと使用Actionを完全SHAへ固定する
- controller配線とsupply-chain固定をworkflow contract testで検証する

## やらないこと (Out of Scope)

- productionまたはstaging DBへの接続、migration、cutover
- GitHub App権限、Environment、Ruleset、repository settingsの変更
- auto-merge予約、required check bypass、PR branch上のcontroller実行
- API、アプリruntime、OpenAPI、実ユーザーデータの変更

## 影響範囲

- `.github/workflows/loop-engineer-merge-gates.yml`
- `.github/workflows/typecheck.yml`
- `tests/unit/app/`
- `docs/api-driven-development/loop-engineer-github-merge-controls/`
- `docs/issues/`

OpenAPI、migration、Storage、アプリruntimeには影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] exact base/head Git treeのDB-sensitive pathまたは検証済みDB change areaがあるとき実DB証跡を必須にする
- [x] DB証跡要否の欠落または不正値をcandidate jobでfail-closedにする
- [x] pin済みPostgreSQL上でbootstrap、migration、children RLS実DBテストを順に実行する
- [x] DB証跡スクリプトの欠落、失敗、timeout時は専用Appの`pr-gate`を成功させない
- [x] 標準`pr-gate`を最小権限、checkout credential非保持、Action完全SHA固定にする
- [x] workflow contract testと`pnpm pr:gate`が成功する
- [x] 合成fixtureだけを使用し、実DB、secret、実ユーザーデータへアクセスしない

## External merge conditions

以下はこのPR自身のcheckboxでは完了扱いにしない。

- current head SHAの専門レビューが必要人数分GOである
- current head SHAの標準checkがすべて成功する
- main固定controllerから専用Appの5 checkがすべて成功する
- 人間が手動squash mergeする
- merge後のmainをPR #372へ取り込み、証跡をfreshに再取得する

## Bootstrap sequence

このPRはmain固定controllerを先に導入し、ISSUE-151のscriptとmigrationは重複して取り込まない。
後続PR #372のcandidate headが`qa:issue151:db-bootstrap`と`qa:issue151:child-rls-db`を提供し、
このcontrollerが同じhead上で4段階の実DB証跡を実行する。scriptがないDB-sensitive candidateは
専用Appの`pr-gate`をfailureにし、#372より先へ進めない。

## セキュリティ・プライバシー考慮

DB要否は自由文やcaller booleanではなく、既存gate evaluatorが検証したstatus-only attestationから導出する。
未知、欠落、誤分類は`HOLD`とし、workflow input、log、artifactへreview本文、secret、実ユーザー情報を渡さない。
PostgreSQLは合成credentialと専用DBだけを使い、production migrationの人間承認境界を変更しない。

## Rollback

この修正を導入したsquash commitをrevertする。Ruleset、App権限、Environment、production DBは
変更しないため、別の設定rollbackやDB rollbackは行わない。

## 参考

- GitHub Issue #373
- GitHub Issue #371 / ISSUE-183
- ADR-0017
- ISSUE-166 / #338
- ISSUE-182 / #369
