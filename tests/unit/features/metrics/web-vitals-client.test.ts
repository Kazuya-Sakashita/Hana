import { describe, expect, it } from 'vitest'
import type { Metric } from 'web-vitals'
import { createWebVitalsReport } from '@/features/metrics/client/web-vitals-report'
import {
  isWebVitalStatusDurationCombination,
  WEB_VITAL_STATUSES,
  type WebVitalDurationBucket,
  type WebVitalOperation,
} from '@/features/metrics/shared/web-vitals-dimensions'

function metric(name: Metric['name'], value: number): Metric {
  return { name, value, id: 'raw-web-vitals-id', navigationType: 'navigate' } as Metric
}

describe('createWebVitalsReport', () => {
  it('converts raw metric and route data to seven fixed fields', () => {
    const report = createWebVitalsReport(
      metric('LCP', 2400),
      '/memory/00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000010',
    )

    expect(report).toEqual({
      schema_version: 'hana-web-vitals-report/v2',
      event_id: '00000000-0000-4000-8000-000000000010',
      operation: 'web_vital_lcp',
      reason: 'not_applicable',
      route_group: 'memory',
      status: 'good',
      duration_bucket: 'from_1001_to_2500ms',
    })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('raw-web-vitals-id')
    expect(serialized).not.toContain('/memory/')
    expect(report).not.toHaveProperty('value')
    expect(report).not.toHaveProperty('navigationType')
  })

  it.each([
    ['CLS', 0.2, 'needs_improvement', 'not_applicable'],
    ['FCP', 99, 'good', 'under_100ms'],
    ['INP', 500, 'needs_improvement', 'from_100_to_500ms'],
    ['LCP', 4001, 'poor', 'over_4000ms'],
    ['TTFB', 900, 'needs_improvement', 'from_501_to_1000ms'],
  ] as const)('buckets %s without returning its raw value', (name, value, status, bucket) => {
    const report = createWebVitalsReport(
      metric(name, value),
      '/',
      '00000000-0000-4000-8000-000000000010',
    )
    expect(report.status).toBe(status)
    expect(report.duration_bucket).toBe(bucket)
    expect(report.route_group).toBe('home')
    expect(report).not.toHaveProperty('value')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects invalid raw value %s', (value) => {
    expect(() => createWebVitalsReport(metric('LCP', value), '/')).toThrow(
      'invalid_web_vital_value',
    )
  })

  it('accepts the full OpenAPI uuid format without imposing a version or variant', () => {
    expect(
      createWebVitalsReport(metric('LCP', 2500), '/', '00000000-0000-0000-0000-000000000000')
        .event_id,
    ).toBe('00000000-0000-0000-0000-000000000000')
    expect(() => createWebVitalsReport(metric('LCP', 2500), '/', 'not-a-uuid')).toThrow(
      'invalid_web_vital_event_id',
    )
  })

  it.each([
    ['FCP', 1800],
    ['FCP', 1800.1],
    ['FCP', 3000.1],
    ['INP', 200],
    ['INP', 200.1],
    ['INP', 500.1],
    ['LCP', 2500],
    ['LCP', 2500.1],
    ['LCP', 4000.1],
    ['TTFB', 800],
    ['TTFB', 800.1],
    ['TTFB', 1800.1],
  ] as const)('keeps the shared %s status and duration ranges consistent at %s', (name, value) => {
    const report = createWebVitalsReport(
      metric(name, value),
      '/',
      '00000000-0000-4000-8000-000000000010',
    )
    expect(
      isWebVitalStatusDurationCombination({
        operation: report.operation,
        status: report.status,
        duration_bucket: report.duration_bucket,
      }),
    ).toBe(true)
  })

  it.each([
    ['web_vital_cls', 'not_applicable', ['good', 'needs_improvement', 'poor']],
    ['web_vital_fcp', 'under_100ms', ['good']],
    ['web_vital_fcp', 'from_1001_to_2500ms', ['good', 'needs_improvement']],
    ['web_vital_fcp', 'from_2501_to_4000ms', ['needs_improvement', 'poor']],
    ['web_vital_inp', 'from_100_to_500ms', ['good', 'needs_improvement']],
    ['web_vital_inp', 'from_501_to_1000ms', ['poor']],
    ['web_vital_lcp', 'from_1001_to_2500ms', ['good']],
    ['web_vital_lcp', 'from_2501_to_4000ms', ['needs_improvement']],
    ['web_vital_lcp', 'over_4000ms', ['poor']],
    ['web_vital_ttfb', 'from_501_to_1000ms', ['good', 'needs_improvement']],
    ['web_vital_ttfb', 'from_1001_to_2500ms', ['needs_improvement', 'poor']],
    ['web_vital_ttfb', 'over_4000ms', ['poor']],
  ] as const)(
    'allows only compatible status values for %s and %s',
    (operation, durationBucket, expectedStatuses) => {
      const accepted = WEB_VITAL_STATUSES.filter((status) =>
        isWebVitalStatusDurationCombination({
          operation: operation as WebVitalOperation,
          status,
          duration_bucket: durationBucket as WebVitalDurationBucket,
        }),
      )
      expect(accepted).toEqual(expectedStatuses)
    },
  )
})
