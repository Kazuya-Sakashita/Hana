-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "display_name" TEXT,
    "ai_consent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- 補足: auth.users(id) への外部キーは Prisma の shadow DB が
-- auth スキーマを持たないため migration では張れない。
-- 一意性は profiles.id = auth.users.id をアプリ層 (src/server/auth/) で担保する。
-- 退会時の cascade は ISSUE で別途 SQL (function + trigger) を Supabase 側に登録する想定。
