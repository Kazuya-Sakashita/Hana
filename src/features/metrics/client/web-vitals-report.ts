'use client'

import type { Metric } from 'web-vitals'
import type { components } from '@/lib/api/generated/schema'

export type WebVitalsReport = components['schemas']['WebVitalsReport']

const VITAL_THRESHOLDS: Record<Metric['name'], readonly [number, number]> = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
}

function routeGroup(pathname: string): WebVitalsReport['route_group'] {
  if (pathname === '/lp' || pathname === '/privacy') return 'public'
  if (pathname === '/') return 'home'
  if (pathname === '/sign-in' || pathname.startsWith('/auth/')) return 'auth'
  if (pathname === '/record' || pathname.startsWith('/record/')) return 'record'
  if (pathname.startsWith('/memory/')) return 'memory'
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return 'settings'
  return 'other_private'
}

function status(metric: Metric): WebVitalsReport['status'] {
  const [good, poor] = VITAL_THRESHOLDS[metric.name]
  if (metric.value <= good) return 'good'
  if (metric.value <= poor) return 'needs_improvement'
  return 'poor'
}

function durationBucket(metric: Metric): WebVitalsReport['duration_bucket'] {
  if (metric.name === 'CLS') return 'not_applicable'
  if (metric.value < 100) return 'under_100ms'
  if (metric.value <= 500) return 'from_100_to_500ms'
  if (metric.value <= 1000) return 'from_501_to_1000ms'
  if (metric.value <= 2500) return 'from_1001_to_2500ms'
  if (metric.value <= 4000) return 'from_2501_to_4000ms'
  return 'over_4000ms'
}

export function createWebVitalsReport(
  metric: Metric,
  pathname: string,
  eventId = crypto.randomUUID(),
): WebVitalsReport {
  if (!Number.isFinite(metric.value) || metric.value < 0) {
    throw new Error('invalid_web_vital_value')
  }
  return {
    schema_version: 'hana-web-vitals-report/v2',
    event_id: eventId,
    operation: `web_vital_${metric.name.toLowerCase()}` as WebVitalsReport['operation'],
    reason: 'not_applicable',
    route_group: routeGroup(pathname),
    status: status(metric),
    duration_bucket: durationBucket(metric),
  }
}
