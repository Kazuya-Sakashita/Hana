# API クライアント設計規約

> Hana の API クライアント (`src/lib/api/`) の設計・使用規約。
> 実装の参考になる「最小例」と、避けるべきアンチパターンを記述する。

---

## 1. 目的

- 全画面 / hook / Route Handler 間通信で **同じ薄いラッパー** を使う
- 型は **OpenAPI 由来の生成型** だけを使う（手書き API 型禁止）
- `ApiProblemError` を投げ、UI は `reason` で分岐する
- **PII をログに出さない** ことをコンパイル時に担保する

---

## 2. ファイル構成

```text
src/lib/api/
├── client.ts          openapi-fetch ベースのクライアント生成
├── error.ts           ApiProblemError + 型ガード
├── logger.ts          PII を受け付けない構造化ロガー
├── request-id.ts      req_<uuid> 発行
├── generated/         OpenAPI から自動生成（直接編集禁止）
│   ├── schema.d.ts
│   └── README.md
└── README.md
```

---

## 3. `createApiClient` の使い方

```ts
import { createApiClient } from '@/lib/api/client'
import { createApiLogger } from '@/lib/api/logger'

export const api = createApiClient({
  baseUrl: '/v1',
  resolveAuthToken: async () => /* ISSUE-005 でトークン管理を実装 */ null,
  logger: createApiLogger({ level: 'info' }),
})
```

### `resolveAuthToken`

- 戻り値 `string | null | Promise<string | null>`
- `null` を返すと `Authorization` ヘッダを付けない（公開エンドポイント想定）
- 本 Issue ではインターフェースだけ整備。トークン保存・リフレッシュは **ISSUE-005** で実装

### `logger`

- 省略可。デフォルトでは `console.info` / `console.error` に構造化 JSON Lines を出す
- 独自の Sink を差し込みたい場合（Sentry など）は `createApiLogger({ sink })` を渡す

---

## 4. エラーハンドリング

```ts
import { ApiProblemError, isProblemReason } from '@/lib/api/error'

try {
  const { data } = await api.GET('/health')
  // data の型は OpenAPI から推論される
} catch (e) {
  if (isProblemReason(e, 'token_expired')) {
    await refreshAndRetry()
    return
  }
  if (e instanceof ApiProblemError) {
    showProblem(e.problem) // problem.title / problem.detail / problem.reason
    return
  }
  throw e
}
```

### 規約

- `data` と `error` を返す型はそのままだが、**Problem レスポンス時は middleware が throw する**
- `reason` でだけ分岐する（自然文 `detail` で分岐しない）
- `ApiProblemError.problem` の型は生成型 (`components['schemas']['ProblemDetails']`)

---

## 5. ロガーの安全性

`LogFields` は **closed object type** なので、誤って body をログに渡すと **コンパイルエラー** になる。

```ts
// ❌ コンパイルエラー
logger.info({ operation: 'GET /v1/me', method: 'GET', path: '/v1/me', body: { email: '...' } })
// Object literal may only specify known properties, and 'body' does not exist in type 'LogFields'.

// ✅ OK
logger.info({
  operation: 'GET /v1/me',
  method: 'GET',
  path: '/v1/me',
  status: 200,
  elapsed_ms: 12,
  request_id: 'req_xxxxxxxx-...',
  user_id_hash: 'abcd1234',
})
```

### 出してよいフィールド

- `operation` (例: `GET /v1/health`)
- `method` (`GET` | `POST` | `PUT` | `PATCH` | `DELETE`)
- `path`
- `status`
- `elapsed_ms`
- `request_id`
- `user_id_hash` (生の user_id ではなく **ハッシュ済み**)
- `reason` (ProblemDetails.reason)

### 出してはいけないもの

- request / response body
- メールアドレス、氏名、生年月日
- 画像 URL、storage_key
- AI 生成テキスト
- `Authorization` ヘッダ
- 生の user_id

---

## 6. リクエスト ID

- すべてのリクエストに `X-Request-Id` を自動付与（クライアント発行 UUID、`req_` プレフィクス）
- サーバ側はこれを ProblemDetails.instance に詰める（ISSUE-005 以降のサーバ実装で対応）
- ログ・エラー・サポート問い合わせのトレースに使う

---

## 7. Server Components / Route Handlers での利用

```ts
// app/some-page/page.tsx (Server Component)
import { api } from '@/lib/api/_internal/server-client'

export default async function Page() {
  const { data } = await api.GET('/health')
  return <pre>{data?.status}</pre>
}
```

> Server / Browser でトークン解決を分けるための実装パターンは **ISSUE-005** で具体化する。本 Issue ではインターフェースのみ確保。

---

## 8. テストの書き方

`createApiClient` は `fetch` を注入できるので、Vitest で簡単にモックできる。

```ts
import { vi } from 'vitest'
import { createApiClient } from '@/lib/api/client'

const fetchMock = vi.fn(
  async () =>
    new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
)

const client = createApiClient({
  baseUrl: 'https://api.example.test/v1',
  fetch: fetchMock as unknown as typeof globalThis.fetch,
})

const { data } = await client.GET('/health')
expect(data).toEqual({ status: 'ok' })
```

実例は `tests/unit/lib/api/client.test.ts` を参照。

---

## 9. アンチパターン

| アンチパターン                          | 理由                                                      |
| --------------------------------------- | --------------------------------------------------------- |
| 手書きで `ProblemDetails` 型を再定義    | 生成型 (`components['schemas']['ProblemDetails']`) を使う |
| `console.log(data)` で body を直接出す  | `logger.info({ ... })` 経由。body はログに残さない        |
| `error.message.includes('期限')` で分岐 | `isProblemReason(e, 'token_expired')` を使う              |
| `Authorization` を手で組み立てて fetch  | `resolveAuthToken` 経由で middleware に任せる             |
| `error` 戻り値だけで判定                | Problem は throw されるので `try/catch` で受ける          |

---

## 10. 参考

- `docs/api-driven-development/error-format.md` — `reason` の名前空間ルール
- `docs/api-driven-development/openapi-style-guide.md` — OpenAPI 命名規約
- `docs/issues/ISSUE-004-api-client-foundation.md`
- `CLAUDE.md` §7 — ログ・PII ポリシー
- [openapi-fetch](https://openapi-ts.dev/openapi-fetch/)
