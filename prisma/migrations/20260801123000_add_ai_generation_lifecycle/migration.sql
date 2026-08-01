ALTER TABLE "ai_generations"
    ADD COLUMN "status" VARCHAR(20),
    ADD COLUMN "claim_token" UUID,
    ADD COLUMN "lease_expires_at" TIMESTAMPTZ,
    ADD COLUMN "completed_at" TIMESTAMPTZ;

UPDATE "ai_generations"
SET "status" = CASE WHEN "succeeded" THEN 'succeeded' ELSE 'failed' END;

ALTER TABLE "ai_generations"
    ALTER COLUMN "status" SET NOT NULL,
    ALTER COLUMN "status" SET DEFAULT 'succeeded',
    ADD CONSTRAINT "ai_generations_status_check"
        CHECK ("status" IN ('reserved', 'processing', 'succeeded', 'failed', 'discarded'));

CREATE INDEX "ai_generations_status_lease_expires_at_idx"
    ON "ai_generations"("status", "lease_expires_at");
