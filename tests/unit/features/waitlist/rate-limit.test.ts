import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertWaitlistRateLimit,
  resetWaitlistRateLimitForTests,
  waitlistClientKey,
  waitlistRateLimitBucketCountForTests,
  waitlistRetryAfterSeconds,
  WAITLIST_MAX_BUCKETS,
  WAITLIST_MAX_SUBMISSIONS,
  WAITLIST_RATE_LIMIT_WINDOW_MS,
  WAITLIST_RETRY_AFTER_SECONDS,
} from '@/features/waitlist/server/rate-limit'

const issueSource = readFileSync(
  new URL('../../../../docs/issues/ISSUE-108-proxy-rate-limit-boundary.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../../docs/issues/README.md', import.meta.url),
  'utf8',
)
const releaseDoc = readFileSync(
  new URL('../../../../docs/release/prelaunch-waitlist-readiness.md', import.meta.url),
  'utf8',
)

function request(headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/v1/waitlist', { headers })
}

afterEach(() => {
  resetWaitlistRateLimitForTests()
})

describe('waitlist proxy client key', () => {
  it('keeps the public rate-limit constants fixed', () => {
    expect(WAITLIST_MAX_SUBMISSIONS).toBe(12)
    expect(WAITLIST_RATE_LIMIT_WINDOW_MS).toBe(600_000)
    expect(WAITLIST_RETRY_AFTER_SECONDS).toBe(600)
    expect(WAITLIST_MAX_BUCKETS).toBe(1024)
  })

  it('ignores forwarding headers unless the hosting proxy is trusted', () => {
    expect(
      waitlistClientKey(
        request({
          'x-forwarded-for': '203.0.113.10',
          'x-real-ip': '192.0.2.30',
        }),
      ),
    ).toBe('unknown')
  })

  it('uses the first valid x-forwarded-for IP', () => {
    const value = waitlistClientKey(
      request({
        'x-forwarded-for': '203.0.113.10, 198.51.100.20',
        'x-real-ip': '192.0.2.30',
      }),
      true,
    )

    expect(value).toBe('203.0.113.10')
  })

  it('falls back to x-real-ip when the first forwarded value is missing or invalid', () => {
    expect(waitlistClientKey(request({ 'x-real-ip': '192.0.2.30' }), true)).toBe('192.0.2.30')
    expect(
      waitlistClientKey(
        request({
          'x-forwarded-for': 'not-an-ip, 203.0.113.10',
          'x-real-ip': '2001:db8::30',
        }),
        true,
      ),
    ).toBe('2001:db8::30')
  })

  it('uses one conservative unknown bucket when proxy headers are absent or invalid', () => {
    expect(waitlistClientKey(request(), true)).toBe('unknown')
    expect(
      waitlistClientKey(
        request({
          'x-forwarded-for': 'not-an-ip',
          'x-real-ip': 'also-not-an-ip',
        }),
        true,
      ),
    ).toBe('unknown')
  })

  it('canonicalizes equivalent IPv6 and IPv4-mapped values', () => {
    expect(
      waitlistClientKey(
        request({ 'x-forwarded-for': '2001:0db8:0000:0000:0000:0000:0000:0030' }),
        true,
      ),
    ).toBe('2001:db8::30')
    expect(waitlistClientKey(request({ 'x-forwarded-for': '::ffff:203.0.113.10' }), true)).toBe(
      '203.0.113.10',
    )
  })

  it('rejects private, loopback, and link-local forwarding values', () => {
    expect(
      waitlistClientKey(
        request({
          'x-forwarded-for': '10.0.0.1',
          'x-real-ip': '192.0.2.30',
        }),
        true,
      ),
    ).toBe('192.0.2.30')
    expect(waitlistClientKey(request({ 'x-forwarded-for': '127.0.0.1' }), true)).toBe('unknown')
    expect(waitlistClientKey(request({ 'x-forwarded-for': 'fe80::1' }), true)).toBe('unknown')
    expect(waitlistClientKey(request({ 'x-forwarded-for': 'fec0::1' }), true)).toBe('unknown')
    expect(waitlistClientKey(request({ 'x-forwarded-for': '::10.0.0.1' }), true)).toBe('unknown')
    expect(waitlistClientKey(request({ 'x-forwarded-for': '::127.0.0.1' }), true)).toBe('unknown')
    expect(waitlistClientKey(request({ 'x-forwarded-for': '::ffff:0:192.168.1.1' }), true)).toBe(
      'unknown',
    )
  })

  it('fails closed for scoped IPv6 values that URL parsing cannot canonicalize', () => {
    expect(waitlistClientKey(request({ 'x-forwarded-for': 'fe80::1%eth0' }), true)).toBe('unknown')
  })
})

describe('waitlist rate-limit buckets', () => {
  it('separates buckets by the first forwarded client IP', () => {
    const firstClient = request({
      'x-forwarded-for': '203.0.113.10, 198.51.100.20',
    })
    const secondClient = request({
      'x-forwarded-for': '203.0.113.11, 198.51.100.20',
    })

    for (let count = 0; count < WAITLIST_MAX_SUBMISSIONS; count += 1) {
      expect(() => assertWaitlistRateLimit(firstClient, 1_000, true)).not.toThrow()
    }

    expect(() => assertWaitlistRateLimit(firstClient, 1_000, true)).toThrow()
    expect(() => assertWaitlistRateLimit(secondClient, 1_000, true)).not.toThrow()
  })

  it('shares the unknown bucket and rate-limits safely without proxy headers', () => {
    for (let count = 0; count < WAITLIST_MAX_SUBMISSIONS; count += 1) {
      expect(() => assertWaitlistRateLimit(request(), 1_000)).not.toThrow()
    }

    expect(() =>
      assertWaitlistRateLimit(request({ 'x-forwarded-for': 'invalid-client-value' }), 1_000),
    ).toThrow()
  })

  it('resets a bucket after the fixed window', () => {
    const client = request({ 'x-real-ip': '192.0.2.30' })
    for (let count = 0; count < WAITLIST_MAX_SUBMISSIONS; count += 1) {
      assertWaitlistRateLimit(client, 1_000, true)
    }

    expect(() => assertWaitlistRateLimit(client, 1_000, true)).toThrow()
    expect(() =>
      assertWaitlistRateLimit(client, 1_000 + WAITLIST_RATE_LIMIT_WINDOW_MS, true),
    ).not.toThrow()
  })

  it('reports the actual remaining Retry-After seconds at the window boundary', () => {
    const client = request({ 'x-real-ip': '192.0.2.30' })
    for (let count = 0; count < 12; count += 1) {
      assertWaitlistRateLimit(client, 1_000, true)
    }

    let error: unknown
    try {
      assertWaitlistRateLimit(client, 600_999, true)
    } catch (caught) {
      error = caught
    }

    expect(waitlistRetryAfterSeconds(error)).toBe(1)
  })

  it('bounds active client buckets and conservatively shares overflow traffic', () => {
    for (let count = 0; count < 1023; count += 1) {
      assertWaitlistRateLimit(
        request({ 'x-forwarded-for': `2001:db8:${count.toString(16)}::1` }),
        1_000,
        true,
      )
    }

    for (let count = 0; count < 12; count += 1) {
      assertWaitlistRateLimit(
        request({ 'x-forwarded-for': `2001:db8:1000:${count.toString(16)}::1` }),
        1_000,
        true,
      )
    }

    expect(waitlistRateLimitBucketCountForTests()).toBe(1024)
    expect(() =>
      assertWaitlistRateLimit(request({ 'x-forwarded-for': '2001:db8:1000:ffff::1' }), 1_000, true),
    ).toThrow()
  })

  it('sweeps expired client buckets before admitting new traffic', () => {
    for (let count = 0; count < 10; count += 1) {
      assertWaitlistRateLimit(
        request({ 'x-forwarded-for': `2001:db8:${count.toString(16)}::1` }),
        1_000,
        true,
      )
    }
    expect(waitlistRateLimitBucketCountForTests()).toBe(10)

    assertWaitlistRateLimit(
      request({ 'x-forwarded-for': '2001:db8:ffff::1' }),
      1_000 + 600_000,
      true,
    )
    expect(waitlistRateLimitBucketCountForTests()).toBe(1)
  })
})

describe('ISSUE-108 operational boundary', () => {
  it('records the trusted-proxy assumptions and review state', () => {
    expect(issueSource).toContain('github_issue: 239')
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('client IP のログ・永続化')
    expect(releaseDoc).toContain('Proxy Client IP / Rate Limit Boundary')
    expect(releaseDoc).toContain('除去または上書き')
    expect(releaseDoc).toContain('WAITLIST_TRUST_PROXY_HEADERS=true')
    expect(releaseDoc).toContain('最大 1024 bucket')
    expect(issueIndexSource).toContain('`ISSUE-108` / `#239`: PR 作成 / review / merge 待ち。')
  })
})
