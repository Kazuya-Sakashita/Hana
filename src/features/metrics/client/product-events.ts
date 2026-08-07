'use client'

import type { components } from '@/lib/api/generated/schema'

type ProductEventReport = components['schemas']['ProductEventReport']
export type ProductEventName = ProductEventReport['event_name']
export type ProductEventElapsedBucket = ProductEventReport['elapsed_bucket']

export const PRODUCT_EVENT_OUTBOX_STORAGE_KEY = 'hana:productEventOutbox:v2'
export const PRODUCT_EVENT_OUTBOX_TTL_MS = 24 * 60 * 60 * 1000
export const PRODUCT_EVENT_OUTBOX_MAX_ENTRIES = 50
const PRODUCT_EVENT_OUTBOX_MAX_FLUSH_PER_RUN = 20
const PRODUCT_EVENT_OUTBOX_MAX_RETRY_MS = 60_000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TELEMETRY_BINDING_PATTERN = /^v1\.[0-9a-f]{64}$/
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
  version: 2
  telemetryBinding: string
  entries: ProductEventOutboxEntry[]
}

type ProductEventSendResult = 'acknowledged' | 'authentication_rejected' | 'retry'

let activeFlush: Promise<void> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let activeTelemetryBinding: string | null = null

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
    return { version: 2, telemetryBinding: activeTelemetryBinding ?? '', entries: [] }
  }
  try {
    const raw = storage.getItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
    if (!raw) return { version: 2, telemetryBinding: activeTelemetryBinding, entries: [] }
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    const outbox = parsed as Record<string, unknown>
    if (
      !hasExactKeys(outbox, ['version', 'telemetryBinding', 'entries']) ||
      outbox.version !== 2 ||
      outbox.telemetryBinding !== activeTelemetryBinding ||
      typeof outbox.telemetryBinding !== 'string' ||
      !TELEMETRY_BINDING_PATTERN.test(outbox.telemetryBinding) ||
      !Array.isArray(outbox.entries) ||
      outbox.entries.length > PRODUCT_EVENT_OUTBOX_MAX_ENTRIES ||
      !outbox.entries.every(isOutboxEntry)
    ) {
      throw new Error()
    }
    const entries = outbox.entries.filter(
      (entry) => now - entry.queuedAt <= PRODUCT_EVENT_OUTBOX_TTL_MS,
    )
    if (entries.length !== outbox.entries.length) {
      writeOutbox({ version: 2, telemetryBinding: activeTelemetryBinding, entries })
    }
    return { version: 2, telemetryBinding: activeTelemetryBinding, entries }
  } catch {
    try {
      storage.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
    } catch {
      return { version: 2, telemetryBinding: activeTelemetryBinding, entries: [] }
    }
    return { version: 2, telemetryBinding: activeTelemetryBinding, entries: [] }
  }
}

function writeOutbox(outbox: StoredProductEventOutbox): boolean {
  const storage = getSessionStorage()
  if (!storage) return false
  try {
    if (outbox.entries.length === 0) storage.removeItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY)
    else storage.setItem(PRODUCT_EVENT_OUTBOX_STORAGE_KEY, JSON.stringify(outbox))
    return true
  } catch {
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
  if (outbox.entries.length >= PRODUCT_EVENT_OUTBOX_MAX_ENTRIES) return false
  return writeOutbox({
    version: 2,
    telemetryBinding: activeTelemetryBinding,
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

export function clearProductEventOutbox(): void {
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
      event_id: crypto.randomUUID(),
      flow_id: flowId ?? crypto.randomUUID(),
      elapsed_bucket: productEventElapsedBucket(elapsedMs),
      occurred_minute_utc: occurredAt.toISOString().replace('.000Z', 'Z'),
    }
    if (enqueue(report)) void flushProductEventOutbox()
    else void send(report).catch(() => undefined)
  } catch {
    return
  }
}

export function readProductEventOutboxForTest(
  now = Date.now(),
): readonly ProductEventOutboxEntry[] {
  return readOutbox(now).entries
}
