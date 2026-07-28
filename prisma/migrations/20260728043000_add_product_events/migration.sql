CREATE TABLE "product_events" (
    "event_id" UUID NOT NULL,
    "actor_hash" CHAR(64) NOT NULL,
    "flow_id" UUID NOT NULL,
    "event_name" VARCHAR(40) NOT NULL,
    "elapsed_bucket" VARCHAR(24) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_events_pkey" PRIMARY KEY ("event_id")
);

CREATE INDEX "product_events_actor_hash_created_at_idx"
    ON "product_events"("actor_hash", "created_at");
CREATE INDEX "product_events_flow_id_created_at_idx"
    ON "product_events"("flow_id", "created_at");
CREATE INDEX "product_events_event_name_created_at_idx"
    ON "product_events"("event_name", "created_at");
CREATE INDEX "product_events_created_at_idx"
    ON "product_events"("created_at");
CREATE UNIQUE INDEX "product_events_actor_hash_flow_id_event_name_key"
    ON "product_events"("actor_hash", "flow_id", "event_name");

CREATE OR REPLACE FUNCTION public.purge_expired_product_events()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    deleted_count BIGINT;
BEGIN
    DELETE FROM public.product_events
    WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_product_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_product_events() FROM anon;
REVOKE ALL ON FUNCTION public.purge_expired_product_events() FROM authenticated;

DO $schedule$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'hana-product-event-retention',
            '17 3 * * *',
            'SELECT public.purge_expired_product_events();'
        );
    END IF;
END;
$schedule$;
