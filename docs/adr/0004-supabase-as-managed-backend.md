# 0004. Supabase をマネージドバックエンド (Postgres + Auth + Storage) として採用

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

Hana は個人開発で、ISSUE-006 以降で必要になる:

- DB (Postgres)
- 認証 (JWT 発行・Apple Sign In・Google OAuth)
- 画像ストレージ (Presigned URL)
- バックアップ・運用ダッシュボード

を最小の運用負荷で揃える必要がある。これら 4 つを別個に組むと、個人開発の継続性が損なわれる。

候補:

- (A) Supabase (Postgres + Auth + Storage + Realtime 統合)
- (B) Neon Postgres + Clerk (auth) + Cloudflare R2 (storage)
- (C) AWS (RDS + Cognito + S3)
- (D) PlanetScale (MySQL) + Auth.js + UploadThing 等

## Decision

**(A) Supabase** を Hana の **マネージドバックエンド** として採用する。

- DB: Supabase Postgres (Tokyo region 推奨)
- 認証: Supabase Auth (Apple + Google、SNS のみ — ISSUE-006 で詳細)
- 画像: Supabase Storage (Presigned URL 経由のみ、公開 URL 禁止)
- ORM: Prisma (ADR-0005 を参照)

### スコープ

- ISSUE-005: DB 接続基盤・migrations のみ整備
- ISSUE-006: Auth 統合
- ISSUE-008 (旧 ISSUE-007): 画像アップロード基盤で Supabase Storage を採用

## Consequences

### 良い点

- 4 機能を 1 プロジェクトで提供 → 環境変数 / Region / 課金が一元化
- 標準 PostgreSQL なので退路がある (Neon / RDS への移行は SQL ダンプで可能)
- 無料枠が手厚い (DB 500MB / Storage 1GB / Auth 50K MAU)
- Auth と Storage の Presigned URL / RLS が組み込みで設計が楽
- Tokyo region で日本ユーザーへの latency が低い

### 悪い点 / 受容するコスト

- ベンダーロックの度合いは中程度
  - DB: 移行可（標準 SQL）
  - Auth: Supabase 固有の JWT 構造。他プロバイダ移行時にユーザーテーブル再構築が必要
  - Storage: 抽象化レイヤを書けば移行可
- Supabase の障害は全機能に波及
- Edge Functions など他コンポーネントを Supabase 内で使い始めるとロックが深まる → **Edge Functions は使わず Vercel Functions に統一** する方針で抑制
- 価格急騰時のリスクは Pro plan ($25/mo) で予測可能

これらは個人開発の**運用負荷削減**と引き換えに受容する。

## Implementation Notes

- 接続: `DATABASE_URL` (pgbouncer port 6543) + `DIRECT_URL` (direct port 5432)
- Prisma 7 + `@prisma/adapter-pg` (Supabase は標準 Postgres)
- 環境変数:
  - `DATABASE_URL` / `DIRECT_URL` — DB 接続
  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — クライアント側 Supabase JS
  - `SUPABASE_SERVICE_ROLE_KEY` — サーバ専用 (RLS バイパス)
- RLS (Row Level Security) は **Phase 2** に倒す。ISSUE-005 では DB レベル RLS は有効化せず、認可は Route Handler 層で実施 (ISSUE-006 で ADR-0006 として明文化予定)
- ローカル開発はリモート Supabase に直結 (`supabase start` Docker は使わない)。理由: Docker 依存を回避し個人開発の初動を最短化

## References

- ISSUE-005 (本 ADR を採用する Issue)
- ISSUE-006 (Auth 統合、SNS-only の判断)
- ADR-0005 (Prisma 採用)
- `Hana_PRD_v1.md` §12 セキュリティ・プライバシー設計
- [Supabase Pricing](https://supabase.com/pricing)
