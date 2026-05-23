-- CreateTable
CREATE TABLE "children" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "birthdate" DATE NOT NULL,
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "children_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "children_user_id_idx" ON "children"("user_id");

-- AddForeignKey
ALTER TABLE "children" ADD CONSTRAINT "children_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MVP 1 ユーザー 1 子ども制約 (ADR-0008)
-- 論理削除と両立させるため partial unique index を採用。
-- v1 で複数子ども対応するときに DROP する。
CREATE UNIQUE INDEX "children_user_id_active_uniq"
  ON "children" ("user_id")
  WHERE "deleted_at" IS NULL;
