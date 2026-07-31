ALTER TABLE "profiles"
ADD COLUMN "deletion_requested_at" TIMESTAMPTZ,
ADD COLUMN "access_blocked_at" TIMESTAMPTZ,
ADD COLUMN "purge_after" TIMESTAMPTZ;

CREATE TABLE "account_deletion_intents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "token_hash" CHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "verified_at" TIMESTAMPTZ,
  "consumed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "account_deletion_intents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_deletion_intents_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "account_deletion_intents_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE
);

CREATE INDEX "account_deletion_intents_user_id_expires_at_idx"
ON "account_deletion_intents"("user_id", "expires_at");

CREATE TABLE "account_deletion_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "receipt_hash" CHAR(64) NOT NULL,
  "requested_at" TIMESTAMPTZ NOT NULL,
  "access_blocked_at" TIMESTAMPTZ NOT NULL,
  "purge_after" TIMESTAMPTZ NOT NULL,
  "auth_revocation_status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "auth_revocation_attempts" INTEGER NOT NULL DEFAULT 0,
  "auth_revoked_at" TIMESTAMPTZ,
  "next_auth_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "auth_claimed_at" TIMESTAMPTZ,
  "last_auth_failure_reason" VARCHAR(40),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "account_deletion_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "account_deletion_requests_user_id_key" UNIQUE ("user_id"),
  CONSTRAINT "account_deletion_requests_receipt_hash_key" UNIQUE ("receipt_hash")
);

CREATE INDEX "account_deletion_requests_auth_revocation_status_next_auth_attempt_at_idx"
ON "account_deletion_requests"("auth_revocation_status", "next_auth_attempt_at");
