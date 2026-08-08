import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'
import { POST } from '@/app/v1/metrics/vitals/route'
import { resetWebVitalsRateLimitForTests } from '@/features/metrics/server/web-vitals-rate-limit'
import { shouldSampleWebVitals } from '@/features/metrics/server/web-vitals'
import {
  createTelemetryAuthorityRegistrationCommitment,
  createTelemetryAuthorityRegistryReceiptCommitment,
  createTelemetryExpectationManifestCommitment,
  createTelemetryEnvelopeDigest,
  createTelemetryEventUniverseCommitment,
  createTelemetryIngestReceiptCommitment,
  createTelemetrySamplingKeyCommitment,
  evaluateTelemetryCompleteness,
  parseTelemetryEnvelope,
  shouldSampleTelemetry,
  TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION,
  TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_EVENT_SCHEMA_VERSION,
  TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION,
  TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
  TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_QUERY_VERSION,
  TELEMETRY_SAMPLING_POLICY_VERSION,
  type TelemetryAuthorityRegistration,
  type TelemetryCompletenessInput,
  type TelemetryExpectationManifest,
} from '@/features/metrics/server/telemetry-contract'

const SAMPLING_KEY = 'integration-web-vitals-sampling-key-32-bytes'
const SAMPLING_KEY_VERSION = 'integration-v1'
const AUTHORITY_KEY = 'integration-authority-key-32-bytes-minimum'
const AUTHORITY_KEY_VERSION = 'integration-authority-v1'
const MANIFEST_KEY = 'integration-manifest-key-32-bytes-minimum'
const MANIFEST_KEY_VERSION = 'integration-manifest-v1'
const UNIVERSE_KEY = 'integration-universe-key-32-bytes-minimum'
const UNIVERSE_KEY_VERSION = 'integration-universe-v1'
const SAMPLING_COMMITMENT_KEY = 'integration-sampling-commitment-key-minimum'
const REGISTRY_KEY = 'integration-registry-key-32-bytes-minimum'
const REGISTRY_KEY_VERSION = 'integration-registry-v1'
const INGEST_RECEIPT_KEY = 'integration-ingest-receipt-key-minimum'
const INGEST_RECEIPT_KEY_VERSION = 'integration-ingest-v1'
const MEMORY_TRUTH_KEY = 'integration-memory-truth-key-32-bytes-minimum'
const TARGET_DECISION_KEY = 'integration-target-decision-key-32-bytes-minimum'
const EVIDENCE_KEY = 'integration-evidence-key-32-bytes-minimum'

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/v1/metrics/vitals', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:3000',
      'Sec-Fetch-Site': 'same-origin',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function eventId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
}

function eventIdWithSampling(expected: boolean): string {
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = eventId(index)
    if (shouldSampleWebVitals(candidate) === expected) return candidate
  }
  throw new Error('sampling_fixture_not_found')
}

const sampledEventId = eventIdWithSampling(true)
const unsampledEventId = eventIdWithSampling(false)
const validPayload = {
  schema_version: 'hana-web-vitals-report/v2',
  event_id: sampledEventId,
  operation: 'web_vital_lcp',
  reason: 'not_applicable',
  route_group: 'record',
  status: 'good',
  duration_bucket: 'from_1001_to_2500ms',
}

afterEach(() => {
  resetWebVitalsRateLimitForTests()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('POST /v1/metrics/vitals', () => {
  it('emits only sampled fixed low-cardinality telemetry dimensions', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await POST(jsonRequest(validPayload))

    expect(response.status).toBe(204)
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response })
    const logged = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>
    expect(logged).toMatchObject({
      schema_version: 'hana-telemetry-dimensions/v1',
      operation: 'web_vital_lcp',
      reason: 'not_applicable',
      route_group: 'record',
      status: 'good',
      duration_bucket: 'from_1001_to_2500ms',
      level: 'info',
    })
    expect(Object.keys(logged).sort()).toEqual([
      'duration_bucket',
      'level',
      'operation',
      'reason',
      'route_group',
      'schema_version',
      'status',
      'ts',
    ])
    expect(JSON.stringify(logged)).not.toContain(sampledEventId)
  })

  it('returns 204 without logging a valid event sampled out by its stable event id', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const payload = { ...validPayload, event_id: unsampledEventId }

    const first = await POST(jsonRequest(payload))
    const second = await POST(jsonRequest(payload))

    expect(first.status).toBe(204)
    expect(second.status).toBe(204)
    expect(shouldSampleWebVitals(unsampledEventId)).toBe(false)
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('accepts an OpenAPI format UUID without requiring a version or variant', async () => {
    const response = await POST(
      jsonRequest({ ...validPayload, event_id: '00000000-0000-0000-0000-000000000000' }),
    )

    expect(response.status).toBe(204)
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response })
  })

  it('accepts uppercase bare UUIDs and uses the canonical sampling assignment', async () => {
    const uppercaseEventId = sampledEventId.toUpperCase()
    const response = await POST(jsonRequest({ ...validPayload, event_id: uppercaseEventId }))

    expect(response.status).toBe(204)
    expect(shouldSampleWebVitals(uppercaseEventId)).toBe(shouldSampleWebVitals(sampledEventId))
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response })
  })

  it('changes sampling assignment when the server-only key rotates', () => {
    let changed = false
    for (let index = 1; index < 10_000; index += 1) {
      const candidate = eventId(index)
      vi.stubEnv('WEB_VITALS_SAMPLING_KEY', 'sampling-key-a-with-at-least-32-bytes')
      const first = shouldSampleWebVitals(candidate)
      vi.stubEnv('WEB_VITALS_SAMPLING_KEY', 'sampling-key-b-with-at-least-32-bytes')
      if (first !== shouldSampleWebVitals(candidate)) {
        changed = true
        break
      }
    }
    expect(changed).toBe(true)
  })

  it('uses the exact same HMAC sampling assignment for ingest and completeness', () => {
    vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', 'v2')
    vi.stubEnv('WEB_VITALS_SAMPLING_KEY', SAMPLING_KEY)
    vi.stubEnv('WEB_VITALS_SAMPLING_KEY_VERSION', SAMPLING_KEY_VERSION)
    const sampledIn = eventIdWithSampling(true)
    const sampledOut = eventIdWithSampling(false)
    for (const candidate of [sampledIn, sampledOut]) {
      expect(shouldSampleWebVitals(candidate)).toBe(
        shouldSampleTelemetry('web_vital', candidate, {
          key_version: SAMPLING_KEY_VERSION,
          key: SAMPLING_KEY,
        }),
      )
    }

    vi.stubEnv('TELEMETRY_AUTHORITY_KEY_VERSION', AUTHORITY_KEY_VERSION)
    vi.stubEnv('TELEMETRY_AUTHORITY_COMMITMENT_KEY', AUTHORITY_KEY)
    vi.stubEnv('TELEMETRY_MANIFEST_KEY_VERSION', MANIFEST_KEY_VERSION)
    vi.stubEnv('TELEMETRY_MANIFEST_COMMITMENT_KEY', MANIFEST_KEY)
    vi.stubEnv('TELEMETRY_EVENT_UNIVERSE_KEY_VERSION', UNIVERSE_KEY_VERSION)
    vi.stubEnv('TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY', UNIVERSE_KEY)
    vi.stubEnv('TELEMETRY_SAMPLING_COMMITMENT_KEY', SAMPLING_COMMITMENT_KEY)
    vi.stubEnv('TELEMETRY_AUTHORITY_REGISTRY_KEY_VERSION', REGISTRY_KEY_VERSION)
    vi.stubEnv('TELEMETRY_AUTHORITY_REGISTRY_COMMITMENT_KEY', REGISTRY_KEY)
    vi.stubEnv('TELEMETRY_INGEST_RECEIPT_KEY_VERSION', INGEST_RECEIPT_KEY_VERSION)
    vi.stubEnv('TELEMETRY_INGEST_RECEIPT_COMMITMENT_KEY', INGEST_RECEIPT_KEY)
    vi.stubEnv('TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY', MEMORY_TRUTH_KEY)
    vi.stubEnv('TELEMETRY_TARGET_DECISION_COMMITMENT_KEY', TARGET_DECISION_KEY)
    vi.stubEnv('TELEMETRY_EVIDENCE_COMMITMENT_KEY', EVIDENCE_KEY)
    const occurredAtUtc = '2026-08-07T00:00:00Z'
    const authorityRegistration: TelemetryAuthorityRegistration = {
      schema_version: TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION,
      query_version: TELEMETRY_QUERY_VERSION,
      source: 'web_vital',
      expected_actor: null,
      window_start_utc: '2026-08-07T00:00:00Z',
      window_end_utc: '2026-08-08T00:00:00Z',
      authority_key_version: AUTHORITY_KEY_VERSION,
      sampling_policy_version: TELEMETRY_SAMPLING_POLICY_VERSION,
      sampling_key_version: SAMPLING_KEY_VERSION,
      sampling_key_commitment: createTelemetrySamplingKeyCommitment({
        source: 'web_vital',
        sampling_key_version: SAMPLING_KEY_VERSION,
        sampling_key: SAMPLING_KEY,
        commitment_key: SAMPLING_COMMITMENT_KEY,
      }),
      eligibility_policy_version: 'source-operation-actor-window/v1',
      eligible_operations: ['web_vital_lcp'],
      cohort_rule: 'all_actors',
      exclusion_rule: 'pre_registered_actor_allowlist',
      exclusion_policy_version: 'synthetic-allowlist-v1',
      exclusion_policy_commitment: 'e'.repeat(64),
    }
    const registrationCommitment = createTelemetryAuthorityRegistrationCommitment({
      registration: authorityRegistration,
      commitment_key: AUTHORITY_KEY,
    })
    const unsignedUniverse = {
      schema_version: TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION,
      query_version: TELEMETRY_QUERY_VERSION,
      source: 'web_vital' as const,
      window_start_utc: '2026-08-07T00:00:00Z',
      window_end_utc: '2026-08-08T00:00:00Z',
      cutoff_utc: '2026-08-08T00:00:00Z',
      sealed_at_utc: '2026-08-08T00:00:01Z',
      registration_commitment: registrationCommitment,
      universe_key_version: UNIVERSE_KEY_VERSION,
      eligible_events: [sampledIn, sampledOut].sort().map((eventId) => ({
        event_id: eventId,
        operation: 'web_vital_lcp' as const,
        flow_id: null,
        actor: null,
        occurred_at_utc: occurredAtUtc,
      })),
    }
    const eventUniverse = {
      ...unsignedUniverse,
      universe_commitment: createTelemetryEventUniverseCommitment({
        universe: unsignedUniverse,
        commitment_key: UNIVERSE_KEY,
      }),
    }
    const manifest: TelemetryExpectationManifest = {
      schema_version: TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
      source: 'web_vital',
      status: 'PASS',
      degradation: 'NONE',
      sampling_policy_version: TELEMETRY_SAMPLING_POLICY_VERSION,
      sampling_key_version: SAMPLING_KEY_VERSION,
      sampling_key_commitment: createTelemetrySamplingKeyCommitment({
        source: 'web_vital',
        sampling_key_version: SAMPLING_KEY_VERSION,
        sampling_key: SAMPLING_KEY,
        commitment_key: SAMPLING_COMMITMENT_KEY,
      }),
      query_version: TELEMETRY_QUERY_VERSION,
      authority_key_version: AUTHORITY_KEY_VERSION,
      authority_commitment: registrationCommitment,
      universe_key_version: UNIVERSE_KEY_VERSION,
      universe_commitment: eventUniverse.universe_commitment,
      universe_cutoff_utc: eventUniverse.cutoff_utc,
      manifest_key_version: MANIFEST_KEY_VERSION,
      expected_event_ids: eventUniverse.eligible_events.map((event) => event.event_id),
    }
    const unsignedRegistryReceipt = {
      schema_version: TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION,
      receipt_id: '00000000-0000-4000-8000-000000000099',
      registered_at_utc: '2026-08-06T23:59:59Z',
      registration_commitment: registrationCommitment,
      registry_key_version: REGISTRY_KEY_VERSION,
    }
    const receivedEnvelope = parseTelemetryEnvelope({
      schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
      event_id: sampledIn,
      occurred_at_utc: occurredAtUtc,
      dimensions: {
        operation: 'web_vital_lcp',
        reason: 'not_applicable',
        route_group: 'record',
        status: 'good',
        duration_bucket: 'from_1001_to_2500ms',
      },
    })
    const unsignedIngestReceipt = {
      schema_version: TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION,
      event_id: sampledIn,
      envelope_digest: createTelemetryEnvelopeDigest(receivedEnvelope),
      received_at_utc: occurredAtUtc,
      source: 'web_vital' as const,
      query_version: TELEMETRY_QUERY_VERSION,
      window_start_utc: '2026-08-07T00:00:00Z',
      window_end_utc: '2026-08-08T00:00:00Z',
      registration_commitment: registrationCommitment,
      universe_commitment: eventUniverse.universe_commitment,
      receipt_key_version: INGEST_RECEIPT_KEY_VERSION,
    }
    const boundary = {
      source: 'web_vital' as const,
      manifest,
      received: [receivedEnvelope],
      window_start_utc: '2026-08-07T00:00:00Z',
      window_end_utc: '2026-08-08T00:00:00Z',
      actor_key_version: 'v2',
      authority_registration: authorityRegistration,
      event_universe: eventUniverse,
      authority_registry_receipt: {
        ...unsignedRegistryReceipt,
        registry_commitment: createTelemetryAuthorityRegistryReceiptCommitment({
          receipt: unsignedRegistryReceipt,
          commitment_key: REGISTRY_KEY,
        }),
      },
      received_receipts: [
        {
          ...unsignedIngestReceipt,
          receipt_commitment: createTelemetryIngestReceiptCommitment({
            receipt: unsignedIngestReceipt,
            commitment_key: INGEST_RECEIPT_KEY,
          }),
        },
      ],
      sampling_key_version: SAMPLING_KEY_VERSION,
      sampling_key: SAMPLING_KEY,
    }
    const input: TelemetryCompletenessInput = {
      ...boundary,
      manifest_commitment: createTelemetryExpectationManifestCommitment({
        ...boundary,
        commitment_key: MANIFEST_KEY,
      }),
    }
    expect(evaluateTelemetryCompleteness(input)).toMatchObject({
      status: 'PASS',
      reason: 'complete',
    })
  })

  it.each([
    [{ ...validPayload, schema_version: 'legacy' }, 'schema version'],
    [{ ...validPayload, event_id: 'not-a-uuid' }, 'event id'],
    [
      { ...validPayload, event_id: `urn:uuid:${sampledEventId}` },
      'UUID URN outside the bare UUID contract',
    ],
    [{ ...validPayload, operation: 'web_vital_nope' }, 'operation'],
    [{ ...validPayload, reason: 'none' }, 'reason'],
    [{ ...validPayload, route_group: '/memory/raw-id' }, 'route group'],
    [{ ...validPayload, status: 'excellent' }, 'status'],
    [{ ...validPayload, duration_bucket: '2400ms' }, 'duration bucket'],
    [
      { ...validPayload, operation: 'web_vital_cls', duration_bucket: 'under_100ms' },
      'CLS combination',
    ],
    [
      { ...validPayload, operation: 'web_vital_lcp', duration_bucket: 'not_applicable' },
      'non-CLS combination',
    ],
    [
      { ...validPayload, operation: 'web_vital_lcp', status: 'poor' },
      'LCP poor with a good duration',
    ],
    [
      {
        ...validPayload,
        operation: 'web_vital_inp',
        status: 'good',
        duration_bucket: 'from_501_to_1000ms',
      },
      'INP good with a poor duration',
    ],
    [
      {
        ...validPayload,
        operation: 'web_vital_ttfb',
        status: 'needs_improvement',
        duration_bucket: 'over_4000ms',
      },
      'TTFB needs improvement with a poor duration',
    ],
  ])('rejects invalid %s payloads', async (body, _label) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await POST(jsonRequest(body))
    expect(response.status).toBe(422)
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response })
    expect(logSpy).not.toHaveBeenCalled()
  })

  it.each(['id', 'value', 'route', 'navigationType', 'email'])(
    'rejects the raw or unknown %s field before logging',
    async (field) => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const response = await POST(
        jsonRequest({ ...validPayload, [field]: 'synthetic-parent@example.invalid' }),
      )
      expect(response.status).toBe(422)
      expect(logSpy).not.toHaveBeenCalled()
    },
  )

  it('rejects invalid JSON with Problem Details', async () => {
    const response = await POST(
      new Request('http://localhost:3000/v1/metrics/vitals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: 'http://localhost:3000',
          'Sec-Fetch-Site': 'same-origin',
        },
        body: '{',
      }),
    )
    expect(response.status).toBe(422)
    expect(response.headers.get('content-type')).toContain('application/problem+json')
  })

  it('rate-limits the shared unknown client before parsing or logging request content', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubEnv('WEB_VITALS_TRUST_PROXY_HEADERS', 'false')

    for (let count = 0; count < 30; count += 1) {
      const response = await POST(
        jsonRequest(
          { ...validPayload, event_id: unsampledEventId },
          { 'x-forwarded-for': `203.0.113.${count + 1}` },
        ),
      )
      expect(response.status).toBe(204)
    }

    const parse = vi.fn()
    const limitedRequest = new Request('http://localhost:3000/v1/metrics/vitals', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-for': '198.51.100.200',
      },
    })
    Object.defineProperty(limitedRequest, 'json', { value: parse })
    const limited = await POST(limitedRequest)

    expect(limited.status).toBe(429)
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response: limited })
    expect(limited.headers.get('Retry-After')).toBe('60')
    expect(parse).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
    expect(await limited.text()).not.toContain('198.51.100.200')
  })

  it.each([
    [
      { Origin: 'https://attacker.invalid', 'Sec-Fetch-Site': 'cross-site' },
      'cross origin',
      'header.Origin',
    ],
    [{ 'Content-Type': 'text/plain' }, 'non JSON', 'header.Content-Type'],
    [{ 'Sec-Fetch-Site': 'cross-site' }, 'cross site', 'header.Sec-Fetch-Site'],
  ])(
    'rejects a $label browser request before parsing or logging',
    async (headers, _label, path) => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const parse = vi.fn()
      const request = jsonRequest(validPayload, headers)
      Object.defineProperty(request, 'json', { value: parse })

      const response = await POST(request)

      expect(response.status).toBe(422)
      expect(await response.json()).toMatchObject({
        reason: 'validation_error',
        errors: [{ path, reason: 'request_boundary_invalid' }],
      })
      expect(parse).not.toHaveBeenCalled()
      expect(logSpy).not.toHaveBeenCalled()
    },
  )

  it('fails closed in production until the trusted shared rate-limit boundary is active', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('WEB_VITALS_SHARED_RATE_LIMIT_READY', '')

    const response = await POST(jsonRequest(validPayload))

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: 'telemetry_unavailable' })
  })

  it('fails closed in production when the sampling key version is missing', async () => {
    const edgeSecret = 'synthetic-edge-attestation-secret-32-bytes'
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('WEB_VITALS_SHARED_RATE_LIMIT_READY', 'true')
    vi.stubEnv('WEB_VITALS_TRUST_PROXY_HEADERS', 'true')
    vi.stubEnv('WEB_VITALS_EDGE_ATTESTATION_SECRET', edgeSecret)
    vi.stubEnv('WEB_VITALS_SAMPLING_KEY', SAMPLING_KEY)
    vi.stubEnv('WEB_VITALS_SAMPLING_KEY_VERSION', '')

    const response = await POST(
      jsonRequest(validPayload, {
        'x-hana-edge-attestation': edgeSecret,
        'x-forwarded-for': '203.0.113.10',
      }),
    )

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: 'telemetry_unavailable' })
  })
})
