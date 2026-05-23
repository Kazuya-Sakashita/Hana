-- CreateTable
CREATE TABLE "memories" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "child_id" UUID NOT NULL,
    "title" VARCHAR(100) NOT NULL,
    "body" TEXT,
    "recorded_at" DATE NOT NULL,
    "weather" VARCHAR(20),
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "ai_generated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "memories_user_recorded_desc_idx" ON "memories"("user_id", "recorded_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "memories_child_id_idx" ON "memories"("child_id");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_memory_id_fkey" FOREIGN KEY ("memory_id") REFERENCES "memories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memories" ADD CONSTRAINT "memories_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "children"("id") ON DELETE CASCADE ON UPDATE CASCADE;
