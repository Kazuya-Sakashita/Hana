# 0015. `/v1` API認証はCookieセッションだけを採用する

- Status: accepted
- Date: 2026-08-03
- Deciders: kazuya
- Supersedes: OpenAPIと開発文書に残っていたBearer JWT必須の記述

## Context

Hanaのブラウザは`@supabase/ssr`が管理するcookieでセッションを送り、
Route Handlerは`cookies()`を渡したSupabase server clientの`auth.getUser()`で認証する。
一方、OpenAPIは`Authorization: Bearer`を必須と記述しており、実装と契約が一致していなかった。

CookieとBearerを重ねると同じ認証情報を二重に送り、header size上限へ達しやすくなる。
また、Route Handlerが参照しないBearerを対応済みと記述すると、クライアントが誤って
Bearer単独で呼び出す原因になる。

## Decision

Hanaの公開OpenAPIに含まれるprivate `/v1` operationは、Supabase Cookieセッションだけを
ユーザー認証情報として採用する。内部の定期運用endpointが使うmachine secretは本ADRの
対象外で、公開OpenAPIにも含めない。

| 提示された認証情報         | 結果                                     |
| -------------------------- | ---------------------------------------- |
| 有効なCookieだけ           | Cookieのユーザーとして認証する           |
| Bearerだけ                 | 対応しない。private operationは401を返す |
| 期限切れ・不正なCookie     | 401を返す                                |
| 有効なCookieとBearerの両方 | Cookieを正として認証し、Bearerは無視する |

- private operationのOpenAPI security schemeは`cookieSession`とする。
- public、匿名許容、退会receipt cookieのoperationは`security: []`で明示的に除外する。
- 退会receipt cookieはユーザーセッションではなく、受付結果1件だけを照合する専用資格情報である。
- Cookie名はSupabase project refを含み、サイズにより分割されるため、OpenAPIには論理名と
  `x-cookie-name-pattern`を併記する。
- Supabase browser clientがrefresh tokenを扱うため、session cookieは既定で`HttpOnly: false`である。
  `SameSite=Lax`を維持し、認証が必要なmutationはsame-origin UIからのみ呼ぶ。退会のような
  高影響操作は既存のOrigin検証と再認証を重ねる。
- Cookie値、Bearer値、response bodyをログやCI証跡へ出さない。

## Enforcement

- `docs/api-driven-development/route-auth-contract.yaml`で全operationのaccess、guard、
  ownership strategy、拒否statusを管理する。
- `pnpm openapi:auth-contract`はOpenAPI、対応表、Route Handlerの欠落・不一致を検出する。
- 全公開operationの成功応答と代表エラーは合成データだけで契約検証する。
- OpenAPI破壊変更はCIを失敗させ、理由・期限・承認者・限定scopeを持つwaiverだけを許可する。
  waiverはoasdiff report hashへ固定し、PR外で人間が付ける
  `openapi-breaking-approved` GitHub labelも必須とする。

## Consequences

### 良い点

- ブラウザ、Route Handler、OpenAPIの認証方式が一致する。
- 二重認証情報による431 header sizeエラーの再発面を減らせる。
- Route追加時に認証・所有権拒否方針の記載漏れをCIで検出できる。

### 受容する制約

- 外部クライアントがBearer単独でHanaのprivate `/v1` APIを呼ぶ用途は提供しない。
- XSSが成立した場合はsession tokenを読み取られ得るため、CSP、出力escape、依存監査を
  Cookie属性とは別の防御層として維持する。
- 将来その用途が必要になった場合は、Bearer検証・優先順位・CSRF境界を別ADRとOpenAPIで
  設計し、実装と契約テストを同時に追加する。

## References

- ADR-0006 (Supabase Auth + SNS-only)
- ADR-0007 (Route Handler層の認可)
- ISSUE-150 / GitHub Issue #320
- `docs/api-driven-development/auth.md`
- `docs/api-driven-development/route-auth-contract.yaml`
- [Supabase SSR Auth advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide)
