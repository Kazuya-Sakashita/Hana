UPDATE "images"
SET "original_variant_status" = 'ready'
WHERE "metadata_sanitized_at" IS NOT NULL
  AND "original_variant_status" = 'unknown';
