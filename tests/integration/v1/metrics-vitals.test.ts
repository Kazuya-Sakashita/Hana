import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'
import { POST } from '@/app/v1/metrics/vitals/route'

function jsonRequest(body: unknown) {
  return new Request('http://localhost:3000/v1/metrics/vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPayload = {
  name: 'LCP',
  value: 2400,
  id: 'v1-1717068000000-12345',
  navigationType: 'navigate',
  route: '/record',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /v1/metrics/vitals', () => {
  it('emits only fixed low-cardinality telemetry dimensions', async () => {
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
  })

  it('does not log raw ids, values, routes, or user identifiers', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await POST(jsonRequest(validPayload))

    const logged = JSON.parse(logSpy.mock.calls[0]?.[0] as string) as Record<string, unknown>
    expect(logged).not.toHaveProperty('id')
    expect(logged).not.toHaveProperty('value')
    expect(logged).not.toHaveProperty('route')
    expect(logged).not.toHaveProperty('userIdHash')
    expect(JSON.stringify(logged)).not.toContain(validPayload.id)
  })

  it.each([
    [{ ...validPayload, name: 'NOPE' }, 'metric name'],
    [{ ...validPayload, value: -5 }, 'negative value'],
    [{ name: 'LCP', value: 2400, route: '/record', navigationType: 'navigate' }, 'missing id'],
    [{ ...validPayload, navigationType: 'teleport' }, 'navigation type'],
  ])('rejects invalid %s payloads', async (body, _label) => {
    const response = await POST(jsonRequest(body))
    expect(response.status).toBe(422)
    await assertOpenApiResponse({ method: 'POST', route: '/metrics/vitals', response })
  })

  it('accepts null navigationType', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await POST(jsonRequest({ ...validPayload, navigationType: null }))
    expect(response.status).toBe(204)
  })

  it('rejects unknown fields instead of silently dropping them', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const response = await POST(
      jsonRequest({ ...validPayload, email: 'synthetic@example.invalid', secret: 'blocked' }),
    )
    expect(response.status).toBe(422)
    expect(logSpy).not.toHaveBeenCalled()
  })

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
})
