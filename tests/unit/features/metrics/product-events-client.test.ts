import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearProductEventOutbox,
  flushProductEventOutbox,
  PRODUCT_EVENT_AUTH_REFRESH_TIMEOUT_MS,
  PRODUCT_EVENT_OUTBOX_MAX_ENTRIES,
  PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
  PRODUCT_EVENT_OUTBOX_TTL_MS,
  PRODUCT_EVENT_SEND_TIMEOUT_MS,
  productEventElapsedBucket,
  readProductEventDegradationForTest,
  readProductEventOutboxForTest,
  reportProductEvent,
  resetProductEventOutboxForTests,
  setProductEventTelemetryBinding,
  setProductEventTelemetryBindingRefresher,
} from '@/features/metrics/client/product-events'

const TELEMETRY_BINDING_A = `v3.1786125600.${'a'.repeat(64)}.${'c'.repeat(64)}`
const TELEMETRY_BINDING_A_ROTATED = `v3.1786129200.${'a'.repeat(64)}.${'d'.repeat(64)}`
const TELEMETRY_BINDING_B = `v3.1786125600.${'b'.repeat(64)}.${'e'.repeat(64)}`

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  clearProductEventOutbox()
  resetProductEventOutboxForTests()
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
    vi.stubGlobal('sessionStorage', new MemoryStorage())
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
    expect(init.referrerPolicy).toBe('no-referrer')
    expect(Object.keys(payload).sort()).toEqual([
      'elapsed_bucket',
      'event_id',
      'event_name',
      'flow_id',
      'occurred_minute_utc',
    ])
    expect(new Headers(init.headers).get('x-hana-telemetry-binding')).toBe(TELEMETRY_BINDING_A)
  })

  it('accepts a generic bare flow UUID and sends its canonical lowercase form', async () => {
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: 'ABCDEFAB-CDEF-9999-7000-ABCDEFABCDEF',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).flow_id).toBe(
      'abcdefab-cdef-9999-7000-abcdefabcdef',
    )
  })

  it('does not enqueue or send UUID URN flow ids', () => {
    vi.stubGlobal('sessionStorage', new MemoryStorage())
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: 'urn:uuid:00000000-0000-0000-0000-000000000000',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('swallows network failures so recording is not blocked', async () => {
    vi.stubGlobal('sessionStorage', new MemoryStorage())
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
      getRandomValues: vi.fn(() => {
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

  it('aborts a timed-out send and retries the same event id', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-07T00:00:00Z'))
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let firstSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, init: RequestInit) => {
        firstSignal = init.signal as AbortSignal
        return new Promise<Response>(() => undefined)
      })
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'ai_draft_shown',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 20_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    const eventId = readProductEventOutboxForTest()[0]?.report.event_id
    const pending = flushProductEventOutbox()

    await vi.advanceTimersByTimeAsync(PRODUCT_EVENT_SEND_TIMEOUT_MS)
    await pending

    expect(firstSignal?.aborted).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readProductEventOutboxForTest()[0]).toMatchObject({
      report: { event_id: eventId },
      attempts: 1,
      nextAttemptAt: Date.parse('2026-08-07T00:00:12Z'),
    })

    await vi.advanceTimersByTimeAsync(2_000)
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).event_id).toBe(eventId)
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('preserves degradation and rebinds a persisted queue across same-session rotation', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const queuedAt = Date.now()
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'CAPACITY_EXCEEDED',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: '019fd985-0000-7000-8000-000000000001',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              elapsed_bucket: 'not_applicable',
            },
            queuedAt,
            attempts: 0,
            nextAttemptAt: queuedAt,
          },
        ],
      }),
    )
    resetProductEventOutboxForTests()
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A_ROTATED)
    expect(readProductEventOutboxForTest()).toHaveLength(1)
    expect(readProductEventDegradationForTest()).toBe('CAPACITY_EXCEEDED')
    expect(JSON.parse(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 4,
      telemetryBinding: TELEMETRY_BINDING_A_ROTATED,
      degradation: 'CAPACITY_EXCEEDED',
    })
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_A_ROTATED,
    )
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('retries an in-flight auth rejection with the rotated same-session binding', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let rejectOldBinding: ((response: Response) => void) | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            rejectOldBinding = resolve
          }),
      )
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A_ROTATED)
    expect(readProductEventOutboxForTest()).toHaveLength(1)
    rejectOldBinding?.(new Response(null, { status: 403 }))
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_A,
    )
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_A_ROTATED,
    )
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('NONE')
  })

  it('drops a persisted queue before sending when reload resolves a different actor', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const queuedAt = Date.now()
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: '019fd985-0000-7000-8000-000000000001',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              elapsed_bucket: 'not_applicable',
            },
            queuedAt,
            attempts: 0,
            nextAttemptAt: queuedAt,
          },
        ],
      }),
    )
    resetProductEventOutboxForTests()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)
    await flushProductEventOutbox()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readProductEventDegradationForTest()).toBe('NONE')
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
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
    expect(JSON.parse(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 4,
      degradation: 'STORAGE_UNAVAILABLE',
      entries: [],
    })
  })

  it.each([
    ['record_started', 'under_10s'],
    ['photo_selected', 'not_applicable'],
  ])(
    'fails closed before sending a persisted v4 root with %s and %s',
    (eventName, elapsedBucket) => {
      const storage = new MemoryStorage()
      vi.stubGlobal('sessionStorage', storage)
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      storage.setItem(
        PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
        JSON.stringify({
          version: 4,
          telemetryBinding: TELEMETRY_BINDING_A,
          degradation: 'NONE',
          entries: [
            {
              report: {
                event_name: eventName,
                event_id: '019fd985-0000-7000-8000-000000000001',
                flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
                occurred_minute_utc: '2026-08-07T00:00:00Z',
                elapsed_bucket: elapsedBucket,
              },
              queuedAt: Date.now(),
              attempts: 0,
              nextAttemptAt: Date.now(),
            },
          ],
        }),
      )

      setProductEventTelemetryBinding(TELEMETRY_BINDING_A)

      expect(fetchMock).not.toHaveBeenCalled()
      expect(readProductEventOutboxForTest()).toHaveLength(0)
      const sanitized = storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY) ?? ''
      expect(sanitized).not.toContain(eventName)
      expect(JSON.parse(sanitized)).toMatchObject({
        version: 4,
        degradation: 'STORAGE_UNAVAILABLE',
        entries: [],
      })
    },
  )

  it('drops an invalid root from another continuity without degrading the current session', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'STORAGE_UNAVAILABLE',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: '019fd985-0000-7000-8000-000000000001',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              elapsed_bucket: 'under_10s',
            },
            queuedAt: Date.now(),
            attempts: 0,
            nextAttemptAt: Date.now(),
          },
        ],
      }),
    )

    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('NONE')
  })

  it('drops a root with an unattributable binding without degrading the current session', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: 'invalid-binding',
        degradation: 'STORAGE_UNAVAILABLE',
        entries: [{ raw: 'not-inspected' }],
      }),
    )

    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)

    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
    expect(readProductEventDegradationForTest()).toBe('NONE')
  })

  it.each([
    ['future queuedAt', (queuedAt: number) => ({ queuedAt: queuedAt + 365 * 24 * 60 * 60 * 1000 })],
    ['negative queuedAt', () => ({ queuedAt: -1, nextAttemptAt: 0 })],
    [
      'retry after TTL',
      (queuedAt: number) => ({ nextAttemptAt: queuedAt + PRODUCT_EVENT_OUTBOX_TTL_MS + 1 }),
    ],
    ['excessive attempts', () => ({ attempts: 86_401 })],
  ])('rejects persisted timing metadata with %s before network access', (_label, invalid) => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const queuedAt = Date.now()
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: '019fd985-0000-7000-8000-000000000001',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              elapsed_bucket: 'not_applicable',
            },
            queuedAt,
            attempts: 0,
            nextAttemptAt: queuedAt,
            ...invalid(queuedAt),
          },
        ],
      }),
    )

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('STORAGE_UNAVAILABLE')
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).not.toContain('record_started')
  })

  it.each([
    ['record_started', 5_000],
    ['photo_selected', null],
  ] as const)(
    'does not enqueue a new invalid %s event and elapsed value %s',
    (eventName, elapsedMs) => {
      vi.stubGlobal('sessionStorage', new MemoryStorage())
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)

      reportProductEvent({
        eventName,
        flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
        elapsedMs,
        telemetryBinding: TELEMETRY_BINDING_A,
      })

      expect(fetchMock).not.toHaveBeenCalled()
      expect(readProductEventOutboxForTest()).toHaveLength(0)
    },
  )

  it.each([
    ['UUIDv4 event id', '123e4567-e89b-42d3-a456-426614174000', '2026-08-07T00:00:00Z'],
    ['uppercase UUIDv7 event id', '019FD985-0000-7000-8000-000000000001', '2026-08-07T00:00:00Z'],
    ['invalid calendar minute', '019fd985-0000-7000-8000-000000000001', '2026-02-30T00:00:00Z'],
    ['mismatched embedded minute', '019fd985-0000-7000-8000-000000000001', '2026-08-07T00:01:00Z'],
  ])('fails closed before sending a persisted v4 root with %s', (_label, eventId, minute) => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: eventId,
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: minute,
              elapsed_bucket: 'not_applicable',
            },
            queuedAt: Date.now(),
            attempts: 0,
            nextAttemptAt: Date.now(),
          },
        ],
      }),
    )

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(JSON.parse(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY) ?? '{}')).toMatchObject({
      version: 4,
      degradation: 'STORAGE_UNAVAILABLE',
      entries: [],
    })
  })

  it.each([401, 403])(
    'clears every pending event after an auth boundary response %s',
    async (status) => {
      const storage = new MemoryStorage()
      vi.stubGlobal('sessionStorage', storage)
      setProductEventTelemetryBindingRefresher(
        vi.fn().mockResolvedValue({ status: 'unauthenticated' }),
      )
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
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: [],
      }),
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

  it('does not bypass durability when sessionStorage is unavailable', () => {
    vi.stubGlobal('sessionStorage', undefined)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(readProductEventDegradationForTest()).toBe('STORAGE_UNAVAILABLE')
  })

  it('marks capacity exhaustion without evicting or directly sending an event', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    const queuedAt = Date.now()
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: Array.from({ length: PRODUCT_EVENT_OUTBOX_MAX_ENTRIES }, (_, index) => ({
          report: {
            event_name: 'photo_selected',
            event_id: `019fd985-0000-7000-8000-${index.toString(16).padStart(12, '0')}`,
            flow_id: `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
            occurred_minute_utc: '2026-08-07T00:00:00Z',
            elapsed_bucket: 'under_10s',
          },
          queuedAt,
          attempts: 0,
          nextAttemptAt: queuedAt + 60_000,
        })),
      }),
    )

    reportProductEvent({
      eventName: 'ai_draft_shown',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 20_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })

    expect(readProductEventOutboxForTest()).toHaveLength(PRODUCT_EVENT_OUTBOX_MAX_ENTRIES)
    expect(readProductEventDegradationForTest()).toBe('CAPACITY_EXCEEDED')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks expired durable entries as degraded', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'NONE',
        entries: [
          {
            report: {
              event_name: 'record_started',
              event_id: '019fd985-0000-7000-8000-000000000001',
              flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
              occurred_minute_utc: '2026-08-07T00:00:00Z',
              elapsed_bucket: 'not_applicable',
            },
            queuedAt: 0,
            attempts: 0,
            nextAttemptAt: 0,
          },
        ],
      }),
    )

    expect(readProductEventOutboxForTest(PRODUCT_EVENT_OUTBOX_TTL_MS + 1)).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('TTL_EXPIRED')
  })

  it('refreshes once after 403 and retries the same event id for the same continuity', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let resolveRefresh: ((result: { status: 'binding'; binding: string }) => void) | undefined
    const refresh = vi.fn(
      () =>
        new Promise<{ status: 'binding'; binding: string }>((resolve) => {
          resolveRefresh = resolve
        }),
    )
    setProductEventTelemetryBindingRefresher(refresh)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    const eventId = readProductEventOutboxForTest()[0]?.report.event_id
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))

    resolveRefresh?.({ status: 'binding', binding: TELEMETRY_BINDING_A_ROTATED })
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const first = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))
    expect(first.event_id).toBe(eventId)
    expect(second.event_id).toBe(eventId)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_A_ROTATED,
    )
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('drops the rejected queue and starts clean when refresh resolves another session', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBindingRefresher(
      vi.fn().mockResolvedValue({ status: 'binding', binding: TELEMETRY_BINDING_B }),
    )
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    await flushProductEventOutbox()

    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('NONE')
    reportProductEvent({
      eventName: 'record_started',
      flowId: '13696525-149e-48b5-8e3a-dbe6e0ef36bb',
      elapsedMs: null,
      telemetryBinding: TELEMETRY_BINDING_B,
    })
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_B,
    )
  })

  it('tombstones a rejected binding returned unchanged by forced refresh', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBindingRefresher(
      vi.fn().mockResolvedValue({ status: 'binding', binding: TELEMETRY_BINDING_A }),
    )
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    await flushProductEventOutbox()
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    reportProductEvent({
      eventName: 'record_started',
      flowId: '13696525-149e-48b5-8e3a-dbe6e0ef36bb',
      elapsedMs: null,
      telemetryBinding: TELEMETRY_BINDING_A,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(readProductEventDegradationForTest()).toBe('AUTH_BOUNDARY')
  })

  it('suspends an unavailable recovery without resending the tombstoned binding', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBindingRefresher(vi.fn().mockResolvedValue({ status: 'unavailable' }))
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    const eventId = readProductEventOutboxForTest()[0]?.report.event_id
    await flushProductEventOutbox()

    expect(readProductEventOutboxForTest()).toHaveLength(1)
    expect(readProductEventDegradationForTest()).toBe('AUTH_BOUNDARY')
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    await flushProductEventOutbox()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A_ROTATED)
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).event_id).toBe(eventId)
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('does not let a late refresh revive a queue cleared during sign-out', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let resolveRefresh: ((result: { status: 'binding'; binding: string }) => void) | undefined
    let refreshSignal: AbortSignal | undefined
    const refresh = vi.fn(
      (signal: AbortSignal) =>
        new Promise<{ status: 'binding'; binding: string }>((resolve) => {
          refreshSignal = signal
          resolveRefresh = resolve
        }),
    )
    setProductEventTelemetryBindingRefresher(refresh)
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    const pending = flushProductEventOutbox()
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    clearProductEventOutbox()
    expect(refreshSignal?.aborted).toBe(true)
    resolveRefresh?.({ status: 'binding', binding: TELEMETRY_BINDING_A_ROTATED })
    await pending

    setProductEventTelemetryBinding(TELEMETRY_BINDING_A_ROTATED)
    reportProductEvent({
      eventName: 'record_started',
      flowId: '13696525-149e-48b5-8e3a-dbe6e0ef36bb',
      elapsedMs: null,
      telemetryBinding: TELEMETRY_BINDING_A_ROTATED,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('aborts an unresolved old fetch and flushes a new session without waiting', async () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let oldSignal: AbortSignal | undefined
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, init: RequestInit) => {
        oldSignal = init.signal as AbortSignal
        return new Promise<Response>(() => undefined)
      })
      .mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)
    expect(oldSignal?.aborted).toBe(true)

    reportProductEvent({
      eventName: 'record_started',
      flowId: '13696525-149e-48b5-8e3a-dbe6e0ef36bb',
      elapsedMs: null,
      telemetryBinding: TELEMETRY_BINDING_B,
    })
    await flushProductEventOutbox()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get('x-hana-telemetry-binding')).toBe(
      TELEMETRY_BINDING_B,
    )
    expect(readProductEventOutboxForTest()).toHaveLength(0)
  })

  it('does not carry degradation into another continuity', () => {
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    setProductEventTelemetryBinding(TELEMETRY_BINDING_A)
    storage.setItem(
      PRODUCT_EVENT_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: 4,
        telemetryBinding: TELEMETRY_BINDING_A,
        degradation: 'CAPACITY_EXCEEDED',
        entries: [],
      }),
    )
    expect(readProductEventDegradationForTest()).toBe('NONE')
    readProductEventOutboxForTest()
    expect(readProductEventDegradationForTest()).toBe('CAPACITY_EXCEEDED')

    setProductEventTelemetryBinding(TELEMETRY_BINDING_B)

    expect(readProductEventDegradationForTest()).toBe('NONE')
  })

  it('aborts refresh and discards the old queue after the finite recovery timeout', async () => {
    vi.useFakeTimers()
    const storage = new MemoryStorage()
    vi.stubGlobal('sessionStorage', storage)
    let refreshSignal: AbortSignal | undefined
    const refresh = vi.fn((signal: AbortSignal) => {
      refreshSignal = signal
      return new Promise<never>(() => undefined)
    })
    setProductEventTelemetryBindingRefresher(refresh)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 403 })))

    reportProductEvent({
      eventName: 'photo_selected',
      flowId: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
      elapsedMs: 5_000,
      telemetryBinding: TELEMETRY_BINDING_A,
    })
    const pending = flushProductEventOutbox()
    await vi.advanceTimersByTimeAsync(PRODUCT_EVENT_AUTH_REFRESH_TIMEOUT_MS)
    await pending

    expect(refresh).toHaveBeenCalledTimes(1)
    expect(refreshSignal?.aborted).toBe(true)
    expect(readProductEventOutboxForTest()).toHaveLength(0)
    expect(storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)).toBeNull()
  })
})
