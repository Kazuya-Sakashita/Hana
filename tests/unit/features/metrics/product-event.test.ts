import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertProductEventTelemetryBinding,
  parseProductEventReport,
  productEventActorHash,
  productEventRetentionCutoff,
  productEventTelemetryBinding,
} from '@/features/metrics/server/product-event'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '7f26e7f0-6f3c-4c07-9091-8f82db70b347'
const NOW = new Date('2026-08-07T12:35:30Z')
const validReport = {
  event_name: 'photo_selected',
  event_id: '123e4567-e89b-42d3-a456-426614174000',
  flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
  occurred_minute_utc: '2026-08-07T12:34:00Z',
  elapsed_bucket: 'under_10s',
} as const

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseProductEventReport', () => {
  it('accepts only the allowlisted shape', () => {
    expect(parseProductEventReport(validReport, NOW)).toEqual(validReport)
  })

  it('rejects unknown fields instead of silently retaining them', () => {
    expect(() =>
      parseProductEventReport({ ...validReport, unexpected_field: 'blocked' }, NOW),
    ).toThrow()
  })

  it('rejects unknown event names and malformed UUIDs', () => {
    expect(() =>
      parseProductEventReport({ ...validReport, event_name: 'free_form_event' }, NOW),
    ).toThrow()
    expect(() =>
      parseProductEventReport({ ...validReport, flow_id: USER_ID.slice(0, 8) }, NOW),
    ).toThrow()
  })

  it('rejects elapsed buckets that do not match the event stage', () => {
    expect(() =>
      parseProductEventReport({ ...validReport, elapsed_bucket: 'not_applicable' }, NOW),
    ).toThrow()
    expect(() =>
      parseProductEventReport(
        {
          ...validReport,
          event_name: 'record_started',
          elapsed_bucket: 'under_10s',
        },
        NOW,
      ),
    ).toThrow()
    expect(
      parseProductEventReport(
        {
          ...validReport,
          event_name: 'memory_viewed',
          elapsed_bucket: 'not_applicable',
        },
        NOW,
      ),
    ).toMatchObject({
      event_name: 'memory_viewed',
      elapsed_bucket: 'not_applicable',
    })
  })

  it('accepts only canonical UTC minutes from the last 24 hours', () => {
    expect(
      parseProductEventReport({ ...validReport, occurred_minute_utc: '2026-08-06T12:36:00Z' }, NOW),
    ).toMatchObject({ occurred_minute_utc: '2026-08-06T12:36:00Z' })

    for (const occurredMinute of [
      '2026-08-07T12:36:00Z',
      '2026-08-06T12:35:00Z',
      '2026-08-07T12:34:01Z',
      '2026-08-07T12:34:00.000Z',
      '2026-02-30T12:34:00Z',
    ]) {
      expect(() =>
        parseProductEventReport({ ...validReport, occurred_minute_utc: occurredMinute }, NOW),
      ).toThrow()
    }
  })
})

describe('productEventActorHash', () => {
  it('uses a deterministic HMAC without exposing the raw user id', () => {
    vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', 'test-product-event-pepper-with-32-bytes')
    const first = productEventActorHash(USER_ID)
    const second = productEventActorHash(USER_ID)

    expect(first).toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).not.toContain(USER_ID)
  })

  it('mints a versioned domain-separated binding and verifies the current actor', () => {
    vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', 'test-product-event-pepper-with-32-bytes')
    const binding = productEventTelemetryBinding(USER_ID)

    expect(binding).toMatch(/^v1\.[0-9a-f]{64}$/)
    expect(binding).not.toBe(`v1.${productEventActorHash(USER_ID)}`)
    expect(() => assertProductEventTelemetryBinding(USER_ID, binding)).not.toThrow()
    expect(() => assertProductEventTelemetryBinding(OTHER_USER_ID, binding)).toThrow()
    expect(() => assertProductEventTelemetryBinding(USER_ID, null)).toThrow()
    expect(() => assertProductEventTelemetryBinding(USER_ID, 'v1.invalid')).toThrow()
  })

  it('fails closed in production when the pepper is missing or too short', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', '')
    expect(() => productEventActorHash(USER_ID)).toThrow(
      'PRODUCT_EVENT_HASH_PEPPER is missing or too short',
    )
    vi.stubEnv('PRODUCT_EVENT_HASH_PEPPER', 'too-short')
    expect(() => productEventActorHash(USER_ID)).toThrow(
      'PRODUCT_EVENT_HASH_PEPPER is missing or too short',
    )
  })
})

describe('productEventRetentionCutoff', () => {
  it('keeps at most 90 days of events', () => {
    expect(productEventRetentionCutoff(new Date('2026-07-28T00:00:00Z')).toISOString()).toBe(
      '2026-04-29T00:00:00.000Z',
    )
  })
})
