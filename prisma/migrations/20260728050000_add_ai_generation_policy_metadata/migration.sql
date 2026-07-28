ALTER TABLE "ai_generations"
    ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN "counts_toward_quota" BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN "policy_category_ids" VARCHAR(50)[] NOT NULL DEFAULT ARRAY[]::VARCHAR(50)[],
    ADD COLUMN "policy_outcome" VARCHAR(40);
