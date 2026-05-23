# ADR-0008: MVP 期間は 1 ユーザー 1 子どもに制限する

- 状態: Accepted
- 決定日: 2026-05-23
- 対象 Issue: ISSUE-007

## 背景

PRD §10「データ設計」の `Child` セクションに **「MVP は 1 ユーザー 1 子どもに制限。v1 で複数子ども対応」** と明記されている。
これは仕様上の決定だが、コード上でどう実装するか・将来どう緩めるかは ADR で明示しておく必要がある。

並行リクエストや race condition、論理削除との両立があり、実装方針を 1 箇所に集約する。

## 決定

### 1. アプリ層 + DB 層の defense-in-depth で防ぐ

- **アプリ層** (`src/app/v1/children/route.ts` の POST): 既存の有効な子どもがあれば即座に `409 child_limit_reached` を返す
- **DB 層** (`prisma/migrations/.../migration.sql`): `children (user_id) WHERE deleted_at IS NULL` の **partial unique index** で並行 POST を物理的に防ぐ

並行 POST で DB レイヤから `P2002` (Unique constraint violation) が返ったら、Route Handler 側で同じ `409 child_limit_reached` に正規化する。

### 2. 論理削除と両立させるため partial unique index を採用

`children` は `deleted_at` で論理削除する。全体 unique にすると論理削除後に再登録できない。
PostgreSQL の partial index 機能で `WHERE deleted_at IS NULL` のみを対象にする。

Prisma schema 上では partial index を直接表現できないため、`migration.sql` に **手書きで** 追加する。
schema.prisma のコメントでこの方針を明記してある。

### 3. v1 で外すときの手順

複数子ども対応 (v1) では:

1. `prisma/migrations/<NEW>/migration.sql` に `DROP INDEX "children_user_id_active_uniq";` を追加
2. アプリ層の事前チェック (POST の `existing` 検査) を削除
3. `prisma/schema.prisma` のコメントを更新
4. OpenAPI の `ChildListResponse` を **ページネーション対応** に変更 (cursor + limit を追加)
5. UI (onboarding / settings) を複数子ども前提に変更

## 採用した代替案

### ❌ アプリ層のみ (DB unique 無し)

理由: 並行 POST で 2 件入る race condition が発生する。defense-in-depth が無い。

### ❌ 全体 unique (partial 無し)

理由: 論理削除後の再登録ができない。子どもプロフィールを誤って消した親が復活させられない UX 問題。

### ❌ アプリ層の lock (`SELECT ... FOR UPDATE`)

理由: PostgreSQL レベルの行ロックは複雑かつ遅い。partial unique index で同じ保証が得られる。

### ❌ 「MVP は 1 件」を OpenAPI に明示しない

理由: クライアントが 409 の `child_limit_reached` を受け取ったときに、その理由を理解できなくなる。
スキーマレベルで「`POST /children` は 409 を返しうる」と宣言することで、クライアントの分岐ロジックが書ける。

## 受容コスト

- **partial unique index は Prisma schema で表現できない**: migration.sql の手書き編集が必要。Prisma が自動再生成する箇所と独立しているのでズレるリスクは小さい
- **v1 で外す作業が複数箇所に分散する**: 上記「v1 で外すときの手順」を ADR に記録することで対応
- **テストカバレッジ**: アプリ層の 409 + DB 層の 409 (P2002 再正規化) の両方を unit テストする必要がある

## 関連

- ISSUE-007: 子どもプロフィール API
- ADR-0007: 認可は Route Handler 層
- `Hana_PRD_v1.md` §10 データ設計
- `prisma/schema.prisma` Child モデルのコメント
