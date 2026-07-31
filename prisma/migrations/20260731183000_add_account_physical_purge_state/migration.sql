ALTER TABLE "account_deletion_requests"
ADD COLUMN "purge_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
ADD COLUMN "purge_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "next_purge_attempt_at" TIMESTAMPTZ,
ADD COLUMN "purge_claimed_at" TIMESTAMPTZ,
ADD COLUMN "purge_claim_token" UUID,
ADD COLUMN "purge_stage" VARCHAR(20) NOT NULL DEFAULT 'storage',
ADD COLUMN "storage_deleted_at" TIMESTAMPTZ,
ADD COLUMN "auth_deleted_at" TIMESTAMPTZ,
ADD COLUMN "last_purge_failure_stage" VARCHAR(20),
ADD COLUMN "last_purge_failure_reason" VARCHAR(40);

UPDATE "account_deletion_requests"
SET "next_purge_attempt_at" = "purge_after"
WHERE "next_purge_attempt_at" IS NULL;

ALTER TABLE "account_deletion_requests"
ALTER COLUMN "next_purge_attempt_at" SET NOT NULL;

CREATE INDEX "account_deletion_requests_purge_status_next_purge_attempt_at_idx"
ON "account_deletion_requests"("purge_status", "next_purge_attempt_at");

ALTER TABLE "ai_generations"
ADD COLUMN "anonymized_at" TIMESTAMPTZ,
ALTER COLUMN "user_id" DROP NOT NULL;

ALTER TABLE "ai_generations"
DROP CONSTRAINT "ai_generations_user_id_fkey";

ALTER TABLE "ai_generations"
ADD CONSTRAINT "ai_generations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
