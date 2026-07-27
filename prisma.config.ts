import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'prisma/config'

// .env.local を優先してロード (Next.js 慣習)。値が無ければ .env にフォールバック。
// prisma.config.ts は CLI から直接評価されるため、.env を自動では読まない。
if (process.env.HANA_QA_SKIP_DOTENV !== '1') {
  loadEnv({ path: '.env.local' })
  loadEnv({ path: '.env' })
}

// Prisma 7 では `url` も `directUrl` も schema.prisma に書けず、prisma.config.ts 側で扱う。
// 役割分担:
//   - prisma.config.ts の datasource.url: Schema Engine (migrations / introspect) 用 (DIRECT_URL を使う)
//   - PrismaClient の runtime 接続: src/server/db/prisma.ts で adapter 経由で DATABASE_URL を渡す
//
// Supabase の PgBouncer (port 6543) は Schema Engine が嫌うため、migration には直結 (port 5432) を使う。
//
// CI で `prisma generate` だけを実行する場合 (env vars 無し) のために、
// 厳格な `env()` ではなく process.env のフォールバック付きで参照する。
// 実 migration を行うコマンドは DIRECT_URL が必須 (空文字列だと接続に失敗する) なので、
// 開発者がローカルで意図せず壊すリスクは低い。

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DIRECT_URL ?? '',
  },
})
