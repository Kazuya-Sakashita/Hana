import { describe, expect, it } from 'vitest'
import {
  isProductEventElapsedBucket,
  isProductEventElapsedBucketForName,
  isProductEventName,
  PRODUCT_EVENT_ELAPSED_BUCKETS,
  PRODUCT_EVENT_NAMES,
} from '@/features/metrics/shared/product-event-dimensions'

const COMBINATIONS = PRODUCT_EVENT_NAMES.flatMap((eventName) =>
  PRODUCT_EVENT_ELAPSED_BUCKETS.map((elapsedBucket) => [eventName, elapsedBucket] as const),
)

describe('ProductEvent dimensions', () => {
  it.each(COMBINATIONS)('validates the %s and %s combination', (eventName, elapsedBucket) => {
    const hasNoElapsedTime = eventName === 'record_started' || eventName === 'memory_viewed'
    const expected = hasNoElapsedTime
      ? elapsedBucket === 'not_applicable'
      : elapsedBucket !== 'not_applicable'

    expect(isProductEventElapsedBucketForName(eventName, elapsedBucket)).toBe(expected)
  })

  it('rejects dimensions outside the OpenAPI allowlists', () => {
    expect(isProductEventName('free_form_event')).toBe(false)
    expect(isProductEventElapsedBucket('raw_12345ms')).toBe(false)
  })
})
