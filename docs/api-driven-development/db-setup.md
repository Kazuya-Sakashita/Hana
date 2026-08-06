# ローカル開発: DB セットアップ手順

> Hana のローカル DB は **Supabase の無料プロジェクト** に直結します。
> Docker は不要です。5 分で完了します。

---

## 前提

- Node.js 22+ / pnpm 10+ がインストール済み
- Supabase アカウント ([https://supabase.com](https://supabase.com))
- このリポジトリを clone 済み + `pnpm install` 完了

---

## ステップ 1: Supabase プロジェクトを作成

1. [https://supabase.com](https://supabase.com) にログイン
2. **New project** → 以下を設定
   - **Name**: `hana-dev` (任意)
   - **Region**: `Northeast Asia (Tokyo)` 推奨
   - **DB Password**: 強固なものを生成 (16 文字以上、英数記号混合)
3. プロジェクト作成完了まで 1〜2 分待つ

> ⚠️ **DB Password を絶対に Slack / Git / log に貼らないでください**。
> ペースト時は周囲のシェア画面・録画にも注意。

---

## ステップ 2: 接続情報を取得

Supabase のダッシュボードで以下の値を取得します。

| 環境変数                        | 取得元                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`                  | Settings → Database → Connection string → **URI (pgbouncer/pooler)** モード (port 6543) |
| `DIRECT_URL`                    | Settings → Database → Connection string → **Direct connection** モード (port 5432)      |
| `CHILD_DATABASE_URL`            | ISSUE-151 rollout承認後の`hana_child_runtime`専用接続。承認前は設定しない               |
| `CHILD_OWNER_SCOPE_MODE`        | `route`（既定）または承認済みcutover時だけ`rls`。URLの有無だけでは切り替わらない        |
| `NEXT_PUBLIC_SUPABASE_URL`      | プロジェクト top → **Connect** ボタン または Settings → API → Project URL               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Settings → API → **anon (public)** key                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | Settings → API → **service_role** key (サーバ専用)                                      |

URL の `[YOUR-PASSWORD]` プレースホルダはステップ 1 で決めた password に置換します。

---

## ステップ 3: `.env.local` に書き込む

リポジトリ直下に `.env.local` を作成し、5 個の値を埋めます。

```bash
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.<ref>:<password>@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
CHILD_OWNER_SCOPE_MODE=route
```

> ✅ `.env.local` は `.gitignore` 対象です (`.gitignore` で `.env*` が除外されています)。コミットされません。
> ❌ Git status に `.env.local` が出てくる場合は `.gitignore` 設定を再確認してください。

---

## ステップ 4: Prisma に DB 接続を試す

```bash
# Prisma Client の型を生成
pnpm db:generate

# 初回 migration を試す (空スキーマなので migration ファイルは作られないが接続確認になる)
pnpm db:migrate
```

期待される出力:

```text
Datasource "db": PostgreSQL database "postgres", schema "public" at "...supabase.co:5432"
Already in sync, no schema change or pending migration was found.
```

---

## よくあるエラー

### `invalid_child_owner_scope_mode`

- `CHILD_OWNER_SCOPE_MODE`は未設定、`route`、`rls`だけを受け付ける。通常は`route`を使う。

### `child_database_url_required_for_rls` / `invalid_child_runtime_session`

- `rls`を指定したが専用URLがない、または実際の接続role・属性・membershipがADR-0016と一致しない。
- 特権接続へのfallbackは行わない。`docs/runbooks/child-rls-cutover.md`に従ってcutoverを停止する。

### `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL`

- `.env.local` に `DIRECT_URL` が無いか、空。ステップ 2 を再確認。

### `P1001: Can't reach database server`

- DB password が間違っている、または `[YOUR-PASSWORD]` のままになっている。
- Supabase プロジェクトが pause 中 (無料枠で 7 日アクセスが無いと止まる)。ダッシュボードで restore。
- ネットワーク (ファイアウォール / VPN) で 5432 / 6543 がブロックされている。

### `prepared statement "s0" already exists`

- pgbouncer 経由で migration を流している。`DATABASE_URL` ではなく `DIRECT_URL` (port 5432) を使う設定になっているか確認。

---

## よく使うコマンド

```bash
pnpm db:generate         # Prisma Client の型を生成
pnpm db:migrate          # ローカル: 開発用 migration を作成・適用
pnpm db:migrate:deploy   # 本番/CI: 既存 migration を適用 (作成しない)
pnpm db:studio           # Prisma Studio (DB GUI) を起動
```

---

## 本番デプロイ時の注意 (将来用)

- 本番 Supabase プロジェクトを別途作成し、CI/CD の secret に env を入れる
- migration 適用は `pnpm db:migrate:deploy` を使う (dev は不可)
- `SUPABASE_SERVICE_ROLE_KEY` は **公開禁止**。`NEXT_PUBLIC_*` プレフィクス付けない
- 本番設定の詳細はデプロイ Issue で別途整理

---

## 参考

- ADR-0004 (Supabase 採用)
- ADR-0005 (Prisma 採用)
- ISSUE-005 (本基盤を整備した Issue)
- [Supabase docs](https://supabase.com/docs)
- [Prisma docs](https://www.prisma.io/docs)
