# 0005. ORM は Prisma を採用 (Supabase Postgres + adapter-pg)

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

ADR-0004 で Supabase Postgres を採用したが、TypeScript からどう叩くかは別問題。
個人開発で長期メンテできる ORM / クエリビルダを選ぶ必要がある。

候補 (回答時点で検討):

- (A) Drizzle ORM
- (B) Prisma (採用)
- (C) Kysely (raw 寄りクエリビルダ)
- (D) Supabase JS SDK のみ (ORM なし)

## Decision

**(B) Prisma 7.x** を採用する。

- `prisma` (CLI) で migrations / generate
- `@prisma/client` で runtime
- `@prisma/adapter-pg` + `pg` で Supabase Postgres へ接続
- `dotenv` で `prisma.config.ts` から `.env.local` / `.env` を明示ロード

## Consequences

### 良い点

- TypeScript 統合の質が高い (auto-completion / 型推論)
- ドキュメント・コミュニティが厚く、個人開発で詰まったときの情報が多い
- migrations を schema-first で書ける (CLAUDE.md の "OpenAPI が真実" と同じ思想)
- Supabase / Neon どちらに移行しても動く
- Prisma Studio が無料で付いてくる (生 SQL を書かずに DB を覗ける)

### 悪い点 / 受容するコスト

- Prisma Client のバンドルサイズが大きい (Drizzle と比較すると数 MB 増)
- Prisma 7 は破壊変更が多い:
  - `schema.prisma` から `url` / `directUrl` が消えた
  - `prisma.config.ts` 必須
  - `PrismaClient` 生成時に adapter 注入が必須
  - `.env` 自動ロードが消えた (dotenv を明示)
- Schema Engine (migrations) は pgbouncer を嫌う → DIRECT_URL (port 5432) を併用する必要あり
- Edge runtime での動作には追加の工夫が必要 (本 MVP では Vercel Functions の Node.js runtime を使うので問題なし)

これらは Prisma の **開発体験の良さ** と引き換えに受容する。

## Implementation Notes

- `prisma/schema.prisma`: datasource は `provider = "postgresql"` のみ (Prisma 7 制約)
- `prisma.config.ts`: dotenv で env をロード後、`datasource.url = env('DIRECT_URL')` を指定 (Schema Engine 用)
- `src/server/db/prisma.ts`: `PrismaPg({ connectionString: process.env.DATABASE_URL })` を adapter として渡す
- dev のホットリロードでは `globalThis.__prisma` にキャッシュして複数インスタンス化を回避
- 接続失敗時のエラーメッセージから password を除去する `sanitizeDbError` を併設 (`src/server/db/sanitize-error.ts`)

## References

- ISSUE-005 (本 ADR を採用する Issue)
- ADR-0004 (Supabase 採用)
- [Prisma 7 release notes](https://www.prisma.io/blog)
- [Prisma + Supabase guide](https://www.prisma.io/docs/orm/overview/databases/supabase)
- [Prisma adapter-pg](https://www.prisma.io/docs/orm/overview/databases/database-drivers)
