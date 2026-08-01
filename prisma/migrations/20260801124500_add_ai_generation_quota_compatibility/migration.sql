ALTER TABLE "ai_generations"
    ADD COLUMN "quota_counted_at" TIMESTAMPTZ;

UPDATE "ai_generations"
SET
    "status" = CASE
        WHEN "succeeded" THEN 'succeeded'
        WHEN "error_reason" = 'in_progress' THEN 'processing'
        ELSE 'failed'
    END,
    "claim_token" = CASE
        WHEN NOT "succeeded" AND "error_reason" = 'in_progress' THEN "id"
        ELSE NULL
    END,
    "lease_expires_at" = CASE
        WHEN NOT "succeeded" AND "error_reason" = 'in_progress'
            THEN CURRENT_TIMESTAMP + INTERVAL '2 minutes'
        ELSE NULL
    END,
    "quota_counted_at" = CASE
        WHEN "counts_toward_quota" THEN "created_at"
        ELSE NULL
    END,
    "completed_at" = CASE
        WHEN NOT "succeeded" AND "error_reason" = 'in_progress' THEN NULL
        ELSE COALESCE("completed_at", CURRENT_TIMESTAMP)
    END;

CREATE INDEX "ai_generations_user_id_quota_counted_at_idx"
    ON "ai_generations"("user_id", "quota_counted_at");

CREATE OR REPLACE FUNCTION public.sync_legacy_ai_generation_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    IF TG_OP = 'INSERT'
       AND NEW."status" = 'reserved'
       AND NOT NEW."counts_toward_quota" THEN
        NEW."counts_toward_quota" := TRUE;
        NEW."quota_counted_at" := NULL;
    ELSIF TG_OP = 'INSERT'
       AND NEW."status" = 'succeeded'
       AND NOT NEW."succeeded"
       AND NEW."claim_token" IS NULL THEN
        IF NEW."error_reason" = 'in_progress' THEN
            NEW."status" := 'processing';
            NEW."claim_token" := NEW."id";
            NEW."lease_expires_at" := CURRENT_TIMESTAMP + INTERVAL '2 minutes';
        ELSE
            NEW."status" := 'failed';
            NEW."completed_at" := CURRENT_TIMESTAMP;
        END IF;
        IF NEW."counts_toward_quota" AND NEW."quota_counted_at" IS NULL THEN
            NEW."quota_counted_at" := COALESCE(NEW."created_at", CURRENT_TIMESTAMP);
        END IF;
    ELSIF TG_OP = 'UPDATE'
          AND NEW."status" = OLD."status"
          AND NEW."claim_token" IS NOT DISTINCT FROM OLD."claim_token" THEN
        IF NOT NEW."counts_toward_quota" THEN
            NEW."quota_counted_at" := NULL;
        END IF;
        IF NEW."succeeded" THEN
            NEW."status" := 'succeeded';
            NEW."claim_token" := NULL;
            NEW."lease_expires_at" := NULL;
            NEW."completed_at" := COALESCE(NEW."completed_at", CURRENT_TIMESTAMP);
        ELSIF NEW."error_reason" IS DISTINCT FROM 'in_progress' THEN
            NEW."status" := 'failed';
            NEW."claim_token" := NULL;
            NEW."lease_expires_at" := NULL;
            NEW."completed_at" := COALESCE(NEW."completed_at", CURRENT_TIMESTAMP);
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;

CREATE TRIGGER "sync_legacy_ai_generation_lifecycle_trigger"
BEFORE INSERT OR UPDATE ON "ai_generations"
FOR EACH ROW
EXECUTE FUNCTION public.sync_legacy_ai_generation_lifecycle();
