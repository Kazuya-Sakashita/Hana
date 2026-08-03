# OpenAPI スタイルガイド

> Hana の OpenAPI を書くときに守る命名・構造・記述ルール。
> 規約からの逸脱は ADR で根拠を残してから許可する。

---

## 1. バージョン

- **OpenAPI 3.1.0** を採用（JSON Schema 2020-12 互換）
- `$ref` で components を分割管理する

---

## 2. ファイル構成

```text
docs/openapi/
├── openapi.yaml                       エントリ（info / servers / security / paths / components 参照）
├── paths/                              機能別の paths（必要に応じて分割）
│   ├── auth.yaml
│   ├── children.yaml
│   ├── memories.yaml
│   ├── uploads.yaml
│   └── ai.yaml
├── components/
│   ├── securitySchemes.yaml
│   ├── schemas/
│   ├── responses/
│   ├── parameters/
│   └── headers/
└── examples/                          代表的なリクエスト/レスポンス例
```

`paths/*.yaml` は **ISSUE-005 以降** で追加する。本 Issue では `components/` のみ整備する。

---

## 3. paths

| ルール                     | 例                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 小文字                     | `/children` （NG: `/Children`）                                                                                         |
| 複数形（コレクション）     | `/memories` （NG: `/memory`）                                                                                           |
| ハイフン無し（複合語）     | `/uploads/presigned-url` は OK だが avoid。`/uploads/presignedUrl` ではなく `presignedurl` を避け、サブリソースに分ける |
| パスパラメータは camelCase | `/children/{childId}`                                                                                                   |
| バージョニング             | URL ベース。`/v1/...`（Route Handlers と一致）                                                                          |
| アクションは動詞回避       | `/memories/{id}/regenerate` のような RPC-like は AI 系のみ許可                                                          |

---

## 4. operationId

- **lowerCamel**、`動詞 + リソース`
- 動詞: `list`, `get`, `create`, `update`, `delete`, `generate`, `regenerate`, `invite`
- 例: `listMemories`, `getMemory`, `createMemory`, `updateMemory`, `deleteMemory`, `generateAiText`

Spectral ルール `hana-operationid-lower-camel` で強制。

---

## 5. schemas

- **UpperCamel**
- リスト応答は `<Resource>ListResponse`、ページング付きは `page` フィールドを含める
- 例: `Child`, `Memory`, `Image`, `MemoryListResponse`, `ProblemDetails`

```yaml
MemoryListResponse:
  type: object
  required: [data, page]
  properties:
    data:
      type: array
      items: { $ref: '#/components/schemas/Memory' }
    page:
      type: object
      required: [next_cursor]
      properties:
        next_cursor:
          type: string
          nullable: true
        total_count:
          type: integer
```

Spectral ルール `hana-schema-upper-camel` で強制。

---

## 6. プロパティ命名

- リクエスト/レスポンス body のフィールド: **snake_case**（既存 PRD §11 に合わせる）
  - 例: `child_id`, `image_ids`, `recorded_at`
- クエリパラメータ: **snake_case**（例: `child_id`, `next_cursor`）
- パスパラメータ: **camelCase**（例: `childId`, `memoryId`）— OpenAPI の慣習

理由: バックエンドの内部表現に揃え、フロントは生成型を経由するので大文字小文字差は型で吸収する。

---

## 7. 型と format

| 種別             | 型・format                                         |
| ---------------- | -------------------------------------------------- |
| ID               | `type: string, format: uuid`                       |
| 日付（日のみ）   | `type: string, format: date`（YYYY-MM-DD）         |
| 日時             | `type: string, format: date-time`（RFC3339 / UTC） |
| メール           | `type: string, format: email`                      |
| URL              | `type: string, format: uri`                        |
| バイナリ         | `type: string, format: binary`（multipart のみ）   |
| ファイルサイズ等 | `type: integer, minimum: 0`（バイト単位）          |

---

## 8. enum

- **snake_case の値**
- 必ず `description` でそれぞれの意味を書く
- 例: `role: viewer | editor`、`weather: sunny | cloudy | rainy | snowy`

---

## 9. 必須 / nullable

- OpenAPI 3.1 では nullable は `type: [string, 'null']` で表現する
- 「無くてもよい」と「null を許容する」は別物
  - 任意フィールド → `required` から外す
  - null を許容 → 上記の union 型
- 一覧応答の `next_cursor` は **任意ではなく nullable**（最終ページで明示的に null を返す）

---

## 10. description / examples

- すべての schema property に `description` を書く（warn 以上で検査）
- すべての response に `description` を書く（error）
- 各 schema / response に最低 1 つの `example` を置く（AI と人間の両方が読みやすくなる）
- **example は架空のデータ**。実ユーザー由来のデータを置かない

---

## 11. ページネーション

- すべての一覧 API で **カーソル方式**
- パラメータ: `limit` (`#/components/parameters/Limit`) + `cursor` (`#/components/parameters/Cursor`)
- 応答:
  ```yaml
  data: [...]
  page:
    next_cursor: string | null
    total_count: integer # 重ければ省略可
  ```

---

## 12. 認証 / 認可

- ルート `security: [{ cookieSession: [] }]` で全エンドポイント認証必須をデフォルト
- 公開エンドポイントのみ `security: []` で明示的にオプトアウト
- 認可（user_id 所有権チェック）は
  `route-auth-contract.yaml`、実装、契約テストで担保

---

## 13. エラー応答

- すべて `application/problem+json` + `ProblemDetails`
- 共通エラーは `components/responses/` を `$ref` する
- 詳細は [`error-format.md`](./error-format.md)

Spectral ルール `hana-error-content-type` で強制。

---

## 14. バージョニング

- **URL バージョニング**: `/v1/...`
- マイナー追加（互換）は `v1` のまま
- 破壊変更が必要になったら `v2` を別ディレクトリで並走（`docs/openapi/v2/`）
- `oasdiff` で破壊変更を検知し、ADR を起こしてから採用判断

---

## 15. tags

- 機能カテゴリで分類（例: `auth`, `children`, `memories`, `uploads`, `ai`, `family`, `meta`）
- すべての operation に少なくとも 1 つの tag を付ける（warn）

---

## 16. 禁止事項

- 個別エンドポイントで `ProblemDetails` を再定義しない（必ず `$ref`）
- フリーフォーマットなエラー（plain text、独自 JSON）を返さない
- パブリック URL を画像レスポンスに含めない
- 個人情報（氏名・メール・生年月日）を example に書かない
