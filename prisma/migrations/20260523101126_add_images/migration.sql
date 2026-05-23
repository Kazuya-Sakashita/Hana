-- CreateTable
CREATE TABLE "images" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "memory_id" UUID,
    "storage_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "file_size" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "images_storage_key_key" ON "images"("storage_key");

-- CreateIndex
CREATE INDEX "images_user_id_idx" ON "images"("user_id");

-- CreateIndex
CREATE INDEX "images_memory_id_idx" ON "images"("memory_id");

-- AddForeignKey
ALTER TABLE "images" ADD CONSTRAINT "images_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
