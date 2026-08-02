# 0007. 認可は Route Handler 層で実装 (RLS は Phase 2)

- Status: accepted
- Date: 2026-05-14
- Deciders: kazuya

## Context

ADR-0004 で Supabase を採用したが、Supabase の流儀は **Row Level Security (RLS)** で
認可をデータベース層に下ろすことを推奨している。

一方、ADR-0005 で採用した Prisma は:

- `service_role` 相当の権限で接続する前提のため、RLS をバイパスする
- RLS と組み合わせるには `pg-prisma` adapter や JWT を毎クエリで渡す等の工夫が必要

Hana は個人開発でメンテ負荷を最小化したい。
認可をどこに置くかで設計を統一しないと、後段の Issue (children / memories / uploads / AI)
が混乱する。

候補:

- (A) RLS をフル活用 (Prisma を捨て Supabase JS SDK で書く)
- (B) RLS + Prisma (JWT を毎クエリで渡す方式)
- (C) RLS なし。**認可は Route Handler 層に集約**
- (D) RLS と Route Handler のハイブリッド (Phase 2 で RLS 追加)

## Decision

**(D) RLS なし → Route Handler 層に集約 → Phase 2 で RLS 追加** を採用する。

### Phase 1 (ISSUE-006 〜 MVP)

- 認可は Route Handler 層で実施
- ヘルパ:
  - `requireUser()` — 未認証なら 401 `unauthorized` を throw
  - `requireOwnership(currentUserId, resourceUserId)` — 不一致なら 403 `forbidden` を throw
- Prisma は `service_role` 相当の接続で動かす
- 404 vs 403 の使い分け: 自分のリソースの存在しないものは 404、他人のリソースは 403
  (詳細は `docs/api-driven-development/error-format.md` §7)
- Route Handler テストで認可ロジックを担保

#### Internal machine endpointの例外

`/internal/*`の定期運用endpointはユーザー向けAPIではなく、schedulerからのmachine-to-machine呼び出しに限定するため、`requireUser()`の対象外とする。

- `CRON_SECRET`のBearer認証を必須とし、未設定・欠落・不一致はfail closedで404にする
- secret比較は長さ確認後のconstant-time比較を使う
- OpenAPIへ公開せず、通常のユーザー向けクライアントから到達させない
- endpointごとに未認証拒否と明示的apply flagのテストを持つ
- responseとログは運用件数などのallowlistに限定し、user ID、storage key、URL、本文を含めない

### Phase 2 (将来)

- RLS を有効化し、defense-in-depth を強化
- Prisma の adapter-pg を継続使用しつつ JWT を渡す方式を検証
- 移行時は **全 Route Handler のテストが既に存在** している前提で、段階的に RLS を当てる
- 移行判断は別 ADR (ADR-NNNN) で行う

## Consequences

### 良い点

- Prisma の生産性をそのまま享受 (リレーション / 型推論 / migration)
- 認可ロジックがコードに集約され、デバッグ容易
- テストが書きやすい (DB を立てずに Route Handler だけテスト可能)
- 個人開発の初動を最短化

### 悪い点 / 受容するコスト

- DB 層に二次防御が無いため、Route Handler に認可漏れがあれば直撃する
  - 緩和策: 全 Route Handler の最初に `requireUser()` を呼ぶ規約 + ESLint カスタムルール (Phase 2)
  - 緩和策: 契約テスト (schemathesis) で他ユーザーアクセスの 403 を網羅
- 直接 SQL を叩く管理ツール (Prisma Studio など) からは認可が効かない
  - 緩和策: 本番では `db:studio` を使わず、Supabase ダッシュボードを使う
- 退会時の cascade 削除を DB 層で保証できない (FK 経由ではなくアプリで明示削除)

これらは Phase 1 のシンプルさと引き換えに受容する。Phase 2 で RLS を入れる前提なので
defense-in-depth は最終的に確保される。

## Implementation Notes

- `src/server/auth/current-user.ts` にヘルパ集約
- 全 Route Handler の規約:
  1. ユーザー向けRouteは最初に `requireUser()`。`/internal/*`は上記machine認証を最初に行う
  2. リソースアクセス前に `requireOwnership(user.id, resource.userId)`
  3. throw された `ApiProblemError` は `toProblemResponse(e)` で `application/problem+json` に変換
- `profiles.id ↔ auth.users.id` の FK は shadow DB 制約で migration に書けないため
  **アプリ層で担保**。Phase 2 で trigger + RLS と合わせて DB 層に下ろす

## References

- ISSUE-006 (本ADRを採用する Issue)
- ADR-0004 (Supabase 採用)
- ADR-0005 (Prisma 採用)
- ADR-0006 (Supabase Auth + SNS-only)
- `docs/api-driven-development/error-format.md` §7 (403 vs 404 ポリシー)
