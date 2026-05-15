---
id: ISSUE-005
title: Supabase + Prisma 基盤 (DB 接続・スキーマ・migrations)
priority: P0
status: review
size: M
created_at: 2026-05-14
---

## 目的 (Why)

ISSUE-006 (Supabase Auth 統合) と ISSUE-007 以降の DB 永続化レイヤ全体が依存する **データベース基盤** を整える。

ここで決めること:

- Supabase をどう接続するか (リモート前提 / 環境変数の形)
- Prisma で **スキーマファイル・migrations・型生成** を回す仕組み
- RLS と Prisma の責任境界をどう切るか（重要）
- ローカル開発フローの最短手順

ここを固めないと、ISSUE-006 で `/v1/me` を実装するときに DB 接続まわりで止まる。

---

## スコープ (What)

### Supabase

- [ ] Supabase プロジェクトを **手動で作成**（無料枠で十分）
  - 本Issueでは「**作成済み前提**」で進める。kazuya 側で作成して接続情報を `.env.local` に入れる
  - プロジェクト名は `hana-dev` を推奨
- [ ] 必要な接続情報を `.env.example` に **キー名のみ** 追加:
  - `DATABASE_URL` (Prisma Migrate 用、`postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres`)
  - `DIRECT_URL` (Prisma Migrate 用、PgBouncer 経由しない直結 URL)
  - `NEXT_PUBLIC_SUPABASE_URL`（ISSUE-006 で使う、本Issueでは記載のみ）
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`（同上）
  - `SUPABASE_SERVICE_ROLE_KEY`（同上、サーバ専用）

### Prisma

- [ ] `prisma` (CLI) を devDep、`@prisma/client` を runtime dep に追加
- [ ] `prisma init` 相当の最小構成:
  - `prisma/schema.prisma`（datasource + generator のみ。テーブル定義は **空**）
  - `prisma/migrations/` ディレクトリ（空でよい。最初の `prisma migrate dev` で生成される）
- [ ] `package.json` scripts:
  - `db:generate` — `prisma generate`
  - `db:migrate` — `prisma migrate dev`（ローカル開発用）
  - `db:migrate:deploy` — `prisma migrate deploy`（CI/本番用）
  - `db:studio` — `prisma studio`
- [ ] Prisma Client のシングルトン（`src/server/db/prisma.ts`）
  - dev で複数インスタンス化を防ぐ標準パターン
- [ ] DB 接続 smoke test
  - `src/server/db/prisma.ts` から `prisma.$queryRaw\`SELECT 1\`` を呼ぶ最小スクリプト
  - 本IssueではIntegration Test ではなく **手動確認** で OK（CI で DB を使うのは ISSUE-006 以降）

### RLS と Prisma の責任境界（重要設計判断）

- [ ] **Prisma は `service_role` 相当の権限で接続**する（migrations の都合）
- [ ] **行レベルセキュリティ (RLS) は Phase 2** とし、ISSUE-005 では有効化しない
- [ ] 認可（user_id 所有権チェック）は **Route Handler 層** で実装する
  - ISSUE-006 で `/v1/me` 実装時にこの方針を確立
- [ ] ADR-0006 (RLS 後回し判断) を ISSUE-006 で起こす（本Issueでは ADR-0005 まで）

### 環境変数のマスキング

- [ ] `DATABASE_URL` に含まれる password がログに出ないことを確認
- [ ] 接続失敗時のエラーメッセージから password を除去するヘルパ（`src/server/db/sanitize-error.ts`）

### ドキュメント

- [ ] `docs/adr/0004-supabase-as-managed-backend.md`
  - Supabase を Postgres + Auth + Storage の統合プラットフォームとして採用する判断
  - 退路（PostgreSQL は標準仕様なので移行は可能）
- [ ] `docs/adr/0005-prisma-as-orm.md`
  - Prisma 採用判断（Drizzle 等と比較した受容コスト）
- [ ] `docs/api-driven-development/db-setup.md`（ローカル開発手順）
  - Supabase project 作成手順（5 分で済む）
  - `.env.local` に何を入れるか
  - `pnpm db:migrate` / `pnpm db:studio` の使い方
  - **password を間違って Git に commit しない注意**
- [ ] README にローカル開発の最短手順リンクを追記

---

## やらないこと (Out of Scope)

- 認証実装（→ ISSUE-006）
- RLS の設定（→ Phase 2 / ADR-0006 で扱う）
- `profiles` / `children` / `memories` などのテーブル定義（→ ISSUE-006 以降で必要になったときに追加）
- 本番 Supabase プロジェクトのプロビジョニング（dev だけで OK）
- CI で DB を使うテスト（→ ISSUE-006 以降）
- ローカル Supabase (`supabase start` Docker) の構築（リモート前提で個人開発の負荷を最小化）

---

## 影響範囲

| 領域         | 影響                                                            |
| ------------ | --------------------------------------------------------------- |
| OpenAPI      | なし（API 追加は ISSUE-006 以降）                               |
| 生成型       | なし                                                            |
| 画面         | なし                                                            |
| データ       | **新規 DB 接続**（テーブル無し、空スキーマ）                    |
| CI           | なし（typecheck/lint は通る、DB 接続テストは無し）              |
| ドキュメント | `db-setup.md` + ADR-0004 + ADR-0005                             |
| 環境変数     | `DATABASE_URL` / `DIRECT_URL` / 他 4 個を `.env.example` に追加 |

---

## 受け入れ条件 (Acceptance Criteria)

- [ ] `prisma` + `@prisma/client` が `package.json` に追加されている
- [ ] `prisma/schema.prisma` が存在し、`pnpm db:generate` がエラーなく通る（空スキーマでも generate は成功する）
- [ ] `.env.example` に DB / Supabase 関連のキーが追加されている（値は空）
- [ ] `src/server/db/prisma.ts` から `PrismaClient` シングルトンが export される
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build` 通過
- [ ] ローカルで `pnpm db:migrate` を実行すると初期 migration が作成できる（手動確認）
  - **このコマンドは Supabase の DATABASE_URL を `.env.local` に設定したマシンで確認する**
  - CI では実行しない（本Issueでは）
- [ ] `db-setup.md` を読めば 5 分でローカル開発が始められる
- [ ] ADR-0004 / ADR-0005 が accepted で配置されている

---

## セキュリティ・プライバシー考慮

- [ ] `DATABASE_URL` を **絶対に Git に commit しない**（`.gitignore` で `.env*` 除外済み、再確認）
- [ ] `db-setup.md` に「password を slack / git / log に貼らない」注意を明記
- [ ] エラーメッセージから password 部分を除去（`sanitize-error.ts`）
- [ ] Supabase `service_role` key は **サーバ側からしか使わない**（`NEXT_PUBLIC_*` プレフィクス禁止）
- [ ] `src/server/` ディレクトリは Server Components / Route Handlers からのみ import される境界とする

---

## 設計メモ

### なぜリモート Supabase だけで開始するか

ローカル Supabase (`supabase start` で Docker 起動) は完全ですが:

- Docker / supabase CLI のインストールが必要
- ストレージ・関数まで含めると重い
- 個人開発で「とにかく最短で動かしたい」フェーズには過剰

リモート無料枠で十分。ローカル化したくなったら ADR を追加して移行する。

### Prisma 採用の理由（ADR-0005 に書く）

- 成熟度・コミュニティ
- TypeScript 統合の質
- Supabase / Neon どちらでも動く
- Drizzle と比較すると Prisma Client は大きいが、個人開発の **メンテ負荷** で勝つ

### `DATABASE_URL` と `DIRECT_URL` の使い分け

Supabase は PgBouncer 経由の pooled connection（5432）と direct connection を両方提供する。Prisma Migrate は direct を要求するので:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

`.env.example` には両方のキーを記述する。

---

## 参考

- ISSUE-004（API クライアント基盤）
- `Hana_PRD_v1.md` §10 データ設計（テーブル設計の概要）
- `Hana_PRD_v1.md` §12 セキュリティ
- [Supabase Docs — Prisma integration](https://supabase.com/docs/guides/database/prisma)
- [Prisma — Supabase guide](https://www.prisma.io/docs/orm/overview/databases/supabase)

---

## 実施結果 (2026-05-14)

### 作成・変更ファイル

- `package.json`: `prisma` / `@prisma/client` / `@prisma/adapter-pg` / `pg` / `@types/pg` / `dotenv` を追加。scripts に `db:generate` / `db:migrate` / `db:migrate:deploy` / `db:studio`。`pnpm.onlyBuiltDependencies` で Prisma の build script を承認
- `prisma/schema.prisma`: datasource (provider のみ) + generator
- `prisma.config.ts`: Prisma 7 で必須。dotenv で `.env.local` / `.env` をロード、`datasource.url = env('DIRECT_URL')` (Schema Engine 用)
- `src/server/db/prisma.ts`: `PrismaClient` シングルトン (`server-only` + `@prisma/adapter-pg`)
- `src/server/db/sanitize-error.ts`: password を含む URL をエラーメッセージから除去
- `tests/unit/server/db/sanitize-error.test.ts`: 4 件
- `.env.example`: Supabase 関連の 5 個のキーを追加、JWT 自前管理キーを削除 (Supabase Auth に統合)
- `.env.local`: kazuya 側で接続情報を記入（Git 管理外）
- `docs/adr/0004-supabase-as-managed-backend.md`
- `docs/adr/0005-prisma-as-orm.md`
- `docs/api-driven-development/db-setup.md`: 5 分セットアップ手順
- `README.md`: セットアップ章を更新、Database scripts を追記

### Prisma 7 で遭遇した破壊変更

- `schema.prisma` から `directUrl` および `url` が **使用不可** → `prisma.config.ts` に移動
- `PrismaClient` 生成時に **adapter 注入が必須** → `@prisma/adapter-pg` + `pg` を追加
- `.env` の自動ロードが消失 → `prisma.config.ts` 先頭で `dotenv.config()` を明示

ADR-0005 にこの背景を記録した。

### 検証結果

- [x] `pnpm db:generate` 成功 (Prisma Client 生成)
- [x] `pnpm db:migrate` 成功 (Supabase 接続確認、empty schema なので migration ファイルは未作成)
- [x] `pnpm typecheck` グリーン
- [x] `pnpm lint` グリーン
- [x] `pnpm test` 23 件全パス (前回 19 件 + sanitize-error 4 件)
- [x] `pnpm format:check` グリーン
- [x] `pnpm build` 成功

### スコープ調整

- 当初想定の「Prisma は `service_role` 相当で接続」は **Supabase Auth 側で role-based 接続を扱う ISSUE-006** に持ち越し。本Issueでは DATABASE_URL の owner connection で接続している
- `prisma/migrations/` ディレクトリは empty schema のため未作成。ISSUE-006 で `profiles` テーブルを追加した時点で初回 migration が記録される

### PR ドラフト

タイトル: `[ISSUE-005] Supabase + Prisma 基盤 (DB 接続・migrations)`
