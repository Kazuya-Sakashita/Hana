# `src/lib/api/`

Hana の API クライアント基盤。**薄い fetch ラッパー** + **ProblemDetails 型ガード** + **PII を構造的に出さないロガー**。

詳細な設計規約は [`docs/api-driven-development/api-client.md`](../../../docs/api-driven-development/api-client.md) を参照。

## 構成

| ファイル        | 役割                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------- |
| `client.ts`     | `openapi-fetch` ベースのクライアント生成 + middleware（X-Request-Id / ロギング / Problem 変換） |
| `error.ts`      | `ApiProblemError` クラス + `isApiProblemError` / `isProblemReason` / `isProblemDetails`         |
| `logger.ts`     | `LogFields` を closed object type にした構造化ロガー（PII を型で禁止）                          |
| `request-id.ts` | `req_<uuid>` の発行と判定                                                                       |
| `generated/`    | OpenAPI から自動生成された型（直接編集禁止）                                                    |

## 最小サンプル

```ts
import { createApiClient } from '@/lib/api/client'
import { isProblemReason } from '@/lib/api/error'

const api = createApiClient({
  baseUrl: '/v1',
})

try {
  const { data } = await api.GET('/health')
  console.log(data?.status) // 'ok'
} catch (e) {
  if (isProblemReason(e, 'unauthorized')) {
    // サインイン画面へ戻す
  }
  throw e
}
```

## やってはいけないこと

- 手書きで API 型を定義する → `@/lib/api/generated/schema` から import
- ロガーに body を渡す → `LogFields` で受け付けない（コンパイルエラー）
- `console.log` で API 結果を直接出す → 必ず `logger` 経由
- Browser clientへ`Authorization`を追加する → same-origin Cookieだけを使う
- `Authorization` ヘッダの値をログ・エラーに含める

詳細は [`docs/api-driven-development/api-client.md`](../../../docs/api-driven-development/api-client.md)。
