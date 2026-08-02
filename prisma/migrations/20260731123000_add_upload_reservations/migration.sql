CREATE TABLE "upload_reservations" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "candidate_kind" VARCHAR(20) NOT NULL DEFAULT 'original',
    "issued_at" TIMESTAMPTZ NOT NULL,
    "signed_url_expires_at" TIMESTAMPTZ NOT NULL,
    "cleanup_after" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claim_token" UUID,
    "claimed_at" TIMESTAMPTZ,
    "failure_reason" VARCHAR(40),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "upload_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upload_reservations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "upload_reservations_storage_key_key" ON "upload_reservations"("storage_key");
CREATE INDEX "upload_reservations_status_cleanup_after_next_attempt_at_idx"
    ON "upload_reservations"("status", "cleanup_after", "next_attempt_at");

CREATE TABLE "maintenance_cursors" (
    "id" VARCHAR(50) NOT NULL,
    "cursor_value" TEXT,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "maintenance_cursors_pkey" PRIMARY KEY ("id")
);
