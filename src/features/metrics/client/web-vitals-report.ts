'use client'

import type { Metric } from 'web-vitals'
import {
  isWebVitalStatusDurationCombination,
  OPENAPI_UUID_PATTERN,
  WEB_VITAL_OPERATION_BY_NAME,
  webVitalDurationBucketForValue,
  webVitalStatusForValue,
} from '@/features/metrics/shared/web-vitals-dimensions'
import type { components } from '@/lib/api/generated/schema'

export type WebVitalsReport = components['schemas']['WebVitalsReport']

function routeGroup(pathname: string): WebVitalsReport['route_group'] {
  if (pathname === '/lp' || pathname === '/privacy') return 'public'
  if (pathname === '/') return 'home'
  if (pathname === '/sign-in' || pathname.startsWith('/auth/')) return 'auth'
  if (pathname === '/record' || pathname.startsWith('/record/')) return 'record'
  if (pathname.startsWith('/memory/')) return 'memory'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
  return 'other_private'
}

export function createWebVitalsReport(
  metric: Metric,
  pathname: string,
  eventId = crypto.randomUUID(),
): WebVitalsReport {
  if (!Number.isFinite(metric.value) || metric.value < 0) {
    throw new Error('invalid_web_vital_value')
  }
  if (!OPENAPI_UUID_PATTERN.test(eventId)) throw new Error('invalid_web_vital_event_id')
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
    event_id: eventId,
    operation,
    reason: 'not_applicable',
    route_group: routeGroup(pathname),
    status,
    duration_bucket: durationBucket,
  }
}
