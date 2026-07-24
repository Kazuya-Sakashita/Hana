import 'server-only'

import { problems } from '@/server/api/problems'

const WINDOW_MS = 10 * 60 * 1000
const MAX_SUBMISSIONS = 12
export const WAITLIST_RETRY_AFTER_SECONDS = Math.ceil(WINDOW_MS / 1000)

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function assertWaitlistRateLimit(request: Request, now = Date.now()): void {
  const key = clientKey(request)
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return
  }

  if (bucket.count >= MAX_SUBMISSIONS) {
    throw problems.rateLimited()
  }

  bucket.count += 1
}

export function resetWaitlistRateLimitForTests(): void {
  buckets.clear()
}

function clientKey(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  return forwardedFor || realIp || 'unknown'
}
