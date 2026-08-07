import { afterEach, describe, expect, it } from 'vitest'
import {
  assertWebVitalsRateLimit,
  resetWebVitalsRateLimitForTests,
  webVitalsClientKey,
  webVitalsRateLimitBucketCountForTests,
  webVitalsRetryAfterSeconds,
  WEB_VITALS_MAX_RATE_LIMIT_BUCKETS,
  WEB_VITALS_MAX_REPORTS_PER_WINDOW,
  WEB_VITALS_RATE_LIMIT_WINDOW_MS,
} from '@/features/metrics/server/web-vitals-rate-limit'

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/v1/metrics/vitals', { headers })
}

afterEach(() => resetWebVitalsRateLimitForTests())

describe('Web Vitals rate limit', () => {
  it('uses a conservative shared bucket unless proxy headers are explicitly trusted', () => {
    const input = request({
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
      'x-real-ip': '192.0.2.30',
    })
    expect(webVitalsClientKey(input)).toBe('unknown')
    expect(webVitalsClientKey(input, true)).toMatch(/^trusted:[0-9a-f]{64}$/)
    expect(webVitalsClientKey(input, true)).not.toContain('203.0.113.10')
  })

  it('allows 30 reports per minute and returns only a fixed retry interval', () => {
    const input = request()
    for (let count = 0; count < WEB_VITALS_MAX_REPORTS_PER_WINDOW; count += 1) {
      expect(() => assertWebVitalsRateLimit(input, 1_000)).not.toThrow()
    }
    let error: unknown
    try {
      assertWebVitalsRateLimit(input, 1_000)
    } catch (caught) {
      error = caught
    }
    expect(WEB_VITALS_MAX_REPORTS_PER_WINDOW).toBe(30)
    expect(WEB_VITALS_RATE_LIMIT_WINDOW_MS).toBe(60_000)
    expect(webVitalsRetryAfterSeconds(error)).toBe(60)
  })

  it('bounds client buckets and shares overflow traffic', () => {
    for (let count = 0; count < WEB_VITALS_MAX_RATE_LIMIT_BUCKETS - 1; count += 1) {
      assertWebVitalsRateLimit(
        request({ 'x-forwarded-for': `2001:db8:${count.toString(16)}::1` }),
        1_000,
        true,
      )
    }
    for (let count = 0; count < WEB_VITALS_MAX_REPORTS_PER_WINDOW; count += 1) {
      assertWebVitalsRateLimit(
        request({ 'x-forwarded-for': `2001:db8:1000:${count.toString(16)}::1` }),
        1_000,
        true,
      )
    }
    expect(webVitalsRateLimitBucketCountForTests()).toBe(1024)
    expect(() =>
      assertWebVitalsRateLimit(
        request({ 'x-forwarded-for': '2001:db8:1000:ffff::1' }),
        1_000,
        true,
      ),
    ).toThrow()
  })
})
