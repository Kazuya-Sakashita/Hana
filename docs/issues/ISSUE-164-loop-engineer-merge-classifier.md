---
id: ISSUE-164
title: PRの自動マージ適格性を機械判定する
priority: P1
status: review
size: M
created_at: 2026-08-04
github_issue: 336
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-164: PRの自動マージ適格性を機械判定する

## 目的 (Why)

ADR-0017の承認境界を、PR本文や実ユーザーデータを読まずに固定schemaのstatus-only入力から
再現可能に判定する。低risk条件をすべて満たす場合だけ自動マージ候補とし、不明はHOLDにする。

## スコープ (What)

- `AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`と固定reasonの出力schema
- Issue ID、PR番号、head SHA、固定change area、必須check状態、review gate状態だけの入力schema
- `HOLD > HUMAN_REQUIRED > AUTO_MERGE_ELIGIBLE`の純粋・決定的な分類
- stdin JSONを読むread-only CLIと副作用のないcontract mode
- allow、human-required、hold、stale SHA、追加commit、unknown fieldのunit / contract test
- `pnpm pr:gate`へのcontract mode統合

## やらないこと (Out of Scope)

- GitHub API、PR本文、コメント、review本文、label本文の取得
- 専門reviewerの起動・集約・最新SHA gate（ISSUE-165）
- GitHub Ruleset、repository setting、Auto-mergeの変更（ISSUE-166）
- dry-run、auto-merge予約、merge、release、deploy（ISSUE-167）
- 実DB、実ユーザーデータ、実画像、secret、vendor設定へのアクセス

## 影響範囲

- `scripts/loop-engineer/`の純粋分類器とread-only CLI
- `tests/unit/scripts/`のunit / CLI contract test
- `docs/api-driven-development/`のschema・reason契約
- `package.json`のQA commandと`pr:gate`
- `docs/issues/README.md`の生成結果

OpenAPI、生成型、アプリ、DB、Storage、GitHub設定、実環境には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] 判定結果を`AUTO_MERGE_ELIGIBLE`、`HUMAN_REQUIRED`、`HOLD`の固定reason付きschemaで出力する
- [x] Issue ID、PR番号、head SHA、変更領域、必須check状態、review gate状態だけを入力・証跡に使用する
- [x] acceptance criteria未完了、unrelated diff、merge conflict、CI未完了、review SHA不一致をHOLDにする
- [x] migration適用、destructive operation、実ユーザーデータ、production deploy、secret/vendor設定、breaking waiverをHUMAN_REQUIREDにする
- [x] 判定不能、未知field、未知change area、必要なrisk分類欠落をfail-closedにする
- [x] PR body、コメント本文、実ユーザー情報、画像、生成本文、secretをartifactやlogへ保存しない
- [x] allow、human-required、hold、stale SHA、追加commit後の再判定をunit / contract testで固定する
- [x] `pnpm pr:gate`へ副作用のないcontract modeとして統合する

## セキュリティ・プライバシー考慮

入力・出力はstatus-only allowlistで検証し、unknown fieldを保持せずHOLDにする。CLIはstdin以外の
外部入力を取得せず、network、GitHub API、filesystem write、child process、環境変数の読取を行わない。
判定証跡へ自由文、PR本文、コメント、prompt、実ユーザー情報、画像情報、生成本文、secretを含めない。

## 参考

- GitHub Issue #336
- ADR-0017
- `docs/api-driven-development/codex-automation-runbook.md`
- ISSUE-163 / ISSUE-165 / ISSUE-166 / ISSUE-167
