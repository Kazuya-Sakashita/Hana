---
id: ISSUE-006
title: Supabase Auth 統合 (Google 先行、SNS-only)
priority: P0
status: review
size: M
created_at: 2026-05-14
---

## 目的 (Why)

ISSUE-007 以降のすべてのリソース API (children / memories / uploads / AI) が依存する
**認証・認可レイヤ** を確立する。

具体的に決めること:

- Supabase Auth で Google OAuth (Apple は ISSUE-006a) をどう叩くか
- Server Components / Route Handlers / Client Components のいずれからも
  「現在のユーザー」を取れる仕組み
- API クライアント (`src/lib/api/client.ts`) の `resolveAuthToken` を Supabase
  session に接続
- 認可: 「他人のリソースは見えない」ルールを **Route Handler 層** で組み込む
- DB の `profiles` テーブル (`auth.users` への 1:1 リレーション、Hana 固有プロフィール)
- `/v1/me` エンドポイント (現在のユーザー取得)
- AI 送信同意 (opt-in) の保持先 (profiles に `ai_consent_at: timestamptz | null`)

PRD §11 では email+password 自前管理だったが、SNS-only + Supabase Auth に変更
(ISSUE-005 で合意済み、本Issueの ADR-0006 で正式に明文化)。

---

## スコープ (What)

### 必要な外部設定 (kazuya 側で実施)

> **2026-05-14 方針変更**: Apple Developer 未取得のため、本Issueは **Google 先行**。
> Apple 統合は別途 **ISSUE-006a (後追い)** で扱う。

- [ ] **Google Cloud Console** で OAuth 2.0 クライアント作成
  - APIs & Services → Credentials → Create OAuth client ID → Web application
  - Authorized redirect URIs に `https://<supabase-ref>.supabase.co/auth/v1/callback` を追加
  - Client ID / Client secret を控える
- [ ] **Supabase ダッシュボード** → Authentication → Providers → Google を有効化
  - 上で取得した Client ID / Client secret を入力
- [ ] **Supabase Auth** → URL Configuration → **Redirect URLs** に
      `http://localhost:3000/auth/callback` を追加

### 依存

- [ ] `@supabase/supabase-js` を runtime dep に追加
- [ ] `@supabase/ssr` を runtime dep に追加 (Next.js Server Components / Route Handlers 用)

### Supabase クライアント (`src/lib/supabase/`)

責務を分離:

- [ ] `src/lib/supabase/server.ts` — Server Components / Route Handlers 用 (`createServerClient` + Next.js cookies)
- [ ] `src/lib/supabase/browser.ts` — Client Components 用 (`createBrowserClient`)
- [ ] `src/lib/supabase/types.ts` — `SupabaseUser` から Hana 固有 `AppUser` への変換

### `profiles` テーブル (初の Prisma migration)

```prisma
model Profile {
  id           String   @id @db.Uuid                      // = auth.users.id
  displayName  String?  @map("display_name")
  aiConsentAt  DateTime? @map("ai_consent_at") @db.Timestamptz
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt    DateTime @updatedAt        @map("updated_at") @db.Timestamptz

  @@map("profiles")
}
```

- [ ] `prisma/schema.prisma` に追加し `pnpm db:migrate --name add_profiles` で migration 作成
- [ ] **`auth.users` への FK は migration SQL に手書きで追加** (Prisma の cross-schema FK は弱いため)
  - `ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;`

### 認可: Route Handler 用ヘルパ (`src/server/auth/`)

- [ ] `getCurrentUser(): Promise<AppUser | null>` — server-only。cookie から session を読み、`profiles` row も含めて返す
- [ ] `requireUser(): Promise<AppUser>` — null なら `ApiProblemError` (401 `unauthorized`) を throw
- [ ] `requireOwnership(resourceUserId: string): void` — `currentUser.id !== resourceUserId` なら 403 `forbidden`
- [ ] ADR-0007 (RLS Phase 2 / 認可は Route Handler 層) を起こす

### OpenAPI 更新

- [ ] `docs/openapi/components/schemas/AppUser.yaml` (id / display_name / ai_consent_at / created_at)
- [ ] `docs/openapi/paths/me.yaml` で `GET /v1/me` を定義
- [ ] `openapi.yaml` から `$ref` で読み込む
- [ ] `pnpm openapi:lint` / `openapi:gen` 通過
- [ ] Spectral の `oas3-unused-component` を **再有効化** (実 API が paths を持つようになったため)

### Route Handler `/v1/me`

- [ ] `src/app/v1/me/route.ts` で GET ハンドラ
- [ ] `requireUser()` で認可
- [ ] 結果は `AppUser` 型に整形してレスポンス
- [ ] エラーは ProblemDetails 形式 (`application/problem+json`)

### API クライアント連携

- [ ] `src/lib/api/client.ts` の `resolveAuthToken` を Supabase session token を返す関数で実体化
- [ ] Server / Browser のそれぞれで適切な session 取得 (server: `createServerClient`, browser: `createBrowserClient`)

### Sign in / Sign out UI (最小)

- [ ] `src/app/sign-in/page.tsx` — Google ボタンのみのページ (Apple ボタンは ISSUE-006a で追加)
- [ ] `src/app/auth/callback/route.ts` — OAuth リダイレクト受け (code → session 交換)
- [ ] `src/app/sign-out/route.ts` — POST でセッション破棄
- [ ] スタイリングは **最小限**（後の Issue で integrate）

### テスト

- [ ] `tests/unit/server/auth/get-current-user.test.ts` — cookie から user を引く
- [ ] `tests/unit/server/auth/require-user.test.ts` — null 時に ApiProblemError を throw
- [ ] `tests/unit/server/auth/require-ownership.test.ts` — 他人の user_id で 403
- [ ] `tests/integration/v1/me.test.ts` — Route Handler を直接呼び出し (Vitest)
  - **DB は使わない**（Supabase API モックで完結）

### ドキュメント / ADR

- [ ] ADR-0006: Supabase Auth + SNS-only (email+password 廃止) の正式判断
  - 子どもの写真を扱うプロダクトでパスワード漏洩リスクを構造的に持たない設計
  - リセットフロー不要 / パスワード強度教育不要
  - 代替案: email+password を残す (受容コスト: bcrypt 等の管理、リセットメール基盤)
- [ ] ADR-0007: RLS は Phase 2、認可は Route Handler 層 (詳細は ISSUE-005 でも触れた)
  - 採用理由: Prisma との折り合いの良さ・テスト容易性
  - 受容コスト: defense-in-depth が浅くなる → Phase 2 で RLS 追加
- [ ] `docs/api-driven-development/auth.md` — Server / Browser での認証取得パターン、認可 helper の使い方
- [ ] README に sign-in 動作確認手順を追記

---

## やらないこと (Out of Scope)

- パスワード認証 / メール認証 (SNS-only)
- リフレッシュトークン自前管理 (Supabase が処理)
- ロールベースアクセス制御 (将来の家族共有で扱う)
- profile 編集 UI (別 Issue)
- AI 同意 opt-in UI (ISSUE-013 オンボーディングで扱う)
- 子どもプロフィール / 記録 / 画像 API (ISSUE-007 以降)
- 退会フロー (ISSUE-016)
- RLS の有効化 (Phase 2)
- メール変更 / アカウント連携の UI

---

## 影響範囲

| 領域         | 影響                                                                                  |
| ------------ | ------------------------------------------------------------------------------------- |
| OpenAPI      | `AppUser` schema 追加、`/v1/me` paths 追加、Spectral `oas3-unused-component` 再有効化 |
| 生成型       | `paths['/v1/me']`、`components['schemas']['AppUser']`                                 |
| 画面         | `/sign-in`、`/auth/callback`、`/sign-out` を最小実装                                  |
| データ       | **初回 DB migration** (`profiles` テーブル + `auth.users` への FK)                    |
| CI           | 既存 typecheck/lint/test/validate で担保 (DB を使うテストは加えない)                  |
| ドキュメント | ADR-0006 / 0007 / `auth.md` / README                                                  |
| 環境変数     | 既存の `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` を使用開始        |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] Google で sign-in できる (kazuya 環境で手動確認、Apple は ISSUE-006a)
- [ ] Sign-in 後に `/v1/me` が 200 + AppUser を返す
- [ ] Sign-in なしで `/v1/me` を叩くと 401 `unauthorized` + ProblemDetails
- [ ] 他人のリソース用 `requireOwnership` ヘルパが 403 `forbidden` を返す (ユニットテスト)
- [ ] `pnpm db:migrate` で `profiles` テーブルが作成される
- [ ] `pnpm openapi:lint` / `openapi:gen` 通過 (`unused-component` 警告も消える想定)
- [ ] `pnpm typecheck` / `lint` / `test` / `build` 通過
- [ ] ADR-0006 / 0007 accepted
- [ ] `docs/api-driven-development/auth.md` に Server / Browser 両方の取得パターン記載

---

## セキュリティ・プライバシー考慮

- [ ] **ログにメール / user_id を出さない**: `user_id_hash` (SHA-256 + project salt) のみログ可
- [ ] **Authorization ヘッダ / Cookie をログしない**: ロガーの `LogFields` 型で既に拒否済み (ISSUE-004)
- [ ] **profile.display_name は任意**: 子どもの本名を入れる UI 誘導をしない
- [ ] **OAuth callback の `state` / `code` パラメータをログに残さない**
- [ ] **service_role key を絶対にクライアント側に渡さない** (`NEXT_PUBLIC_*` プレフィクス禁止)
- [ ] **Sign-out で全 session を破棄** (Supabase の `signOut({ scope: 'global' })`)
- [ ] **AI 同意 (`ai_consent_at`) はサーバ側のみで更新可能** (OpenAPI で書き込み API を別途定義する Issue で扱う)
- [ ] **退会時の cascade 削除**: `profiles_id_fkey ... ON DELETE CASCADE` を migration SQL に明記

---

## 設計メモ

### Server / Browser の二系統に分ける理由

Server Components / Route Handlers は cookie ベースの session を読む必要があり、
Client Components は localStorage / cookie の両方を扱える Supabase JS の流儀。
両者を 1 つの client にしてしまうと環境依存の bug が出る。`@supabase/ssr` が
この区別をライブラリレベルで提供しているのでそれを採用する。

### `auth.users` への FK を migration SQL に手書きする理由

Prisma は schema.prisma 上で `auth` スキーマを直接参照する能力に制約がある。
Supabase の慣習に従い、`profiles.id` を `auth.users.id` への外部キーとして
**migration SQL に手書きで追加** する。

### RLS を Phase 2 に倒した受容コスト

- 認可ロジックが Route Handler 層に集中するため、コード境界の漏れがバグになり得る
- 代替策: Route Handler のすべてで `requireUser()` を呼ぶよう ESLint カスタムルール
  (Phase 2 で検討)
- 短期は **契約テスト (schemathesis 等) + ユニットテストで担保**

### Apple は ISSUE-006a で後追い (確定)

- Apple Developer 未取得のため本Issueは Google のみ
- 後追い ISSUE-006a で必要な作業:
  - Apple Developer Program 登録 (年 $99)
  - Service ID + Sign In with Apple Capability + Key 作成
  - Supabase ダッシュボードに Apple Provider の認証情報を登録
  - `src/app/sign-in/page.tsx` に Apple ボタンを追加
  - 本Issueの認証基盤 (auth helpers / Route Handler / API client 連携) はそのまま再利用

---

## 参考

- ISSUE-004 (API クライアント基盤、`resolveAuthToken`)
- ISSUE-005 (Prisma 基盤、`profiles` の初 migration はここで)
- ADR-0004 (Supabase 採用)
- `Hana_PRD_v1.md` §11 API 設計 (注: SNS-only に方針変更)
- `Hana_PRD_v1.md` §12 セキュリティ
- `CLAUDE.md` §7 (PII / ログ)
- `docs/api-driven-development/error-format.md` (`reason` の付け方)
- [Supabase Auth — Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Auth — Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Supabase Auth — Google](https://supabase.com/docs/guides/auth/social-login/auth-google)

---

## 実施結果 (2026-05-14)

### 作成・変更ファイル

- `package.json`: `@supabase/supabase-js@2.105.4` / `@supabase/ssr@0.10.3` 追加
- `prisma/schema.prisma`: `Profile` model 追加 (`id`/`display_name`/`ai_consent_at`/`created_at`/`updated_at`)
- `prisma/migrations/20260515030813_add_profiles/`: 初回 migration (FK は shadow DB 制約のため見送り、ADR-0007 に記載)
- `src/lib/supabase/{types,server,browser}.ts`: 環境変数読み取り + Server/Browser クライアント分離
- `src/lib/api/{server-client,browser-client}.ts`: `resolveAuthToken` を Supabase session に接続
- `src/server/auth/current-user.ts`: `getCurrentUser` / `requireUser` / `requireOwnership` (profile lazy upsert 含む)
- `src/server/api/problem-response.ts`: Route Handler 共通の Problem 変換ヘルパ
- `src/app/v1/me/route.ts`: `GET /v1/me`
- `src/app/sign-in/page.tsx`: Google ボタンの最小サインインページ
- `src/app/auth/callback/route.ts`: OAuth code → session 交換
- `src/app/sign-out/route.ts`: グローバル sign-out
- `docs/openapi/openapi.yaml`: `/me` を inline 追加、internal `#/components/responses/...` ref に統一
- `docs/openapi/components/schemas/AppUser.yaml`: 新規
- `.spectral.yaml`: `oas3-unused-component` を再有効化
- `docs/adr/0006-supabase-auth-sns-only.md`: 新規
- `docs/adr/0007-authz-at-route-handler-layer.md`: 新規
- `docs/api-driven-development/auth.md`: 新規
- `vitest.config.ts`: `server-only` / `client-only` を node 上で shim
- `tests/setup/server-only-shim.ts`: 空モジュール (Vitest 専用)
- `tests/unit/server/auth/current-user.test.ts`: 7 件
- `tests/integration/v1/me.test.ts`: 2 件

### 検証結果

- [x] `pnpm db:migrate` で `profiles` テーブル作成 (Supabase に反映済み)
- [x] `pnpm openapi:lint` / `openapi:bundle` / `openapi:gen` グリーン
- [x] `pnpm typecheck` グリーン
- [x] `pnpm lint` グリーン
- [x] `pnpm test` 32 件パス
- [x] `pnpm format:check` グリーン
- [x] `pnpm build` 成功 (Routes: `/`, `/_not-found`, `/auth/callback`, `/sign-in`, `/sign-out`, `/v1/me`)

### スコープ調整 (重要)

- **Apple は ISSUE-006a に後追い**: Apple Developer 未取得のため
- **`auth.users` への FK は migration から削除**: Prisma の shadow DB に auth スキーマが
  無く migration 適用に失敗するため。代わりに **profile を `getCurrentUser` で lazy upsert** する
  アプリ層パターンを採用。Phase 2 で SQL trigger + RLS + FK を Supabase 側に直接追加する想定
- **OpenAPI のパス分割を一旦戻し**: `paths/me.yaml` を inline 化。path-level `$ref` で Spectral
  が unevaluated-properties エラーを出すため。複数 path ができたら別 Issue で再分割

### kazuya 側で残っている作業 (動作確認に必要)

- [ ] Google Cloud Console で OAuth 2.0 クライアント作成
- [ ] Supabase ダッシュボードで Google Provider を有効化 + Client ID/Secret 登録
- [ ] Supabase Auth → URL Configuration に `http://localhost:3000/auth/callback` を追加
- [ ] `pnpm dev` で `/sign-in` → Google → `/v1/me` がユーザー情報を返すことを確認

### PR ドラフト

タイトル: `[ISSUE-006] Supabase Auth 統合 (Google, SNS-only) + /v1/me`
