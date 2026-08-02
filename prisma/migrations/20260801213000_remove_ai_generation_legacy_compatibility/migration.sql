DROP TRIGGER IF EXISTS "sync_legacy_ai_generation_lifecycle_trigger"
    ON "ai_generations";

DROP FUNCTION IF EXISTS public.sync_legacy_ai_generation_lifecycle();
