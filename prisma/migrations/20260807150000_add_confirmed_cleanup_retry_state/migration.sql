ALTER TABLE "images"
    ADD COLUMN "confirmed_cleanup_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN "confirmed_cleanup_attempts" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "confirmed_cleanup_next_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "confirmed_cleanup_claim_token" UUID,
    ADD COLUMN "confirmed_cleanup_claimed_at" TIMESTAMPTZ,
    ADD COLUMN "confirmed_cleanup_failure_reason" VARCHAR(40),
    ADD CONSTRAINT "images_confirmed_cleanup_status_check"
        CHECK ("confirmed_cleanup_status" IN ('pending', 'claimed', 'dead_letter')),
    ADD CONSTRAINT "images_confirmed_cleanup_attempts_check"
        CHECK ("confirmed_cleanup_attempts" >= 0),
    ADD CONSTRAINT "images_confirmed_cleanup_attempt_status_check"
        CHECK (
            (
                "confirmed_cleanup_status" = 'dead_letter'
                AND "confirmed_cleanup_attempts" = 10
            )
            OR (
                "confirmed_cleanup_status" <> 'dead_letter'
                AND "confirmed_cleanup_attempts" < 10
            )
        ),
    ADD CONSTRAINT "images_confirmed_cleanup_failure_reason_check"
        CHECK (
            "confirmed_cleanup_failure_reason" IS NULL
            OR "confirmed_cleanup_failure_reason" IN (
                'storage_unavailable',
                'finalize_failed',
                'processing_timeout',
                'invalid_storage_key'
            )
        ),
    ADD CONSTRAINT "images_confirmed_cleanup_claim_check"
        CHECK (
            (
                "confirmed_cleanup_status" = 'claimed'
                AND "confirmed_cleanup_claim_token" IS NOT NULL
                AND "confirmed_cleanup_claimed_at" IS NOT NULL
            )
            OR (
                "confirmed_cleanup_status" <> 'claimed'
                AND "confirmed_cleanup_claim_token" IS NULL
                AND "confirmed_cleanup_claimed_at" IS NULL
            )
        ),
    ADD CONSTRAINT "images_confirmed_cleanup_dead_letter_reason_check"
        CHECK (
            "confirmed_cleanup_status" <> 'dead_letter'
            OR "confirmed_cleanup_failure_reason" IS NOT NULL
        );

CREATE INDEX "images_confirmed_cleanup_status_next_at_idx"
    ON "images"(
        "memory_id",
        "confirmed_cleanup_status",
        "confirmed_cleanup_next_at",
        "id"
    );
