import { createHmac, timingSafeEqual } from 'node:crypto'
import type { components } from '@/lib/api/generated/schema'
import { problems } from '@/server/api/problems'

export type ProductEventReport = components['schemas']['ProductEventReport']

const DEVELOPMENT_HASH_PEPPER = 'hana-product-event-development-pepper'
export const PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS = 60 * 1000
export const PRODUCT_EVENT_MAX_REPORTS_PER_WINDOW = 60
export const PRODUCT_EVENT_MAX_REQUESTS_PER_WINDOW = 120
export const PRODUCT_EVENT_RETENTION_DAYS = 90
const PRODUCT_EVENT_HASH_PEPPER_MIN_LENGTH = 32
const PRODUCT_EVENT_BINDING_DOMAIN = 'hana-product-event-telemetry-binding/v2\0'
const PRODUCT_EVENT_BINDING_BUCKET_MS = 60 * 60 * 1000
const PRODUCT_EVENT_BINDING_MAX_TTL_MS = 2 * PRODUCT_EVENT_BINDING_BUCKET_MS
const PRODUCT_EVENT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const ALLOWED_KEYS = new Set([
  'event_name',
  'event_id',
  'flow_id',
  'occurred_minute_utc',
  'elapsed_bucket',
])
const EVENT_NAMES = new Set<ProductEventReport['event_name']>([
  'record_started',
  'photo_selected',
  'ai_draft_shown',
  'memory_saved',
  'memory_viewed',
])
const ELAPSED_BUCKETS = new Set<ProductEventReport['elapsed_bucket']>([
  'not_applicable',
  'under_10s',
  'from_10_to_30s',
  'from_31_to_60s',
  'over_60s',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UTC_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/
const TELEMETRY_BINDING_PATTERN = /^v2\.(\d{10})\.([0-9a-f]{64})$/
const PRODUCT_EVENT_MAX_REQUEST_BUCKETS = 4096
const requestBuckets = new Map<string, { count: number; resetAt: number }>()

function validation(path: string, message: string): never {
  throw problems.validation([{ path, reason: 'invalid', message }])
}

function hashPepper(): string {
  const configured = process.env.PRODUCT_EVENT_HASH_PEPPER
  if (configured && configured.length >= PRODUCT_EVENT_HASH_PEPPER_MIN_LENGTH) return configured
  if (process.env.NODE_ENV === 'production') {
    throw new Error('PRODUCT_EVENT_HASH_PEPPER is missing or too short')
  }
  return DEVELOPMENT_HASH_PEPPER
}

export function productEventActorHash(userId: string): string {
  return createHmac('sha256', hashPepper()).update(userId).digest('hex')
}

function bindingDigest(userId: string, sessionReference: string, expiresAtSeconds: string): string {
  const digest = createHmac('sha256', hashPepper())
    .update(PRODUCT_EVENT_BINDING_DOMAIN)
    .update(userId)
    .update('\0')
    .update(sessionReference)
    .update('\0')
    .update(expiresAtSeconds)
    .digest('hex')
  return digest
}

export function productEventTelemetryBinding(
  userId: string,
  sessionReference: string,
  now = new Date(),
): string {
  if (!Number.isFinite(Date.parse(sessionReference))) throw new Error('invalid telemetry session')
  const expiresAtMs =
    (Math.floor(now.getTime() / PRODUCT_EVENT_BINDING_BUCKET_MS) + 2) *
    PRODUCT_EVENT_BINDING_BUCKET_MS
  const expiresAtSeconds = String(Math.floor(expiresAtMs / 1000))
  return `v2.${expiresAtSeconds}.${bindingDigest(userId, sessionReference, expiresAtSeconds)}`
}

export function productEventSessionReference(user: { last_sign_in_at?: string | null }): string {
  const sessionReference = user.last_sign_in_at
  if (!sessionReference || !Number.isFinite(Date.parse(sessionReference)))
    throw problems.forbidden()
  return sessionReference
}

export function assertProductEventTelemetryBinding(
  userId: string,
  sessionReference: string,
  supplied: string | null,
  now = new Date(),
): void {
  const match = supplied?.match(TELEMETRY_BINDING_PATTERN)
  const expiresAtSeconds = match?.[1] ?? '0'
  const expiresAtMs = Number(expiresAtSeconds) * 1000
  const validExpiry =
    Number.isSafeInteger(expiresAtMs) &&
    expiresAtMs > now.getTime() &&
    expiresAtMs - now.getTime() <= PRODUCT_EVENT_BINDING_MAX_TTL_MS
  const expectedValue = `v2.${expiresAtSeconds}.${bindingDigest(
    userId,
    sessionReference,
    expiresAtSeconds,
  )}`
  const expected = Buffer.from(expectedValue, 'utf8')
  const received = Buffer.from(supplied ?? '', 'utf8')
  const sameLength = expected.length === received.length
  const comparable = sameLength ? received : Buffer.alloc(expected.length)
  if (!validExpiry || !timingSafeEqual(expected, comparable) || !sameLength) {
    throw problems.forbidden()
  }
}

export function productEventOccurrenceMinuteFromEventId(eventId: string): string | null {
  if (!UUID_V7_PATTERN.test(eventId)) return null
  const timestampHex = eventId.replace(/-/g, '').slice(0, 12)
  const timestamp = Number.parseInt(timestampHex, 16)
  if (!Number.isSafeInteger(timestamp) || timestamp % 60_000 !== 0) return null
  try {
    return new Date(timestamp).toISOString().replace('.000Z', 'Z')
  } catch {
    return null
  }
}

export function assertProductEventOccurrenceMatchesId(
  event: Pick<ProductEventReport, 'event_id' | 'occurred_minute_utc'>,
): void {
  if (productEventOccurrenceMinuteFromEventId(event.event_id) !== event.occurred_minute_utc) {
    validation('body.event_id', 'event IDと発生UTC分を一致させてください')
  }
}

export function assertProductEventRequestRateLimit(actorHash: string, now = Date.now()): void {
  for (const [key, bucket] of requestBuckets) {
    if (bucket.resetAt <= now) requestBuckets.delete(key)
  }
  const existing = requestBuckets.get(actorHash)
  if (!existing) {
    if (requestBuckets.size >= PRODUCT_EVENT_MAX_REQUEST_BUCKETS) throw problems.rateLimited()
    requestBuckets.set(actorHash, { count: 1, resetAt: now + PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS })
    return
  }
  if (existing.count >= PRODUCT_EVENT_MAX_REQUESTS_PER_WINDOW) throw problems.rateLimited()
  existing.count += 1
}

export function resetProductEventRequestRateLimitForTests(): void {
  requestBuckets.clear()
}

export function assertProductEventIngestReady(): void {
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.PRODUCT_EVENT_INGEST_ACTIVATION !== 'issue-186-retention-v1'
  ) {
    throw problems.telemetryUnavailable()
  }
}

export function productEventRetentionCutoff(now = new Date()): Date {
  return new Date(now.getTime() - PRODUCT_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000)
}

export function parseProductEventReport(raw: unknown, now = new Date()): ProductEventReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    validation('body', '入力内容を確認してください')
  }

  const input = raw as Record<string, unknown>
  const unknownKey = Object.keys(input).find((key) => !ALLOWED_KEYS.has(key))
  if (unknownKey) {
    validation(`body.${unknownKey}`, '許可されていない項目です')
  }

  if (typeof input.event_name !== 'string' || !EVENT_NAMES.has(input.event_name as never)) {
    validation('body.event_name', '許可されていないイベント名です')
  }
  if (typeof input.event_id !== 'string' || !UUID_V7_PATTERN.test(input.event_id)) {
    validation('body.event_id', 'UTC分を埋め込んだUUIDv7形式で指定してください')
  }
  if (typeof input.flow_id !== 'string' || !UUID_PATTERN.test(input.flow_id)) {
    validation('body.flow_id', 'UUID形式で指定してください')
  }
  if (typeof input.occurred_minute_utc !== 'string') {
    validation('body.occurred_minute_utc', 'UTCの分単位日時を指定してください')
  }
  const occurredAt = Date.parse(input.occurred_minute_utc)
  const canonicalOccurredMinute = Number.isFinite(occurredAt)
    ? new Date(occurredAt).toISOString().replace('.000Z', 'Z')
    : null
  if (
    !UTC_MINUTE_PATTERN.test(input.occurred_minute_utc) ||
    canonicalOccurredMinute !== input.occurred_minute_utc ||
    occurredAt > now.getTime() ||
    now.getTime() - occurredAt > PRODUCT_EVENT_MAX_AGE_MS
  ) {
    validation('body.occurred_minute_utc', '直近24時間以内のUTC分を指定してください')
  }
  if (
    typeof input.elapsed_bucket !== 'string' ||
    !ELAPSED_BUCKETS.has(input.elapsed_bucket as never)
  ) {
    validation('body.elapsed_bucket', '許可されていない経過時間帯です')
  }
  if (
    (['record_started', 'memory_viewed'].includes(input.event_name) &&
      input.elapsed_bucket !== 'not_applicable') ||
    (!['record_started', 'memory_viewed'].includes(input.event_name) &&
      input.elapsed_bucket === 'not_applicable')
  ) {
    validation('body.elapsed_bucket', 'イベントに対応する経過時間帯を指定してください')
  }

  return {
    event_name: input.event_name as ProductEventReport['event_name'],
    event_id: input.event_id as string,
    flow_id: input.flow_id as string,
    occurred_minute_utc: input.occurred_minute_utc,
    elapsed_bucket: input.elapsed_bucket as ProductEventReport['elapsed_bucket'],
  }
}
