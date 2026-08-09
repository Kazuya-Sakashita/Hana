'use client'

import type { Metric } from 'web-vitals'
import {
  webVitalRouteGroupForPathname,
  isWebVitalStatusDurationCombination,
  WEB_VITAL_OPERATION_BY_NAME,
  webVitalDurationBucketForValue,
  webVitalStatusForValue,
} from '@/features/metrics/shared/web-vitals-dimensions'
import type { components } from '@/lib/api/generated/schema'
import { canonicalizeBareUuid } from '@/lib/uuid'

export type WebVitalsReport = components['schemas']['WebVitalsReport']

export function createWebVitalsReport(
  metric: Metric,
  pathname: string,
  eventId = crypto.randomUUID(),
): WebVitalsReport {
  if (!Number.isFinite(metric.value) || metric.value < 0) {
    throw new Error('invalid_web_vital_value')
  }
  const canonicalEventId = canonicalizeBareUuid(eventId)
  if (!canonicalEventId) throw new Error('invalid_web_vital_event_id')
  const operation = WEB_VITAL_OPERATION_BY_NAME[metric.name]
  const status = webVitalStatusForValue(operation, metric.value)
  const durationBucket = webVitalDurationBucketForValue(operation, metric.value)
  if (
    !isWebVitalStatusDurationCombination({
      operation,
      status,
      duration_bucket: durationBucket,
    })
  ) {
    throw new Error('invalid_web_vital_dimensions')
  }
  return {
    schema_version: 'hana-web-vitals-report/v2',
    event_id: canonicalEventId,
    operation,
    reason: 'not_applicable',
    route_group: webVitalRouteGroupForPathname(pathname),
    status,
    duration_bucket: durationBucket,
  }
}
