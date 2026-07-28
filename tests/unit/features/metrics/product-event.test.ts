import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseProductEventReport,
  productEventActorHash,
  productEventRetentionCutoff,
} from '@/features/metrics/server/product-event'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const validReport = {
  event_name: 'photo_selected',
  event_id: '123e4567-e89b-42d3-a456-426614174000',
  flow_id: '7f26e7f0-6f3c-4c07-9091-8f82db70b347',
  elapsed_bucket: 'under_10s',
} as const

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseProductEventReport', () => {
  it('accepts only the allowlisted shape', () => {
    expect(parseProductEventReport(validReport)).toEqual(validReport)
  })

  it('rejects unknown fields instead of silently retaining them', () => {
    expect(() => parseProductEventReport({ ...validReport, unexpected_field: 'blocked' })).toThrow()
  })

  it('rejects unknown event names and malformed UUIDs', () => {
    expect(() =>
      parseProductEventReport({ ...validReport, event_name: 'free_form_event' }),
    ).toThrow()
    expect(() =>
      parseProductEventReport({ ...validReport, flow_id: USER_ID.slice(0, 8) }),
    ).toThrow()
  })

  it('rejects elapsed buckets that do not match the event stage', () => {
    expect(() =>
      parseProductEventReport({ ...validReport, elapsed_bucket: 'not_applicable' }),
    ).toThrow()
    expect(() =>
      parseProductEventReport({
        ...validReport,
        event_name: 'record_started',
        elapsed_bucket: 'under_10s',
      }),
    ).toThrow()
    expect(
      parseProductEventReport({
        ...validReport,
        event_name: 'memory_viewed',
        elapsed_bucket: 'not_applicable',
      }),
    ).toMatchObject({
      event_name: 'memory_viewed',
      elapsed_bucket: 'not_applicable',
    })
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
