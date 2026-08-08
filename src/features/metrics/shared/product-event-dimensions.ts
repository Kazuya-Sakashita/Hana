import type { components } from '@/lib/api/generated/schema'

export type ProductEventName = components['schemas']['ProductEventReport']['event_name']
export type ProductEventElapsedBucket =
  components['schemas']['ProductEventReport']['elapsed_bucket']

export const PRODUCT_EVENT_NAMES = [
  'record_started',
  'photo_selected',
  'ai_draft_shown',
  'memory_saved',
  'memory_viewed',
] as const satisfies readonly ProductEventName[]

export const PRODUCT_EVENT_ELAPSED_BUCKETS = [
  'not_applicable',
  'under_10s',
  'from_10_to_30s',
  'from_31_to_60s',
  'over_60s',
] as const satisfies readonly ProductEventElapsedBucket[]

const NAMES = new Set<string>(PRODUCT_EVENT_NAMES)
const ELAPSED_BUCKETS = new Set<string>(PRODUCT_EVENT_ELAPSED_BUCKETS)

export function isProductEventName(value: unknown): value is ProductEventName {
  return typeof value === 'string' && NAMES.has(value)
}

export function isProductEventElapsedBucket(value: unknown): value is ProductEventElapsedBucket {
  return typeof value === 'string' && ELAPSED_BUCKETS.has(value)
}

export function isProductEventElapsedBucketForName(
  eventName: ProductEventName,
  elapsedBucket: ProductEventElapsedBucket,
): boolean {
  const hasNoElapsedTime = eventName === 'record_started' || eventName === 'memory_viewed'
  return hasNoElapsedTime ? elapsedBucket === 'not_applicable' : elapsedBucket !== 'not_applicable'
}
