---
id: ISSUE-165
title: 複数専門サブエージェントの独立review gateを実装する
priority: P0
status: review
size: M
created_at: 2026-08-04
github_issue: 337
release_gate: development_governance
requires_human_review:
  - security
  - operations
---

# ISSUE-165: 複数専門サブエージェントの独立review gateを実装する

## 目的 (Why)

PRごとに角度の異なる専門reviewerを選び、同じ最新SHAを独立・read-onlyで確認した証跡だけを
最大3巡までfail-closedに集約する。

## スコープ (What)

- 固定change areaから必須3名と追加専門roleを選択する純粋review gate
- 並列枠に応じた決定的なwave
- finding schema、最新SHA、独立性、timeout、最大3巡の検証
- stdin JSONだけを読むread-only CLIと副作用のないcontract mode
- unit、CLI、repository contract testsと運用文書

## やらないこと (Out of Scope)

- reviewerを実行する外部agent API、GitHub API、PR本文・コメント・review本文の取得
- 実装、commit、push、PR変更、merge、Ruleset、auto-merge予約
- 実DB、実ユーザーデータ、実画像、secret、vendor、productionへのアクセス

## 影響範囲

- `scripts/loop-engineer/`の純粋review gateとCLI
- `tests/unit/scripts/`と`tests/unit/app/`のcontract tests
- `docs/api-driven-development/`のschema・運用契約
- `package.json`のQA commandと`pr:gate`

OpenAPI、DB、Storage、実環境には影響しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] 全PRでSpec/Acceptance、Implementation/Correctness、Test/Reliabilityの最低3レビューを必須にする
- [x] Auth/所有権、AI/Privacy、DB/Migration、API/OpenAPI、UI/A11y、Image/Storage、CI/Operationsを変更領域から追加選択する
- [x] 重要領域では4〜6名を選び、利用可能な並列枠に応じてwave実行できる
- [x] 初回reviewerへ他reviewerの出力を渡さず、独立コンテキストと同一diff/仕様で確認する
- [x] reviewerはread-onlyとし、実装・commit・push・merge権限を持たせない
- [x] findingにseverity、根拠、対象file/line、必要な修正、reviewed SHAを必須にする
- [x] Issue Captainは重複を統合しても少数意見を削除できず、判断不一致をHOLDへ送る
- [x] 追加commitで旧reviewを無効化し、fresh contextで再レビューする
- [x] 修正と再レビューは最大3巡とし、P0〜P2の未解決findingが1件でもあれば失敗する
- [x] prompt、レビュー証跡、ログへPII、実画像情報、生成本文、secretを残さない
- [x] reviewer不足、timeout、出力schema違反を成功扱いせずfail-closedにする

## セキュリティ・プライバシー考慮

入力はallowlistで検証し、unknown fieldを保持しない。trusted orchestrator由来の非PII reviewer instance
IDはrole間の一意性検証だけに使い、保存・出力しない。出力はrole、SHA、round、finding件数、固定statusと
reasonに限定する。CLIはstdin以外の外部入力、network、環境変数、filesystem writeを使用しない。

## 参考

- GitHub Issue #337
- ADR-0017
- `docs/api-driven-development/loop-engineer-specialist-review-gate.md`
- ISSUE-163 / ISSUE-164 / ISSUE-166 / ISSUE-167
