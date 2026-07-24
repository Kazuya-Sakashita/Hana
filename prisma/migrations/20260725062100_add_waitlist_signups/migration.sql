CREATE TABLE "waitlist_signups" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_hash" CHAR(64) NOT NULL,
    "source" VARCHAR(80),
    "privacy_policy_version" VARCHAR(40) NOT NULL DEFAULT 'prelaunch-2026-07-25',
    "consent_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "waitlist_signups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "waitlist_signups_email_hash_key" ON "waitlist_signups"("email_hash");
CREATE INDEX "waitlist_signups_created_at_idx" ON "waitlist_signups"("created_at");
