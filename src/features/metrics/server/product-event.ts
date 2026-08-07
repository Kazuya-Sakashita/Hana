import { createHmac, timingSafeEqual } from 'node:crypto'
import type { components } from '@/lib/api/generated/schema'
import { problems } from '@/server/api/problems'

export type ProductEventReport = components['schemas']['ProductEventReport']

const DEVELOPMENT_HASH_PEPPER = 'hana-product-event-development-pepper'
export const PRODUCT_EVENT_RATE_LIMIT_WINDOW_MS = 60 * 1000
export const PRODUCT_EVENT_MAX_REPORTS_PER_WINDOW = 60
export const PRODUCT_EVENT_RETENTION_DAYS = 90
const PRODUCT_EVENT_HASH_PEPPER_MIN_LENGTH = 32
const PRODUCT_EVENT_BINDING_DOMAIN = 'hana-product-event-telemetry-binding/v1\0'
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
const UTC_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/

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

export function productEventTelemetryBinding(userId: string): string {
  const digest = createHmac('sha256', hashPepper())
    .update(PRODUCT_EVENT_BINDING_DOMAIN)
    .update(userId)
    .digest('hex')
  return `v1.${digest}`
}

export function assertProductEventTelemetryBinding(userId: string, supplied: string | null): void {
  const expected = Buffer.from(productEventTelemetryBinding(userId), 'utf8')
  const received = Buffer.from(supplied ?? '', 'utf8')
  const sameLength = expected.length === received.length
  const comparable = sameLength ? received : Buffer.alloc(expected.length)
  if (!timingSafeEqual(expected, comparable) || !sameLength) throw problems.forbidden()
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
  if (typeof input.event_id !== 'string' || !UUID_PATTERN.test(input.event_id)) {
    validation('body.event_id', 'UUID形式で指定してください')
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
