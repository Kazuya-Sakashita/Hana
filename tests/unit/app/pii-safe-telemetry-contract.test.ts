import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

const issue = source('docs/issues/ISSUE-152-pii-safe-telemetry.md')
const contract = source('docs/observability/pii-safe-telemetry.md')
const openApi = source('docs/openapi/openapi.yaml')
const productEventSchema = source('docs/openapi/components/schemas/ProductEventReport.yaml')
const webVitalsSchema = source('docs/openapi/components/schemas/WebVitalsReport.yaml')
const recordPage = source('src/app/record/page.tsx')
const settingsPage = source('src/app/settings/page.tsx')
const outbox = source('src/features/metrics/client/product-events.ts')
const telemetry = source('src/features/metrics/server/telemetry-contract.ts')
const webVitalsRoute = source('src/app/v1/metrics/vitals/route.ts')

describe('ISSUE-152 PII-safe telemetry contract', () => {
  it('binds the record flow id to the Memory idempotency key without changing the payload shape', () => {
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
    expect(outbox).toContain(
      "hasExactKeys(report, ['event_name', 'event_id', 'flow_id', 'elapsed_bucket'])",
    )
    expect(outbox).not.toMatch(/report\.(?:email|body|storageKey|prompt|actorHash)/)
    expect(settingsPage.match(/clearProductEventOutbox\(\)/g)).toHaveLength(2)
    expect(contract).toContain('別actorへの再送を禁止')
  })

  it('rejects unknown Web Vitals fields and logs buckets instead of raw values', () => {
    expect(webVitalsSchema).toContain('additionalProperties: false')
    expect(webVitalsRoute).toContain('toWebVitalsTelemetryDimensions(report)')
    expect(webVitalsRoute).not.toContain('report.value')
    expect(webVitalsRoute).not.toContain('userIdHash')
  })

  it('defines completeness, censoring, suppression and status-only evidence', () => {
    expect(telemetry).toContain("'loss_detected'")
    expect(telemetry).toContain("'event_reordered_after_truth'")
    expect(telemetry).toContain("'censoring_changes_decision'")
    expect(telemetry).toContain("'secondary'")
    expect(telemetry).toContain('eligible_census_digest')
    expect(contract).toContain('expected event ID manifestとreceived ID')
    expect(contract).toContain('primary suppression')
    expect(contract).toContain('secondary suppression')
  })

  it('keeps purge and actor key lifecycle in ISSUE-185', () => {
    expect(issue).toContain('退会purgeとHMAC key lifecycle（ISSUE-185）')
    expect(contract).toContain('ProductEventの退会purge、HMAC key rotation')
    expect(telemetry).not.toContain('PRODUCT_EVENT_HASH_PEPPER')
  })
})
