# 認証と認可

> Hana の認証 / 認可レイヤの設計と使い方。
> 詳しい採用判断は `docs/adr/0006-*` および `docs/adr/0007-*` を参照。

---

## 0. 全体像

- **認証**: Supabase Auth (Apple + Google、SNS-only)
- **セッション**: Supabase の cookie (`@supabase/ssr`)
- **認可**: Route Handler 層に集約 (RLS は Phase 2)
- **profile**: `auth.users` と 1:1 の `public.profiles` テーブル (lazy 作成)

---

## 1. Supabase クライアントの 2 系統

| 用途                               | ファイル                      | 中身                                       |
| ---------------------------------- | ----------------------------- | ------------------------------------------ |
| Server Components / Route Handlers | `src/lib/supabase/server.ts`  | `createServerClient` + Next.js `cookies()` |
| Client Components / hooks          | `src/lib/supabase/browser.ts` | `createBrowserClient`                      |

Server/Browser を混在させない。`server-only` パッケージで境界を強制している。

---

## 2. 現在のユーザーを取る

### Server Components / Route Handlers

```ts
import { getCurrentUser, requireUser } from '@/server/auth/current-user'

// null を許容するケース (ヘッダ表示など)
const user = await getCurrentUser()
if (user) console.log(user.displayName)

// 未認証なら ApiProblemError を throw (401 unauthorized)
const user2 = await requireUser()
```

### Client Components

Supabase Auth Helpers のフック (`useUser` 等) は使わず、必要なら React Query で
`/v1/me` を叩く方針 (型は OpenAPI 由来の生成型を使う)。
これは: クライアントからも常に `/v1/me` を経由することで、認可とバリデーションを
**サーバ側に一本化** するため。

---

## 3. 認可の規約

すべての Route Handler は **最初に `requireUser()`** を呼ぶ (公開エンドポイントを除く)。

```ts
// src/app/v1/children/route.ts (例)
export async function POST(req: Request) {
  try {
    const user = await requireUser()
    // ...
  } catch (e) {
    return toProblemResponse(e)
  }
}
```

他人のリソースを扱う場合は `requireOwnership(currentUserId, resourceUserId)`。
不一致なら 403 `forbidden` を throw する。

### 403 vs 404 の使い分け

- 自分のリソースが存在しない → **404 `not_found`**
- 他人のリソース → **403 `forbidden`** (存在の有無を漏らさない)
- 未認証 → **401 `unauthorized`**

詳細は `docs/api-driven-development/error-format.md` §7。

---

## 4. profile の lazy 作成

新規ユーザーが初めて `/v1/me` を叩いたタイミングで `public.profiles` 行を作成する。

```ts
// src/server/auth/current-user.ts
const profile = await prisma.profile.upsert({
  where: { id: user.id },
  create: { id: user.id },
  update: {},
})
```

理由: Supabase Auth の trigger を Phase 1 では使わない (cross-schema の制約)。
Phase 2 で SQL trigger + FK + RLS をまとめて入れる。

---

## 5. API クライアントとの連携

Browserから同一originの`/v1`を呼ぶ場合は、`@supabase/ssr`のsession cookieだけを送る。
CookieとBearer tokenを重ねると認証情報が二重になり、HTTP header size上限を超えるため、
Browser clientにはBearer tokenを解決・追加する機能を持たせない。

Server Componentsは自分自身の`/v1`へループバックせず、server feature関数を直接呼ぶ。
これにより、request-scoped cookieの再転送やBearerへの変換を別経路で実装しない。

```ts
// Browser
import { getBrowserApiClient } from '@/lib/api/browser-client'
const api = getBrowserApiClient()
const { data } = await api.GET('/me')
```

エラーは `ApiProblemError` として throw されるので `try/catch` で受ける。
詳細は `src/lib/api/README.md` および `docs/api-driven-development/api-client.md`。

### `/v1`の認証情報

Route HandlerはCookieセッションだけを認証情報として採用する（ADR-0015）。
未使用だったCookieからJWTを取り出してBearerへ変換するServer API clientは廃止する。

| リクエスト             | private operationの結果      |
| ---------------------- | ---------------------------- |
| 有効なCookieだけ       | 認証成功                     |
| Bearerだけ             | 401                          |
| 期限切れ・不正なCookie | 401                          |
| 有効なCookieとBearer   | Cookieを採用し、Bearerは無視 |

Cookie、Bearer、OAuth codeの値はログやテスト失敗メッセージへ出さない。

---

## 6. Sign in / Sign out フロー

| Step | ファイル                          | 役割                         |
| ---- | --------------------------------- | ---------------------------- |
| 1    | `/sign-in` (page.tsx)             | "Google でサインイン" ボタン |
| 2    | Supabase が Google にリダイレクト | OAuth フロー                 |
| 3    | `/auth/callback` (route.ts)       | `code` を session に交換     |
| 4    | `/` (top page)                    | サインイン完了状態           |
| 5    | `/sign-out` (route.ts)            | session を全グローバル破棄   |

---

## 7. セキュリティチェックリスト (実装時に確認)

- [ ] Route Handler の最初で `requireUser()` を呼んだ (公開エンドポイントを除く)
- [ ] 他人のリソースに触る場合 `requireOwnership()` を通した
- [ ] `Authorization` ヘッダ / cookie の値をログに出していない
- [ ] `service_role` key を `NEXT_PUBLIC_*` に置いていない
- [ ] OAuth callback の `code` / `state` をログに出していない
- [ ] 404 vs 403 ポリシーを守っている (存在の有無を漏らさない)

---

## 8. 関連ドキュメント

- ADR-0004 (Supabase 採用)
- ADR-0006 (Supabase Auth + SNS-only)
- ADR-0007 (RLS Phase 2)
- `docs/api-driven-development/error-format.md` (`reason` の付け方、403 vs 404)
- `docs/api-driven-development/api-client.md` (API クライアント設計)
- `CLAUDE.md` §7 (PII / ログ)
