'use client'

import type { components } from '@/lib/api/generated/schema'

type ProductEventReport = components['schemas']['ProductEventReport']
export type ProductEventName = ProductEventReport['event_name']
export type ProductEventElapsedBucket = ProductEventReport['elapsed_bucket']

export const PRODUCT_EVENT_OUTBOX_STORAGE_KEY = 'hana:productEventOutbox:v3'
export const PRODUCT_EVENT_OUTBOX_TTL_MS = 24 * 60 * 60 * 1000
export const PRODUCT_EVENT_OUTBOX_MAX_ENTRIES = 50
const PRODUCT_EVENT_OUTBOX_MAX_FLUSH_PER_RUN = 20
const PRODUCT_EVENT_OUTBOX_MAX_RETRY_MS = 60_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TELEMETRY_BINDING_PATTERN = /^v2\.\d{10}\.[0-9a-f]{64}$/
const OCCURRED_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/
const EVENT_NAMES = new Set<ProductEventName>([
  'record_started',
  'photo_selected',
  'ai_draft_shown',
  'memory_saved',
  'memory_viewed',
])
const ELAPSED_BUCKETS = new Set<ProductEventElapsedBucket>([
  'not_applicable',
  'under_10s',
  'from_10_to_30s',
  'from_31_to_60s',
  'over_60s',
])

type ProductEventOutboxEntry = {
  report: ProductEventReport
  queuedAt: number
  attempts: number
  nextAttemptAt: number
}

type StoredProductEventOutbox = {
  version: 3
  telemetryBinding: string
  degradation: ProductEventDegradation
  entries: ProductEventOutboxEntry[]
}

export type ProductEventDegradation =
  | 'NONE'
  | 'STORAGE_UNAVAILABLE'
  | 'CAPACITY_EXCEEDED'
  | 'TTL_EXPIRED'
  | 'AUTH_BOUNDARY'

type ProductEventSendResult = 'acknowledged' | 'authentication_rejected' | 'retry'

let activeFlush: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let activeTelemetryBinding: string | null = null
let activeDegradation: ProductEventDegradation = 'NONE'

function emptyOutbox(): StoredProductEventOutbox {
  return {
    version: 3,
    telemetryBinding: activeTelemetryBinding ?? '',
    degradation: activeDegradation,
    entries: [],
  }
}

function markDegradation(reason: Exclude<ProductEventDegradation, 'NONE'>): void {
  if (activeDegradation === 'NONE') activeDegradation = reason
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

function isProductEventReport(value: unknown): value is ProductEventReport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const report = value as Record<string, unknown>
  return (
    hasExactKeys(report, [
      'event_name',
      'event_id',
      'flow_id',
      'elapsed_bucket',
      'occurred_minute_utc',
    ]) &&
    typeof report.event_name === 'string' &&
    EVENT_NAMES.has(report.event_name as ProductEventName) &&
    typeof report.event_id === 'string' &&
    UUID_PATTERN.test(report.event_id) &&
    typeof report.flow_id === 'string' &&
    UUID_PATTERN.test(report.flow_id) &&
    typeof report.elapsed_bucket === 'string' &&
    ELAPSED_BUCKETS.has(report.elapsed_bucket as ProductEventElapsedBucket) &&
    typeof report.occurred_minute_utc === 'string' &&
    OCCURRED_MINUTE_PATTERN.test(report.occurred_minute_utc)
  )
}

function isOutboxEntry(value: unknown): value is ProductEventOutboxEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const entry = value as Record<string, unknown>
  return (
    hasExactKeys(entry, ['report', 'queuedAt', 'attempts', 'nextAttemptAt']) &&
    isProductEventReport(entry.report) &&
    typeof entry.queuedAt === 'number' &&
    Number.isFinite(entry.queuedAt) &&
    Number.isInteger(entry.attempts) &&
    (entry.attempts as number) >= 0 &&
    typeof entry.nextAttemptAt === 'number' &&
    Number.isFinite(entry.nextAttemptAt)
  )
}

function getSessionStorage(): Storage | null {
  try {
    return typeof globalThis.sessionStorage === 'undefined' ? null : globalThis.sessionStorage
  } catch {
    return null
  }
}

function readOutbox(now = Date.now()): StoredProductEventOutbox {
  const storage = getSessionStorage()
  if (!storage || !activeTelemetryBinding) {
    if (!storage && activeTelemetryBinding) markDegradation('STORAGE_UNAVAILABLE')
    return emptyOutbox()
  }
  try {
    const raw = storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
    if (!raw) return emptyOutbox()
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    const outbox = parsed as Record<string, unknown>
    if (
      outbox.version === 3 &&
      typeof outbox.telemetryBinding === 'string' &&
      TELEMETRY_BINDING_PATTERN.test(outbox.telemetryBinding) &&
      outbox.telemetryBinding !== activeTelemetryBinding
    ) {
      markDegradation('AUTH_BOUNDARY')
      storage.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
      return emptyOutbox()
    }
    if (
      !hasExactKeys(outbox, ['version', 'telemetryBinding', 'degradation', 'entries']) ||
      outbox.version !== 3 ||
      outbox.telemetryBinding !== activeTelemetryBinding ||
      typeof outbox.telemetryBinding !== 'string' ||
      !TELEMETRY_BINDING_PATTERN.test(outbox.telemetryBinding) ||
      !Array.isArray(outbox.entries) ||
      outbox.entries.length > PRODUCT_EVENT_OUTBOX_MAX_ENTRIES ||
      !outbox.entries.every(isOutboxEntry) ||
      ![
        'NONE',
        'STORAGE_UNAVAILABLE',
        'CAPACITY_EXCEEDED',
        'TTL_EXPIRED',
        'AUTH_BOUNDARY',
      ].includes(String(outbox.degradation))
    ) {
      throw new Error()
    }
    if (outbox.degradation !== 'NONE') {
      activeDegradation = outbox.degradation as ProductEventDegradation
    }
    const entries = outbox.entries.filter(
      (entry) => now - entry.queuedAt <= PRODUCT_EVENT_OUTBOX_TTL_MS,
    )
    if (entries.length !== outbox.entries.length) {
      markDegradation('TTL_EXPIRED')
      writeOutbox({
        version: 3,
        telemetryBinding: activeTelemetryBinding,
        degradation: activeDegradation,
        entries,
      })
    }
    return {
      version: 3,
      telemetryBinding: activeTelemetryBinding,
      degradation: activeDegradation,
      entries,
    }
  } catch {
    markDegradation('STORAGE_UNAVAILABLE')
    try {
      storage.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
      storage.setItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY, JSON.stringify(emptyOutbox()))
    } catch {
      return emptyOutbox()
    }
    return emptyOutbox()
  }
}

function writeOutbox(outbox: StoredProductEventOutbox): boolean {
  const storage = getSessionStorage()
  if (!storage) {
    markDegradation('STORAGE_UNAVAILABLE')
    return false
  }
  try {
    const persisted = { ...outbox, degradation: activeDegradation }
    if (persisted.entries.length === 0 && persisted.degradation === 'NONE') {
      storage.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
    } else {
      storage.setItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY, JSON.stringify(persisted))
    }
    return true
  } catch {
    markDegradation('STORAGE_UNAVAILABLE')
    return false
  }
}

function enqueue(report: ProductEventReport, now = Date.now()): boolean {
  if (!activeTelemetryBinding) return false
  const outbox = readOutbox(now)
  const existingStage = outbox.entries.find(
    (entry) =>
      entry.report.flow_id === report.flow_id && entry.report.event_name === report.event_name,
  )
  if (existingStage) return true
  if (outbox.entries.length >= PRODUCT_EVENT_OUTBOX_MAX_ENTRIES) {
    markDegradation('CAPACITY_EXCEEDED')
    writeOutbox(outbox)
    return false
  }
  return writeOutbox({
    version: 3,
    telemetryBinding: activeTelemetryBinding,
    degradation: activeDegradation,
    entries: [...outbox.entries, { report, queuedAt: now, attempts: 0, nextAttemptAt: now }],
  })
}

function retryDelay(attempts: number): number {
  return Math.min(1000 * 2 ** Math.min(attempts, 6), PRODUCT_EVENT_OUTBOX_MAX_RETRY_MS)
}

async function send(report: ProductEventReport): Promise<ProductEventSendResult> {
  if (!activeTelemetryBinding) return 'authentication_rejected'
  const response = await fetch('/v1/metrics/events', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hana-Telemetry-Binding': activeTelemetryBinding,
    },
    credentials: 'same-origin',
    referrerPolicy: 'no-referrer',
    keepalive: true,
    body: JSON.stringify(report),
  })
  if (response.status === 204) return 'acknowledged'
  if (response.status === 401 || response.status === 403) return 'authentication_rejected'
  return 'retry'
}

function scheduleRetry(delay: number): void {
  if (retryTimer !== null) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    void flushProductEventOutbox()
  }, delay)
}

async function runFlush(now: () => number): Promise<void> {
  if (!activeTelemetryBinding) return
  let processed = 0
  while (processed < PRODUCT_EVENT_OUTBOX_MAX_FLUSH_PER_RUN) {
    const current = readOutbox(now())
    const entry = current.entries.find((candidate) => candidate.nextAttemptAt <= now())
    if (!entry) {
      const nextAttemptAt = current.entries.reduce<number | null>(
        (next, candidate) =>
          next === null || candidate.nextAttemptAt < next ? candidate.nextAttemptAt : next,
        null,
      )
      if (nextAttemptAt !== null) scheduleRetry(Math.max(0, nextAttemptAt - now()))
      return
    }

    let result: ProductEventSendResult = 'retry'
    try {
      result = await send(entry.report)
    } catch {
      result = 'retry'
    }

    const latest = readOutbox(now())
    const index = latest.entries.findIndex(
      (candidate) => candidate.report.event_id === entry.report.event_id,
    )
    if (index < 0) continue
    if (result === 'authentication_rejected') {
      clearProductEventOutbox()
      return
    }
    if (result === 'acknowledged') latest.entries.splice(index, 1)
    else {
      const attempts = latest.entries[index]!.attempts + 1
      latest.entries[index] = {
        ...latest.entries[index]!,
        attempts,
        nextAttemptAt: now() + retryDelay(attempts),
      }
    }
    writeOutbox(latest)
    processed += 1
  }

  const remaining = readOutbox(now()).entries
  if (remaining.length > 0) {
    const nextAttemptAt = Math.min(...remaining.map((entry) => entry.nextAttemptAt))
    scheduleRetry(Math.max(0, nextAttemptAt - now()))
  }
}

export function productEventElapsedBucket(elapsedMs: number | null): ProductEventElapsedBucket {
  if (elapsedMs === null) return 'not_applicable'
  if (elapsedMs < 10_000) return 'under_10s'
  if (elapsedMs <= 30_000) return 'from_10_to_30s'
  if (elapsedMs <= 60_000) return 'from_31_to_60s'
  return 'over_60s'
}

export function createProductEventFlowId(): string {
  return crypto.randomUUID()
}

function createProductEventId(occurredAt: Date): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let timestamp = occurredAt.getTime()
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff
    timestamp = Math.floor(timestamp / 256)
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function flushProductEventOutbox(now: () => number = Date.now): Promise<void> {
  if (activeFlush) return activeFlush
  activeFlush = runFlush(now).finally(() => {
    activeFlush = null
  })
  return activeFlush
}

export function startProductEventOutbox(): () => void {
  void flushProductEventOutbox()
  const flush = () => void flushProductEventOutbox()
  globalThis.addEventListener?.('online', flush)
  globalThis.addEventListener?.('visibilitychange', flush)
  return () => {
    globalThis.removeEventListener?.('online', flush)
    globalThis.removeEventListener?.('visibilitychange', flush)
  }
}

export function clearProductEventOutbox(
  degradation: Exclude<ProductEventDegradation, 'NONE'> = 'AUTH_BOUNDARY',
): void {
  markDegradation(degradation)
  activeTelemetryBinding = null
  if (retryTimer !== null) {
    clearTimeout(retryTimer)
    retryTimer = null
  }
  try {
    getSessionStorage()?.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
  } catch {
    return
  }
}

export function setProductEventTelemetryBinding(binding: string | null): void {
  const normalized = binding && TELEMETRY_BINDING_PATTERN.test(binding) ? binding : null
  if (activeTelemetryBinding !== null && activeTelemetryBinding !== normalized) {
    clearProductEventOutbox()
    activeDegradation = 'NONE'
  }
  activeTelemetryBinding = normalized
}

export function reportProductEvent({
  eventName,
  flowId,
  elapsedMs,
  telemetryBinding,
}: {
  eventName: ProductEventName
  flowId?: string
  elapsedMs: number | null
  telemetryBinding: string
}): void {
  try {
    setProductEventTelemetryBinding(telemetryBinding)
    if (!activeTelemetryBinding) return
    const occurredAt = new Date(Math.floor(Date.now() / 60_000) * 60_000)
    const report: ProductEventReport = {
      event_name: eventName,
      event_id: createProductEventId(occurredAt),
      flow_id: flowId ?? crypto.randomUUID(),
      elapsed_bucket: productEventElapsedBucket(elapsedMs),
      occurred_minute_utc: occurredAt.toISOString().replace('.000Z', 'Z'),
    }
    if (enqueue(report)) void flushProductEventOutbox()
  } catch {
    return
  }
}

export function readProductEventOutboxForTest(
  now = Date.now(),
): readonly ProductEventOutboxEntry[] {
  return readOutbox(now).entries
}

export function readProductEventDegradationForTest(): ProductEventDegradation {
  return activeDegradation
}

export function resetProductEventOutboxForTests(): void {
  activeDegradation = 'NONE'
  activeTelemetryBinding = null
  activeFlush = null
  if (retryTimer !== null) clearTimeout(retryTimer)
  retryTimer = null
}
