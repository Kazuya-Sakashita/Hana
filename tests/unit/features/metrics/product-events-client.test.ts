import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  productEventElapsedBucket,
  reportProductEvent,
} from '@/features/metrics/client/product-events'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('productEventElapsedBucket', () => {
  it.each([
    [null, 'not_applicable'],
    [0, 'under_10s'],
    [9_999, 'under_10s'],
    [10_000, 'from_10_to_30s'],
    [30_000, 'from_10_to_30s'],
    [30_001, 'from_31_to_60s'],
    [60_000, 'from_31_to_60s'],
    [60_001, 'over_60s'],
  ] as const)('maps %s ms to %s', (elapsedMs, expected) => {
    expect(productEventElapsedBucket(elapsedMs)).toBe(expected)
  })
})

describe('reportProductEvent', () => {
  it('sends only the allowlisted event fields with keepalive', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const payload = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(url).toBe('/v1/metrics/events')
    expect(init.keepalive).toBe(true)
    expect(Object.keys(payload).sort()).toEqual([
      'elapsed_bucket',
      'event_id',
      'event_name',
      'flow_id',
    ])
  })

  it('swallows network failures so recording is not blocked', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    expect(() =>
      reportProductEvent({
        eventName: 'record_started',
        flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
        elapsedMs: null,
      }),
    ).not.toThrow()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  })

  it('swallows synchronous browser API failures so recording is not blocked', () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => {
        throw new Error('browser API unavailable')
      }),
    })
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    expect(() =>
      reportProductEvent({
        eventName: 'memory_saved',
        flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
        elapsedMs: 20_000,
      }),
    ).not.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
