---
id: ISSUE-150
title: 認証方式と全Route応答契約をOpenAPIへ一致させる
priority: P1
status: review
size: M
created_at: 2026-08-03
github_issue: 320
release_gate: api_security
requires_human_review:
  - security
  - api
---

# ISSUE-150: 認証方式と全Route応答契約をOpenAPIへ一致させる

## 目的 (Why)

OpenAPIの認証記述、実装、全Routeの応答契約を一致させる。

## スコープ (What)

- cookie/Bearer認証契約のADRとOpenAPI
- private Routeの認証・所有権対応表
- 成功応答と代表エラーの契約検証
- 破壊変更waiverのCI契約

## やらないこと (Out of Scope)

- 実ユーザーデータを使う検証
- response bodyのCIログ出力

## 受け入れ条件 (Acceptance Criteria)

- [ ] cookie-only、Bearer-only、期限切れ、両方提示時の認証契約をADRとOpenAPIで明確にする
- [ ] 全private Routeについて認証と所有権拒否の対応表を作り、欠落をCIで検出する
- [ ] 全公開operationの成功応答と代表エラーについてstatus、Content-Type、schemaを検証する
- [ ] OpenAPI破壊変更はCIを失敗させ、承認済みwaiverだけ理由と期限付きで許可する
- [ ] 検証は合成データだけを使い、response bodyをCIログへ出さない

## セキュリティ・プライバシー考慮

認証・所有権拒否を合成データで検証し、bodyを証跡へ残さない。

## 参考

- GitHub Issue #320
