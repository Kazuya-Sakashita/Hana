# 0003. エラー形式は RFC 9457 Problem Details に統一する

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

Hana のすべての API（v1）で、エラー応答のフォーマットを統一する必要がある。
個別エンドポイントで自由に決めると以下の問題が起きる:

- フロント側がエンドポイントごとに分岐ロジックを書き直す
- 自然文（日本語）でエラー判定するコードが増えてメッセージ変更で壊れる
- 5xx で意図せず内部情報（スタックトレース・SQL）を返してしまう
- AI ベンダー / 監視 SaaS との連携で構造化エラーが必要になる

候補:

- (A) RFC 9457 Problem Details（`application/problem+json`）
- (B) 独自 JSON フォーマット（`{ error: { code, message } }` 等）
- (C) JSON:API errors
- (D) GraphQL 流の `errors[]`

## Decision

**(A) RFC 9457 Problem Details** を採用する。

- Content-Type: `application/problem+json`
- 必須フィールド: `type`, `title`, `status`, `reason`
- 任意フィールド: `detail`, `instance`, `errors[]`
- `reason` を **Hana 独自拡張** として追加し、**クライアント分岐はこれだけを使う**
- すべての common error response（400/401/403/404/409/422/429/500）を OpenAPI components 化して再利用

詳細は `docs/api-driven-development/error-format.md`。

## Consequences

### 良い点

- IETF 標準なので退路がある（独自仕様にロックしない）
- OpenAPI / 監視 SaaS / ログ基盤との相性が良い
- `reason`（安定 ID）で分岐するので自然文の変更でクライアントが壊れない
- 5xx の固定文言ポリシーで意図しない情報漏洩を防げる
- Spectral / Redocly がこのフォーマットを assume したルールを持っており検査しやすい

### 悪い点 / 受容するコスト

- `reason` の語彙を Hana 側で維持する必要がある（`error-format.md` の表）
- `application/problem+json` を扱うクライアントヘルパが必要（薄いラッパーで対応）
- フィールド単位エラー（`errors[]`）の構造を全実装で揃える必要がある

これらは「自然文分岐のバグ」と引き換えに受容する。

## Implementation Notes

- OpenAPI: `docs/openapi/components/schemas/ProblemDetails.yaml` を `$ref` で全エラー応答が参照
- 共通エラー応答: `docs/openapi/components/responses/{BadRequest,Unauthorized,Forbidden,NotFound,Conflict,UnprocessableEntity,TooManyRequests,InternalServerError}.yaml`
- Spectral カスタムルール `hana-error-content-type` で 4xx/5xx が `application/problem+json` を返すことを強制
- フロント側ラッパー（`src/lib/api/error.ts`）は **ISSUE-004** で実装

## References

- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- ADR-0001（OpenAPI を Single Source of Truth に）
- `docs/api-driven-development/error-format.md`
- `CLAUDE.md` §6
