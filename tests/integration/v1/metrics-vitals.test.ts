import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'
import { POST } from '@/app/v1/metrics/vitals/route'
import { resetWebVitalsRateLimitForTests } from '@/features/metrics/server/web-vitals-rate-limit'
import { shouldSampleWebVitals } from '@/features/metrics/server/web-vitals'
import {
  createTelemetryExpectationManifestCommitment,
  createTelemetrySamplingKeyCommitment,
  evaluateTelemetryCompleteness,
  parseTelemetryEnvelope,
  shouldSampleTelemetry,
  TELEMETRY_EVENT_SCHEMA_VERSION,
  TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
  TELEMETRY_SAMPLING_POLICY_VERSION,
  type TelemetryCompletenessInput,
  type TelemetryExpectationManifest,
} from '@/features/metrics/server/telemetry-contract'

const SAMPLING_KEY = 'integration-web-vitals-sampling-key-32-bytes'
const SAMPLING_KEY_VERSION = 'integration-v1'
const COMMITMENT_KEY = 'integration-commitment-key-32-bytes-minimum'

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
        commitment_key: COMMITMENT_KEY,
      }),
      expected_event_ids: [sampledIn, sampledOut],
    }
    const boundary = {
      source: 'web_vital' as const,
      manifest,
      received: [
        parseTelemetryEnvelope({
          schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
          event_id: sampledIn,
          occurred_at_utc: '2026-08-07T00:00:00Z',
          dimensions: {
            operation: 'web_vital_lcp',
            reason: 'not_applicable',
            route_group: 'record',
            status: 'good',
            duration_bucket: 'from_1001_to_2500ms',
          },
        }),
      ],
      window_start_utc: '2026-08-07T00:00:00Z',
      window_end_utc: '2026-08-08T00:00:00Z',
      actor_key_version: 'v2',
      sampling_key_version: SAMPLING_KEY_VERSION,
      sampling_key: SAMPLING_KEY,
      commitment_key: COMMITMENT_KEY,
    }
    const input: TelemetryCompletenessInput = {
      ...boundary,
      manifest_commitment: createTelemetryExpectationManifestCommitment(boundary),
    }
    expect(evaluateTelemetryCompleteness(input)).toMatchObject({
      status: 'PASS',
      reason: 'complete',
    })
  })

  it.each([
    [{ ...validPayload, schema_version: 'legacy' }, 'schema version'],
    [{ ...validPayload, event_id: 'not-a-uuid' }, 'event id'],
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
    [{ Origin: 'https://attacker.invalid', 'Sec-Fetch-Site': 'cross-site' }, 'cross origin'],
    [{ 'Content-Type': 'text/plain' }, 'non JSON'],
  ])('rejects a %s browser request before parsing or logging', async (headers, _label) => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const parse = vi.fn()
    const request = jsonRequest(validPayload, headers)
    Object.defineProperty(request, 'json', { value: parse })

    const response = await POST(request)

    expect(response.status).toBe(422)
    expect(parse).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

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
