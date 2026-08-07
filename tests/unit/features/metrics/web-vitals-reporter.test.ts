import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Metric } from 'web-vitals'

const callbacks = vi.hoisted(() => ({
  cls: undefined as ((metric: Metric) => void) | undefined,
  fcp: undefined as ((metric: Metric) => void) | undefined,
  inp: undefined as ((metric: Metric) => void) | undefined,
  lcp: undefined as ((metric: Metric) => void) | undefined,
  ttfb: undefined as ((metric: Metric) => void) | undefined,
}))

vi.mock('web-vitals', () => ({
  onCLS: (callback: (metric: Metric) => void) => (callbacks.cls = callback),
  onFCP: (callback: (metric: Metric) => void) => (callbacks.fcp = callback),
  onINP: (callback: (metric: Metric) => void) => (callbacks.inp = callback),
  onLCP: (callback: (metric: Metric) => void) => (callbacks.lcp = callback),
  onTTFB: (callback: (metric: Metric) => void) => (callbacks.ttfb = callback),
}))

import { startReportingWebVitals } from '@/lib/perf/report'

describe('startReportingWebVitals', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {
      location: { pathname: '/memory/00000000-0000-4000-8000-000000000001' },
    })
    vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000010' })
  })

  it('uses only cookieless keepalive fetch and sends no raw Web Vitals data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const sendBeacon = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('navigator', { sendBeacon })
    startReportingWebVitals()

    callbacks.lcp?.({
      name: 'LCP',
      value: 2400,
      id: 'raw-web-vitals-id',
      navigationType: 'navigate',
    } as Metric)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(url).toBe('/v1/metrics/vitals')
    expect(init.credentials).toBe('omit')
    expect(init.referrerPolicy).toBe('no-referrer')
    expect(init.keepalive).toBe(true)
    expect(Object.keys(body).sort()).toEqual([
      'duration_bucket',
      'event_id',
      'operation',
      'reason',
      'route_group',
      'schema_version',
      'status',
    ])
    expect(JSON.stringify(body)).not.toContain('raw-web-vitals-id')
    expect(JSON.stringify(body)).not.toContain('/memory/')
    expect(sendBeacon).not.toHaveBeenCalled()
  })
})
