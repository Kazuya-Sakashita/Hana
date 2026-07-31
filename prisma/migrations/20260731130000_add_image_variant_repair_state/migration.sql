ALTER TABLE "images"
    ADD COLUMN "original_variant_status" VARCHAR(20) NOT NULL DEFAULT 'unknown',
    ADD COLUMN "thumbnail_variant_status" VARCHAR(20) NOT NULL DEFAULT 'unknown',
    ADD COLUMN "preview_variant_status" VARCHAR(20) NOT NULL DEFAULT 'unknown',
    ADD COLUMN "variant_repair_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN "variant_repair_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "variant_repair_next_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "variant_repair_claim_token" UUID,
    ADD COLUMN "variant_repair_claimed_at" TIMESTAMPTZ,
    ADD COLUMN "variant_repair_failure_reason" VARCHAR(40);

CREATE INDEX "images_variant_repair_status_next_at_idx"
    ON "images"("variant_repair_status", "variant_repair_next_at");
