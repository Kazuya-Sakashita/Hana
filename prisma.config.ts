import { config as loadEnv } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// .env.local を優先してロード (Next.js 慣習)。値が無ければ .env にフォールバック。
// prisma.config.ts は CLI から直接評価されるため、.env を自動では読まない。
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// Prisma 7 では `url` も `directUrl` も schema.prisma に書けず、prisma.config.ts 側で扱う。
// 役割分担:
//   - prisma.config.ts の datasource.url: Schema Engine (migrations / introspect) 用 (DIRECT_URL を使う)
//   - PrismaClient の runtime 接続: src/server/db/prisma.ts で adapter 経由で DATABASE_URL を渡す
//
// Supabase の PgBouncer (port 6543) は Schema Engine が嫌うため、migration には直結 (port 5432) を使う。

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DIRECT_URL'),
  },
})
