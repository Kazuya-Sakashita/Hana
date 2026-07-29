ALTER TABLE "memories"
    ADD COLUMN "idempotency_key" UUID;

ALTER TABLE "images"
    ADD COLUMN "memory_position" INTEGER;

CREATE UNIQUE INDEX "memories_user_id_idempotency_key_key"
    ON "memories"("user_id", "idempotency_key");
