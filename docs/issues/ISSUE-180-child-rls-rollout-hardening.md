---
id: ISSUE-180
title: children RLS rollout境界とmigration復旧をhardeningする
priority: P0
status: blocked
size: M+
created_at: 2026-08-06
github_issue: 365
release_gate: database_security
requires_human_review:
  - security
  - database
---

# ISSUE-180: children RLS rollout境界とmigration復旧をhardeningする

## 目的 (Why)

PR #341が第5巡の専門レビューでTerminal HOLDとなったため、実装を後継Issueへ引き継ぎ、
children RLS tracerを未承認環境で安全なdefault-off境界と検証可能な復旧契約へ改める。

## スコープ (What)

- 未cutover環境では既存のRoute所有権チェック付きDB経路を維持する
- 明示cutover時だけ`hana_child_runtime`とrequest-scoped RLSを使う
- runtime接続の`session_user`、role属性、membershipをtransaction内で検証する
- migration preflightでruntimeの直接ACLとapplication object ownershipをfail closedで拒否する
- rollback/reapplyでPrisma migration履歴を明示し、誤った自動再適用期待を排除する
- unit、Route integration、合成PostgreSQL、CI、ADR/runbookを更新する

## やらないこと (Out of Scope)

- stagingまたはproductionへのmigration適用
- 実ユーザーデータや資格情報の利用
- OpenAPIの403/404契約変更
- PR #361およびISSUE-174〜179の変更
- auto-mergeの予約

## 影響範囲

- children CRUDのDB dispatcherとRoute Handler
- children RLSのruntime scopeとmigration preflight
- 合成PostgreSQLのrollback/reapply検証とPR gate
- DB setup、認可、セキュリティ文書、ADR-0016、cutover runbook

OpenAPIの公開契約と生成API型は変更しない。

## 受け入れ条件 (Acceptance Criteria)

- [x] cutover未設定または`route`でchildren CRUDが既存の所有権契約を保ち、`CHILD_DATABASE_URL`未設定でも500にならない
- [x] `rls`では専用URL欠落と誤ったruntime資格情報を処理前に拒否し、特権経路へfallbackしない
- [x] RLS有効時にUser AからUser BへのSELECT、UPDATE、DELETE、INSERTをDB層で拒否する
- [x] runtimeにrole/database設定、parameter ACL、許可外database/public直接ACL、またはapplication object ownershipがあるmigration preflightを拒否し、DB状態を不変に保つ
- [x] rollback/reapplyリハーサルが`_prisma_migrations`の状態と`db:migrate:deploy`のno-opを明示して最終状態を検証する
- [x] 既存のforeign 403 / missing 404契約、PII非出力、Route先頭の認証を回帰させない
- [x] `pnpm openapi:lint`、`pnpm openapi:gen`、`pnpm pr:gate`、合成DB検証が成功する

マージには最新head SHAで最大3巡以内の独立専門レビューがすべてGOとなり、手動マージ条件を満たすことを別途要求する。

## セキュリティ・プライバシー考慮

合成DBだけを使い、接続URL、role password、row内容をログや証跡へ出さない。
runtime検証とmigration検証は固定reason IDでfail closedにし、mutationの自動retryを行わない。

## 参考

- GitHub Issue #365
- PR #341 / GitHub Issue #321
- ADR-0016
- ADR-0017

## 後継

PR #366は第3巡security reviewで追加findingが発生したため、mergeせず終了する。
target guardと実効parameter ACLのclosureはISSUE-181 / GitHub #367へ引き継ぐ。
