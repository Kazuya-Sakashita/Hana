---
id: ISSUE-017
title: requireUser() を request-scoped cache 化 + profile upsert 廃止
priority: P0
status: review
size: S
created_at: 2026-05-26
parent: PERF
---

## 目的 (Why)

全 Route Handler で `requireUser()` → `getCurrentUser()` → `prisma.profile.upsert()` が走っており、
**1 リクエスト内で複数回呼ばれるルートでは DB 往復が無駄に発生** している。

特に `/v1/children/[childId]` や `/v1/memories/[memoryId]` は `loadChild()` などで二重に user 取得をしており、
1 API 呼び出しあたり 100〜200ms のロスがある。

---

## スコープ (What)

### 修正

- [ ] `src/server/auth/current-user.ts` (`getCurrentUser` / `requireUser` の実体) を React 19 `cache()` でラップ
  - 同一 request 内では Supabase `auth.getUser()` + DB lookup が 1 回だけ走る
- [ ] `profile.upsert()` を **`findUnique → 存在しなければ create`** に置換
  - 既存ユーザーでは UPDATE 不要 (display_name は別ルートで更新)
  - 初回サインインでのみ INSERT する
- [ ] `loadChild()` などで `requireUser()` を 2 回呼んでいる箇所を **1 回に整理**

### やらないこと

- middleware への認証移行 (Phase 2、別 ISSUE)
- Supabase session の cookie パース層の最適化 (別 ISSUE)
- 認証スキーマ自体の変更

---

## 設計判断

### React 19 `cache()` を使う理由

- Next.js 16 App Router は React 19 を前提
- `cache()` は **同一 render scope 内** で deduplicate される (Server Component / Route Handler 内で共通)
- `unstable_cache` は永続キャッシュなので user-specific には不向き

### upsert を捨てる根拠

profile レコードは **OAuth callback** または **初回 `/v1/me`** で必ず作られる。
以降の全リクエストで UPSERT を走らせる意味がない (display_name 更新は別経路)。
`findUnique` (PK lookup) は超高速、`create` は初回のみ。

---

## 影響範囲

| 領域         | 影響                                                             |
| ------------ | ---------------------------------------------------------------- |
| OpenAPI      | なし                                                             |
| 生成型       | なし                                                             |
| データ       | なし (動作のみ変更)                                              |
| 画面         | なし (透過的)                                                    |
| API          | 全 Route Handler の認証 path                                     |
| テスト       | 既存 220 件 + 新規: 「同一 request 内で profile lookup が 1 回」 |
| CI           | typecheck / lint / format / build / test                         |
| ドキュメント | このIssueファイル                                                |
| 環境変数     | なし                                                             |

---

## 受け入れ条件

- [ ] `pnpm typecheck` / `lint` / `format:check` / `build` グリーン
- [ ] `pnpm test` 全件パス + 「同一 request 内で 1 回」 を verify する vitest
- [ ] dev で `DEBUG=prisma:query` (もしくは `log: ['query']`) を有効にして `/v1/memories` を叩き、`SELECT FROM profiles` が 1 回以下
- [ ] `/v1/memories?limit=50` の p50 が ISSUE-016 baseline から **-50ms 以上**

---

## 動作確認手順

```bash
pnpm dev
# 1. Prisma client の log を一時的に query 出力に
# 2. /v1/memories?limit=50 を curl で叩く
# 3. profile.findUnique が 1 回、UPSERT が 0 回であることを確認
# 4. /v1/memories/{id} を叩き、child + memory 取得時に user lookup が 1 回だけであることを確認
# 5. 初回サインイン (新規ユーザー) を OAuth で行い、profile が create されることを確認
```

---

## リスク

- `cache()` の scope が想定と違うと **user が混ざる重大バグ**
  - 緩和策: user_id を key にした test を必ず追加。 同一テスト内で 2 ユーザー切替で挙動確認
- 既存ユーザーで profile が無いケース (旧データ移行) → `findUnique → 無ければ create` で吸収

---

## 参考

- ISSUE-006 (Supabase Auth)
- ISSUE-016 (Perf baseline)
- React `cache()`: https://react.dev/reference/react/cache
