'use client'

import type { components } from '@/lib/api/generated/schema'

type ProductEventReport = components['schemas']['ProductEventReport']
export type ProductEventName = ProductEventReport['event_name']
export type ProductEventElapsedBucket = ProductEventReport['elapsed_bucket']

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

export function reportProductEvent({
  eventName,
  flowId,
  elapsedMs,
}: {
  eventName: ProductEventName
  flowId?: string
  elapsedMs: number | null
}): void {
  try {
    const body: ProductEventReport = {
      event_name: eventName,
      event_id: crypto.randomUUID(),
      flow_id: flowId ?? crypto.randomUUID(),
      elapsed_bucket: productEventElapsedBucket(elapsedMs),
    }

    void fetch('/v1/metrics/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => undefined)
  } catch {
    return
  }
}
