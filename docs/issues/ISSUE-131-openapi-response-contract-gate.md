---
id: ISSUE-131
title: Route HandlerレスポンスをOpenAPIスキーマで検証するCIゲートを追加する
priority: P1
status: review
size: M
created_at: 2026-07-30
---

## 目的 (Why)

Route Handler の status、Content-Type、成功 body、ProblemDetails が OpenAPI からずれた場合に PR gate で検出する。

## スコープ (What)

- 統合テストで得た Response と OpenAPI の照合ヘルパー
- 成功、認証、validation、not-found の代表応答
- `openapi:response-contract` コマンドと `pr:gate` への組み込み

## やらないこと (Out of Scope)

- staging への Schemathesis 実行
- 全エンドポイントの E2E 化
- OpenAPI 3.1 からの移行

## 影響範囲

- children Route Handler 統合テスト
- OpenAPI 外部 `$ref` のテスト時解決
- CI / PR gate の実行時間

## 受け入れ条件 (Acceptance Criteria)

- [ ] status と Content-Type を OpenAPI 宣言へ照合する
- [ ] 成功 JSON と ProblemDetails の必須 schema を検証する
- [ ] 未宣言 status や必須項目欠落でテストが失敗する
- [ ] 外部 DB、Supabase、Anthropic へ接続せず mock で完結する
- [ ] 代表的な成功・認証・validation・not-found 応答を覆う
- [ ] `pnpm pr:gate` へ組み込む

## セキュリティ・プライバシー考慮

検証は合成データと mock のみを使い、レスポンス body をCIログへ出力しない。失敗報告はJSON pointerと契約差分だけに限定する。

## Review gates

Test Architecture / API Design / Reliability レビュー、`pnpm pr:gate`、`git diff --check`。
