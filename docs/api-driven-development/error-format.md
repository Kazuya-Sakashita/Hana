# エラー形式: RFC 9457 Problem Details

> Hana のすべてのエラー応答が従う共通フォーマット。
> このドキュメントの規約に従って `reason` を発行・分岐する。

---

## 1. なぜ RFC 9457 なのか

- **業界標準**: `Content-Type: application/problem+json` は IETF 標準（[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)）
- **拡張可能**: 標準フィールド（type / title / status / detail / instance）に独自フィールド（`reason`, `errors[]`）を足せる
- **クライアント分岐に強い**: 自然文（`detail`）ではなく安定 ID（`reason`）で分岐できる
- **AI フレンドリ**: 構造が決まっているので Claude Code / OpenAPI ツールがエラー応答を生成しやすい

詳細な採用理由は ADR-0003 を参照。

---

## 2. 応答形式

すべて `Content-Type: application/problem+json` を返す。

```json
{
  "type": "https://hana.app/problems/validation-error",
  "title": "Validation Error",
  "status": 422,
  "detail": "入力内容に誤りがあります",
  "reason": "validation_error",
  "instance": "req_01HXYZABCDEFG",
  "errors": [{ "path": "body.name", "reason": "required", "message": "必須項目です" }]
}
```

| フィールド | 必須 | 用途                                                                        |
| ---------- | ---- | --------------------------------------------------------------------------- |
| `type`     | ✅   | エラー種別の安定 URI。`https://hana.app/problems/<reason-kebab>` 形式       |
| `title`    | ✅   | 人間向けの短い英語タイトル。`type` に対して安定。クライアントが UI で参照可 |
| `status`   | ✅   | HTTP ステータスコード。レスポンスの実ステータスと一致                       |
| `reason`   | ✅   | **クライアント分岐用 ID（snake_case）**。Hana 固有拡張                      |
| `detail`   | 任意 | このインスタンス固有のメッセージ。ユーザー表示可                            |
| `instance` | 任意 | リクエスト ID。サポート問い合わせのトレースに使う                           |
| `errors[]` | 任意 | フィールド単位のエラー（バリデーション時）                                  |

---

## 3. クライアントの分岐ロジック

**鉄則: `reason` でだけ分岐する。**

```ts
// ✅ Good
if (problem.reason === 'token_expired') {
  await refreshAndRetry()
}

// ❌ Bad — 自然文での分岐は壊れやすい
if (problem.detail.includes('期限')) {
  await refreshAndRetry()
}

// ❌ Bad — status だけだと細分化できない
if (problem.status === 401) {
  /* どの 401 か区別できない */
}
```

---

## 4. `reason` の名前空間ルール

### フォーマット

- **snake_case**（`/^[a-z][a-z0-9_]*$/`）
- 機能プレフィクスは原則不要だが、リソース固有のものは `<resource>_<state>` を推奨
  - 例: `child_not_found`, `image_too_large`, `memory_deleted`
- 汎用の reason はプレフィクス無し（`validation_error`, `rate_limited`）

### 命名の指針

| やる                          | やらない                                        |
| ----------------------------- | ----------------------------------------------- |
| 状態を表す名詞・動詞過去分詞  | 動作命令形（`do_login`）                        |
| 短く具体的（`token_expired`） | 抽象的（`some_error`）                          |
| 機械可読（snake_case）        | 表現を変える（`tokenExpired`, `token-expired`） |

### `reason` の追加手順

1. **既存の reason で表現できないかを確認**（下表）
2. 表現できなければ `docs/api-driven-development/error-format.md` の表に追加
3. OpenAPI の該当 `responses` に example を追加
4. ADR が必要な変更（広範な意味変化）は ADR-NNNN を起こす

---

## 5. HTTP ステータスとの対応表

| Status | 既定 `reason`              | 用途                              |
| ------ | -------------------------- | --------------------------------- |
| 400    | `bad_request`              | JSON 構文不正、必須ヘッダ欠如など |
| 401    | `unauthorized`             | 認証情報なし・無効                |
| 401    | `token_expired`            | アクセストークンの有効期限切れ    |
| 403    | `forbidden`                | 認可拒否（他人のリソース含む）    |
| 404    | `not_found`                | 自分のリソースが見つからない      |
| 409    | `email_already_registered` | メール重複（auth）                |
| 409    | `image_already_linked`     | 保存済み画像の削除競合            |
| 422    | `validation_error`         | フィールドバリデーション失敗      |
| 429    | `rate_limited`             | 汎用レート制限                    |
| 429    | `ai_quota_exceeded`        | AI 生成回数上限                   |
| 500    | `internal_server_error`    | サーバ内部エラー（固定文言）      |

新しい `reason` を追加するときは、上の表に必ず追記する。

---

## 6. フィールド単位エラー（`errors[]`）

バリデーションエラー（主に 422）で用いる。

```json
{
  "reason": "validation_error",
  "errors": [
    { "path": "body.name", "reason": "required", "message": "必須項目です" },
    {
      "path": "body.birthdate",
      "reason": "invalid_format",
      "message": "YYYY-MM-DD 形式で入力してください"
    }
  ]
}
```

### `path` のフォーマット

- `body.<field>` / `query.<field>` / `path.<field>` / `header.<field>`
- ネストは `body.images[0].id` のように JSON Pointer 風

### `errors[].reason` の語彙

`required`, `invalid_format`, `too_long`, `too_short`, `out_of_range`, `not_unique`, `not_allowed`

---

## 7. 「他人のリソース」を扱うときの 403 vs 404 ポリシー

| ケース                        | 返すべき           | 理由                   |
| ----------------------------- | ------------------ | ---------------------- |
| 自分の childId だが存在しない | 404 `not_found`    | 普通の Not Found       |
| 他人の childId                | 403 `forbidden`    | 存在の有無を漏らさない |
| 認証が無い                    | 401 `unauthorized` | 認可以前の問題         |

→ 「他人の存在の有無」が漏れるのを構造的に防ぐ。

---

## 8. 5xx でやってはいけないこと

- スタックトレース・例外メッセージを `detail` に含めない
- DB のテーブル名・カラム名・SQL を含めない
- `detail` は **固定文言**（"サーバ内部で問題が発生しました"）
- 内部詳細は `instance`（request_id）でサーバログを引いて調べる

---

## 9. ログとの関係

- ProblemDetails の `instance` をサーバログの request_id と一致させる
- ログには **`type` / `reason` / `status` / `instance` のみ** を出してよい
- `detail` の自由文はログに残してよい（ただし PII を含めないことを実装で担保）
- リクエスト body は **絶対に出さない**（CLAUDE.md §7 参照）

---

## 10. クライアント実装ヒント

- `application/problem+json` を受けたら共通の `ApiError` 型に変換して throw する
- `ApiError.reason` を `as const` 文字列の union で型付ける（生成型で代用可）
- TanStack Query の `onError` で `reason` を見て UI 分岐 / トースト分岐 / リトライ判定

---

## 11. 参考

- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
- `docs/openapi/components/schemas/ProblemDetails.yaml`
- `docs/openapi/components/responses/*.yaml`
- `docs/adr/0003-rfc9457-problem-details.md`
- `CLAUDE.md` §6
