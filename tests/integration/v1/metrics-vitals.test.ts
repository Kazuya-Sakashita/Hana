import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'
import { POST } from '@/app/v1/metrics/vitals/route'
import { resetWebVitalsRateLimitForTests } from '@/features/metrics/server/web-vitals-rate-limit'
import { shouldSampleTelemetry } from '@/features/metrics/server/telemetry-contract'

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/v1/metrics/vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function eventId(index: number): string {
  return `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`
}

function eventIdWithSampling(expected: boolean): string {
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = eventId(index)
    if (shouldSampleTelemetry('web_vital', candidate) === expected) return candidate
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
    expect(shouldSampleTelemetry('web_vital', unsampledEventId)).toBe(false)
    expect(logSpy).not.toHaveBeenCalled()
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
        headers: { 'Content-Type': 'application/json' },
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
      headers: { 'x-forwarded-for': '198.51.100.200' },
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
})
