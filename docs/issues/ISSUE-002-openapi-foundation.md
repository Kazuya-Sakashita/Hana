---
id: ISSUE-002
title: OpenAPI 基盤 & ProblemDetails 定義
priority: P0
status: todo
size: M
created_at: 2026-05-14
---

## 目的 (Why)

Hana のすべての API 設計の **出発点** となる `openapi.yaml` と、全エラー応答の **共通基底** となる ProblemDetails を確立する。

API 駆動開発は「最初に書く OpenAPI の質」で寿命が決まる。
ここで命名規約・エラー形式・認証スキーマ・例示方針を固めておくと、後続の Issue（children, memories, uploads, AI）が **同じ形** で量産できる。

---

## スコープ (What)

### OpenAPI ファイル骨組み

- [ ] `docs/openapi/openapi.yaml`（エントリ）を作成
  - `openapi: 3.1.0`
  - `info`（title, version, description, contact）
  - `servers`（dev / staging / prod を明示）
  - `paths: {}`（空でよい。次以降の Issue で追加）
  - `components` の参照だけ通しておく
  - `security: [{ bearerAuth: [] }]`（デフォルト認証必須）

### 共通コンポーネント

- [ ] `docs/openapi/components/securitySchemes.yaml`
  - `bearerAuth`（http / bearer / JWT）
- [ ] `docs/openapi/components/schemas/ProblemDetails.yaml`
  - 必須: `type`, `title`, `status`, `reason`
  - 任意: `detail`, `instance`, `errors[]`
- [ ] `docs/openapi/components/responses/`（共通エラーレスポンス）
  - `BadRequest` (400)
  - `Unauthorized` (401)
  - `Forbidden` (403)
  - `NotFound` (404)
  - `Conflict` (409)
  - `UnprocessableEntity` (422)
  - `TooManyRequests` (429)
  - `InternalServerError` (500)
  - すべて `application/problem+json` + `ProblemDetails`
- [ ] `docs/openapi/components/parameters/`
  - `Limit`（カーソルページング用）
  - `Cursor`
  - `RequestId`（任意ヘッダ）
- [ ] `docs/openapi/examples/` に最低 1 つの ProblemDetails 例

### ツール導入

- [ ] `@redocly/cli` インストール
- [ ] `@stoplight/spectral-cli` インストール + `.spectral.yaml`（命名ルール検証）
- [ ] `package.json` に scripts 追加
  - `openapi:lint`
  - `openapi:bundle`
- [ ] CI: `.github/workflows/openapi-validate.yml`
  - `npm run openapi:lint` を必須化

### ドキュメント

- [ ] `docs/api-driven-development/openapi-style-guide.md`
  - paths / operationId / schemas / enum / 日時 / ID / examples / 命名規約
- [ ] `docs/api-driven-development/error-format.md`
  - RFC9457 解説
  - `reason` 値の名前空間ルール（snake_case、機能プレフィクス）
  - HTTP status と `reason` のマッピング表
  - 既存 reason 一覧（成長させていく）
- [ ] `docs/adr/0002-rfc9457-problem-details.md`

---

## やらないこと (Out of Scope)

- 個別エンドポイントの追加（→ ISSUE-005 以降）
- 型生成パイプライン（→ ISSUE-003）
- 実装コード（API クライアント / サーバ）

---

## 影響範囲

| 領域 | 影響 |
|---|---|
| OpenAPI | **新規作成**（骨組みと共通コンポーネント） |
| 生成型 | 未だ無し（ISSUE-003 で導入） |
| 画面 | なし |
| データ | なし |
| CI | OpenAPI lint を新規追加 |
| ドキュメント | スタイルガイド / エラー形式 / ADR 0002 |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `docs/openapi/openapi.yaml` が存在し、`npm run openapi:lint` が通る
- [ ] `npm run openapi:bundle` でエラーなく単一ファイルが生成される
- [ ] `ProblemDetails` スキーマが定義され、`type` / `title` / `status` / `reason` が必須
- [ ] 共通エラーレスポンス（400/401/403/404/409/422/429/500）が `application/problem+json` で `ProblemDetails` を参照している
- [ ] `bearerAuth` が `securitySchemes` に定義され、ルート `security` に登録されている
- [ ] Spectral のカスタムルールで下記が検証される
  - operationId が lowerCamel
  - paths が小文字
  - すべての response に description がある
  - すべての schema property に description がある（warn 以上）
- [ ] `docs/api-driven-development/error-format.md` に `reason` の付け方ルールが書かれている
- [ ] `docs/api-driven-development/openapi-style-guide.md` に命名規約が書かれている
- [ ] `docs/adr/0002-rfc9457-problem-details.md` が accepted

---

## セキュリティ・プライバシー考慮

- [ ] ProblemDetails の `detail` フィールドに **個人情報を含めない** ことを style guide に明記
- [ ] エラーメッセージに DB のテーブル名・カラム名・スタック情報を含めない
- [ ] `instance`（request_id）は安全な ID（UUID / ULID）であり、user_id を含めない
- [ ] 5xx のレスポンスは固定文言にし、内部情報を漏らさない
- [ ] OpenAPI に書く example はすべて **架空のデータ**（実ユーザー由来のサンプルを使わない）

---

## ProblemDetails 雛形（参考、最終形は実装時に決定）

```yaml
ProblemDetails:
  type: object
  required: [type, title, status, reason]
  properties:
    type:
      type: string
      format: uri
      description: エラー種別の安定 URI
      example: 'https://hana.app/problems/validation-error'
    title:
      type: string
      description: 人間向けの短い説明（変えない）
      example: 'Validation Error'
    status:
      type: integer
      minimum: 400
      maximum: 599
      example: 422
    detail:
      type: string
      description: このインスタンス固有のメッセージ（ユーザー表示可）
    instance:
      type: string
      description: リクエスト ID（サポート問い合わせに使う）
      example: 'req_01HXYZ...'
    reason:
      type: string
      description: クライアントが分岐に使う安定 ID（snake_case）
      example: 'validation_error'
    errors:
      type: array
      description: フィールド単位のエラー
      items:
        type: object
        required: [path, reason, message]
        properties:
          path: { type: string, example: 'body.name' }
          reason: { type: string, example: 'required' }
          message: { type: string, example: '必須項目です' }
```

---

## 参考

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
- `CLAUDE.md` §5, §6
- `docs/api-driven-development/README.md`
- `Hana_PRD_v1.md` §11 API 設計
