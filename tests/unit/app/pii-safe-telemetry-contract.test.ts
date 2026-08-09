import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
}

const issue = source('docs/issues/ISSUE-188-telemetry-contract-round5-recovery.md')
const releaseIssue = source('docs/issues/ISSUE-162-release-evidence-dossier.md')
const contract = source('docs/observability/pii-safe-telemetry.md')
const environmentExample = source('.env.example')
const playwrightConfig = source('playwright.config.ts')
const openApi = source('docs/openapi/openapi.yaml')
const productEventSchema = source('docs/openapi/components/schemas/ProductEventReport.yaml')
const webVitalsSchema = source('docs/openapi/components/schemas/WebVitalsReport.yaml')
const recordPage = source('src/app/record/page.tsx')
const settingsPage = source('src/app/settings/page.tsx')
const outbox = source('src/features/metrics/client/product-events.ts')
const productEvent = source('src/features/metrics/server/product-event.ts')
const telemetry = source('src/features/metrics/server/telemetry-contract.ts')
const webVitalsRoute = source('src/app/v1/metrics/vitals/route.ts')

describe('ISSUE-188 PII-safe telemetry contract recovery', () => {
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
    expect(outbox).toContain("markDegradation('DELIVERY_REJECTED')")
    expect(outbox).toContain('occurrenceStart + PRODUCT_EVENT_OUTBOX_TTL_MS')
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
    expect(telemetry).toContain('metric_aggregate_set_commitment')
    expect(telemetry).toContain("TELEMETRY_QUERY_VERSION = 'issue-192-v1'")
    expect(telemetry).toContain('TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION')
    expect(telemetry).toContain('metric_windows: readonly TelemetryMetricWindowEntry[]')
    expect(telemetry).toContain("domain: 'authoritative_event_universe'")
    expect(telemetry).toContain('process.env.TELEMETRY_AUTHORITY_COMMITMENT_KEY')
    expect(telemetry).toContain('process.env.TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY')
    expect(telemetry).toContain('process.env.TELEMETRY_EVIDENCE_COMMITMENT_KEY')
    expect(telemetry).toContain('process.env.TELEMETRY_METRIC_AGGREGATE_COMMITMENT_KEY')
    expect(contract).toContain('Version: `issue-192-v1`')
    expect(contract).toContain('versioned expectation policyと観測終了後のsealed event universe')
    expect(contract).toContain('primary suppression')
    expect(contract).toContain('secondary suppression')
  })

  it('requires the release consumer to verify the complete v7 evaluation artifact', () => {
    expect(releaseIssue).toContain('`hana-telemetry-evidence/v7` whole-artifact HMAC')
    expect(releaseIssue).toContain('exact M1〜M12')
    expect(releaseIssue).toContain('nested exact-key schema')
    expect(releaseIssue).toContain('funnel completeness伝播')
    expect(releaseIssue).toContain('`HOLD > FAIL > PASS`')
    expect(releaseIssue).toContain('現在main SHA')
    expect(releaseIssue).toContain('`cohort_role: evaluation`')
  })

  it('keeps purge and actor key lifecycle in ISSUE-185', () => {
    expect(issue).toContain('退会purgeとHMAC key lifecycle（ISSUE-185）')
    expect(contract).toContain('ProductEventの退会purge、HMAC key rotation')
    expect(telemetry).not.toContain('PRODUCT_EVENT_HASH_PEPPER')
  })

  it('requires authority, purge and degradation-ledger readiness before production ingest', () => {
    expect(issue).toContain('GitHub Issue #379')
    expect(issue).toContain('GitHub Issue #384')
    expect(issue).toContain('ISSUE-185')
    expect(contract).toContain('production telemetry activationをHold')
    expect(contract).toContain('GitHub Issue #379で実装・検証')
    expect(contract).toContain('GitHub Issue #384で実装・検証')
    expect(contract).toContain('ISSUE-185で実装・検証')
    expect(productEvent).toContain(
      "process.env.PRODUCT_EVENT_INGEST_ACTIVATION !== 'issue-186-retention-v1'",
    )
    expect(productEvent).toContain(
      "process.env.PRODUCT_EVENT_PURGE_ACTIVATION !== 'issue-185-purge-v1'",
    )
    expect(productEvent).toContain(
      "process.env.PRODUCT_EVENT_DEGRADATION_ACTIVATION !== 'issue-190-v1'",
    )
    expect(environmentExample).toMatch(/^PRODUCT_EVENT_INGEST_ACTIVATION=$/m)
    expect(environmentExample).toMatch(/^PRODUCT_EVENT_PURGE_ACTIVATION=$/m)
    expect(environmentExample).toMatch(/^PRODUCT_EVENT_DEGRADATION_ACTIVATION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_ACTOR_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_AUTHORITY_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_AUTHORITY_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_EVENT_UNIVERSE_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_MANIFEST_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_MANIFEST_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_MEMORY_TRUTH_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_DEPLOYMENT_SHA=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_METRIC_AGGREGATE_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_METRIC_AGGREGATE_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_EVIDENCE_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_EVIDENCE_COMMITMENT_KEY=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_TARGET_DECISION_KEY_VERSION=$/m)
    expect(environmentExample).toMatch(/^TELEMETRY_TARGET_DECISION_COMMITMENT_KEY=$/m)
    expect(environmentExample).not.toMatch(
      /^PRODUCT_EVENT_(?:INGEST|PURGE|DEGRADATION)_ACTIVATION=issue-/m,
    )
    expect(playwrightConfig).toContain("PRODUCT_EVENT_DEGRADATION_ACTIVATION: 'issue-190-v1'")
  })
})
