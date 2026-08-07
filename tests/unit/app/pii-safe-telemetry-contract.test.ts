import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

const issue = source('docs/issues/ISSUE-152-pii-safe-telemetry.md')
const contract = source('docs/observability/pii-safe-telemetry.md')
const environmentExample = source('.env.example')
const openApi = source('docs/openapi/openapi.yaml')
const productEventSchema = source('docs/openapi/components/schemas/ProductEventReport.yaml')
const webVitalsSchema = source('docs/openapi/components/schemas/WebVitalsReport.yaml')
const recordPage = source('src/app/record/page.tsx')
const settingsPage = source('src/app/settings/page.tsx')
const outbox = source('src/features/metrics/client/product-events.ts')
const productEvent = source('src/features/metrics/server/product-event.ts')
const telemetry = source('src/features/metrics/server/telemetry-contract.ts')
const webVitalsRoute = source('src/app/v1/metrics/vitals/route.ts')

describe('ISSUE-152 PII-safe telemetry contract', () => {
  it('binds the record flow id to the Memory idempotency key with a versioned safe payload', () => {
    expect(productEventSchema).toContain('POST /memories の Idempotency-Key と同じ値')
    expect(openApi).toContain('DB Memoryとする')
    expect(recordPage).toContain('flowId = idempotencyKey')
    expect(recordPage).toContain("transition: 'draft_restored'")
    expect(recordPage).toContain("rotateRecordFlow('photo_changed')")
    expect(recordPage).toContain("rotateRecordFlow('idempotency_conflict')")
    expect(recordPage).not.toContain('createProductEventFlowId')
  })

  it('persists only allowlisted ProductEvent fields until a 204 ack', () => {
    expect(outbox).toContain('response.status === 204')
    expect(outbox).toContain('PRODUCT_EVENT_OUTBOX_MAX_ENTRIES = 50')
    expect(outbox).toContain("'occurred_minute_utc'")
    expect(outbox).toContain("'X-Hana-Telemetry-Binding': telemetryBinding")
    expect(outbox).toContain('outbox.telemetryBinding !== activeTelemetryBinding')
    expect(outbox).not.toMatch(/report\.(?:email|body|storageKey|prompt|actorHash)/)
    expect(settingsPage.match(/clearProductEventOutbox\(\)/g)).toHaveLength(2)
    expect(contract).toContain('別actorまたは別`session_id`のbinding不一致')
  })

  it('rejects unknown Web Vitals fields and logs buckets instead of raw values', () => {
    expect(webVitalsSchema).toContain('additionalProperties: false')
    expect(webVitalsRoute).toContain('toWebVitalsTelemetryDimensions(report)')
    expect(webVitalsSchema).not.toContain('navigationType:')
    expect(webVitalsSchema).not.toContain('value:')
    expect(webVitalsRoute).not.toContain('report.value')
    expect(webVitalsRoute).not.toContain('userIdHash')
  })

  it('defines completeness, censoring, suppression and status-only evidence', () => {
    expect(telemetry).toContain("'loss_detected'")
    expect(telemetry).toContain("'event_reordered_after_truth'")
    expect(telemetry).toContain("'censoring_changes_decision'")
    expect(telemetry).toContain("'secondary'")
    expect(telemetry).toContain('eligible_census_commitment')
    expect(telemetry).toContain("TELEMETRY_QUERY_VERSION = 'issue-152-v3'")
    expect(contract).toContain('Version: `issue-152-v3`')
    expect(contract).toContain('versioned expectation manifestとreceived ID')
    expect(contract).toContain('primary suppression')
    expect(contract).toContain('secondary suppression')
  })

  it('keeps purge and actor key lifecycle in ISSUE-185', () => {
    expect(issue).toContain('退会purgeとHMAC key lifecycle（ISSUE-185）')
    expect(contract).toContain('ProductEventの退会purge、HMAC key rotation')
    expect(telemetry).not.toContain('PRODUCT_EVENT_HASH_PEPPER')
  })

  it('requires independent authority-retention and purge readiness before production ingest', () => {
    expect(issue).toContain('GitHub Issue #379')
    expect(issue).toContain('ISSUE-185')
    expect(contract).toContain('production telemetry activationをHold')
    expect(contract).toContain('GitHub Issue #379で実装・検証')
    expect(contract).toContain('ISSUE-185で実装・検証')
    expect(productEvent).toContain(
      "process.env.PRODUCT_EVENT_INGEST_ACTIVATION !== 'issue-186-retention-v1'",
    )
    expect(productEvent).toContain(
      "process.env.PRODUCT_EVENT_PURGE_ACTIVATION !== 'issue-185-purge-v1'",
    )
    expect(environmentExample).toMatch(/^PRODUCT_EVENT_INGEST_ACTIVATION=$/m)
    expect(environmentExample).toMatch(/^PRODUCT_EVENT_PURGE_ACTIVATION=$/m)
    expect(environmentExample).not.toMatch(/^PRODUCT_EVENT_(?:INGEST|PURGE)_ACTIVATION=issue-/m)
  })
})
