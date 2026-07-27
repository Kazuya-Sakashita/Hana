import 'server-only'

import { isIP } from 'node:net'
import { problems } from '@/server/api/problems'

export const WAITLIST_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
export const WAITLIST_MAX_SUBMISSIONS = 12
export const WAITLIST_MAX_BUCKETS = 1024
export const WAITLIST_RETRY_AFTER_SECONDS = Math.ceil(WAITLIST_RATE_LIMIT_WINDOW_MS / 1000)

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const retryAfterSecondsByError = new WeakMap<object, number>()
const OVERFLOW_BUCKET_KEY = '__overflow__'

export function assertWaitlistRateLimit(
  request: Request,
  now = Date.now(),
  trustProxyHeaders = process.env.WAITLIST_TRUST_PROXY_HEADERS === 'true',
): void {
  pruneExpiredBuckets(now)
  const key = boundedBucketKey(waitlistClientKey(request, trustProxyHeaders))
  const bucket = buckets.get(key)

  if (!bucket) {
    buckets.set(key, { count: 1, resetAt: now + WAITLIST_RATE_LIMIT_WINDOW_MS })
    return
  }

  if (bucket.count >= WAITLIST_MAX_SUBMISSIONS) {
    const error = problems.rateLimited()
    retryAfterSecondsByError.set(error, Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)))
    throw error
  }

  bucket.count += 1
}

export function resetWaitlistRateLimitForTests(): void {
  buckets.clear()
}

export function waitlistRateLimitBucketCountForTests(): number {
  return buckets.size
}

export function waitlistRetryAfterSeconds(error: unknown): number | null {
  return typeof error === 'object' && error !== null
    ? (retryAfterSecondsByError.get(error) ?? null)
    : null
}

export function waitlistClientKey(request: Request, trustProxyHeaders = false): string {
  if (!trustProxyHeaders) return 'unknown'

  const forwardedFor = validClientIp(request.headers.get('x-forwarded-for')?.split(',')[0])
  const realIp = validClientIp(request.headers.get('x-real-ip'))
  return forwardedFor || realIp || 'unknown'
}

function boundedBucketKey(clientKey: string): string {
  if (buckets.has(clientKey)) return clientKey
  return buckets.size < WAITLIST_MAX_BUCKETS - 1 ? clientKey : OVERFLOW_BUCKET_KEY
}

function pruneExpiredBuckets(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

function validClientIp(value: string | null | undefined): string | null {
  const candidate = value?.trim()
  if (!candidate) return null

  const version = isIP(candidate)
  if (version === 4) return isAllowedIpv4(candidate) ? candidate : null
  if (version !== 6) return null

  if (candidate.includes('%')) return null

  let canonical: string
  try {
    canonical = new URL(`http://[${candidate}]`).hostname.slice(1, -1).toLowerCase()
  } catch {
    return null
  }

  const embeddedIpv4 =
    /^(?:::ffff:|::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical) ??
    /^::ffff:0:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical)
  if (embeddedIpv4) {
    const high = Number.parseInt(embeddedIpv4[1] ?? '0', 16)
    const low = Number.parseInt(embeddedIpv4[2] ?? '0', 16)
    const ipv4 = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`
    return isAllowedIpv4(ipv4) ? ipv4 : null
  }

  return isAllowedIpv6(canonical) ? canonical : null
}

function isAllowedIpv4(value: string): boolean {
  const [first = 0, second = 0] = value.split('.').map(Number)
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  )
}

function isAllowedIpv6(value: string): boolean {
  if (value === '::' || value === '::1') return false
  const firstGroup = Number.parseInt(value.split(':')[0] || '0', 16)
  return !(
    (firstGroup >= 0xfc00 && firstGroup <= 0xfdff) ||
    (firstGroup >= 0xfe80 && firstGroup <= 0xfebf) ||
    (firstGroup >= 0xfec0 && firstGroup <= 0xfeff) ||
    firstGroup >= 0xff00
  )
}
