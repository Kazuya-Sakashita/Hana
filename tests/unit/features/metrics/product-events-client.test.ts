import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearProductEventOutbox,
  flushProductEventOutbox,
  PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
  productEventElapsedBucket,
  readProductEventOutboxForTest,
  reportProductEvent,
  setProductEventTelemetryBinding,
} from '@/features/metrics/client/product-events'

const TELEMETRY_BINDING_A = `v1.${'a'.repeat(64)}`
const TELEMETRY_BINDING_B = `v1.${'b'.repeat(64)}`

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  clearProductEventOutbox()
  setProductEventTelemetryBinding(null)
})

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

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
      telemetryBinding: TELEMETRY_BINDING_A,
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
      'occurred_minute_utc',
    ])
    expect(new Headers(init.headers).get('x-hana-telemetry-binding')).toBe(TELEMETRY_BINDING_A)
  })

  it('swallows network failures so recording is not blocked', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)

    expect(() =>
      reportProductEvent({
        eventName: 'record_started',
        flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
        elapsedMs: null,
        telemetryBinding: TELEMETRY_BINDING_A,
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
        telemetryBinding: TELEMETRY_BINDING_A,
      }),
    ).not.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('durable ProductEvent outbox', () => {
  it('persists before sending and removes an event only after a 204 ack', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    expect(readProductEventOutboxForTest()).toHaveLength(1)

    await flushProductEventOutbox()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
  })

  it('retries the same event id after a network failure', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'ai_draft_shown',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 20_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    await flushProductEventOutbox()
    const queued = readProductEventOutboxForTest()
    expect(queued).toHaveLength(1)
    const eventId = queued[0]?.report.event_id

    await vi.advanceTimersByTimeAsync(2_000)
    await flushProductEventOutbox()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    const firstPayload = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const secondPayload = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(firstPayload.event_id).toBe(eventId)
    expect(secondPayload.event_id).toBe(eventId)
  })

  it('deduplicates the same stage while its first request is awaiting ack', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let acknowledge: ((response: Response) => void) | undefined
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          acknowledge = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const input = {
      eventName: 'memory_viewed' as const,
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: null,
      telemetryBinding: TELEMETRY_BINDING_A,
    }

    reportProductEvent(input)
    reportProductEvent(input)
    expect(readProductEventOutboxForTest()).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    acknowledge?.(new Response(null, { status: 204 }))
    await flushProductEventOutbox()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('fails closed and clears an outbox containing unknown or PII-like fields', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        telemetryBinding: TELEMETRY_BINDING_A,
        entries: [
          {
            report: {
              event_name: 'photo_selected',
              event_id: '123e4567-e89b-42d3-a456-426614174000',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              elapsed_bucket: 'under_10s',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              email: 'synthetic@example.invalid',
            },
            queuedAt: Date.now(),
            attempts: 0,
            nextAttemptAt: Date.now(),
          },
        ],
      }),
    )

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)

    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
  })

  it.each([401, 403])(
    'clears every pending event after an auth boundary response %s',
    async (status) => {
      const storage = new MemoryStorage()
      vi.stubGlobal('sessionStorage', storage)
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status })))

      reportProductEvent({
        eventName: 'photo_selected',
        flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
        elapsedMs: 5_000,
        telemetryBinding: TELEMETRY_BINDING_A,
      })
      await flushProductEventOutbox()

      expect(readProductEventOutboxForTest()).toHaveLength(0)
      expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
    },
  )

  it('supports explicit local cleanup on sign-out and account deletion', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({ version: 2, telemetryBinding: TELEMETRY_BINDING_A, entries: [] }),
    )

    clearProductEventOutbox()

    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
  })

  it('drops actor A events before any request when actor B becomes active', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    expect(readProductEventOutboxForTest()).toHaveLength(1)

    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)

    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_A,
    )
  })
})
