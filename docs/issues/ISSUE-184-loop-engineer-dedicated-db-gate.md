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

- exact base/head commitをGit Commits APIでtree SHAへ結合し、Markdown限定免除分類と検証済みreview attestationのchange areaから実DB証跡の要否を導出する
- main固定controllerの候補jobでpin済みPostgreSQL 16を起動する
- database変更ではbase SHAのtrusted harnessからbootstrap、candidate migration、children RLS実DB検証を`pnpm pr:gate`より先に実行する
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

- [x] exact base/head commit SHAから取得・照合したtree SHAで、明示Markdown以外の変更または検証済みDB change areaがあるとき実DB証跡を必須にする
- [x] DB証跡要否の欠落または不正値をcandidate jobでfail-closedにする
- [x] pin済みPostgreSQL上でtrusted bootstrap、candidate migration、trusted children RLS実DB検証を順に実行する
- [x] trusted scriptの欠落、artifact境界違反、失敗、timeout時は専用Appの`pr-gate`を成功させない
- [x] candidate package scriptのno-op化、alias rewiring、未知実行可能path、symlink artifactで証跡を迂回できない
- [x] policy述語・function ACL・全非system role catalog/membership・間接view/SECURITY DEFINER露出の改変をexact catalogとランダムfixture CRUDで拒否し、敵対的DB改変でverifierのfail-closedを実証する
- [x] DB証跡不要のcandidateではDB接続envを`pnpm pr:gate`へ渡さない
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

このPRはmain固定controllerと最小のtrusted DB harnessを先に導入し、ISSUE-151のproduct codeや
migrationは重複して取り込まない。後続PR #372のcandidate headはschemaとmigrationだけを供給し、
base SHAからcheckoutしたtrusted harnessがrole bootstrap、trusted Prisma CLIによるcandidate migration、
exact policy/ACL/role graphとowned/foreign/missing・owner CRUD・runtime直アクセス境界の直接検証を行う。
WITH CHECK改変、runtime直INSERT policy、追加LOGIN+BYPASSRLS role、authenticatedへのfunction EXECUTE、public/別schemaの所有者権限view、別schemaのSECURITY DEFINER関数、default ACL、推移SET ROLEの敵対的改変でもfail-closedを確認する。candidateとtrusted-controlは兄弟directoryへ分離し、
candidate dependency installとpackage scriptはDB証跡の後に実行し、
candidate側のQA scriptやpackage scriptをno-op化しても成功へ迂回できない。

## セキュリティ・プライバシー考慮

DB要否は自由文やcaller booleanではなく、既存gate evaluatorが検証したstatus-only attestationと、commit SHAからGit Commit APIで結合・照合したtrusted tree分類から導出する。
明示Markdown以外は安全側に倒し、alias/build設定、未知実行可能path、symlink、checkout外artifact、欠落、誤分類は`HOLD`とする。
trusted installはcandidateのpackage設定とinstall scriptを評価せず、workflow input、log、artifactへreview本文、secret、実ユーザー情報を渡さない。
PostgreSQLは固定したlocalhost、専用DB名、合成credentialだけを使う。DB証跡不要のcandidateには
DB接続envを渡さず、CIによるDB suiteの暗黙有効化を防ぐ。production migrationの人間承認境界は変更しない。

## Rollback

この修正を導入したsquash commitをrevertする。Ruleset、App権限、Environment、production DBは
変更しないため、別の設定rollbackやDB rollbackは行わない。

## 参考

- GitHub Issue #373
- GitHub Issue #371 / ISSUE-183
- ADR-0017
- ISSUE-166 / #338
- ISSUE-182 / #369
