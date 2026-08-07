import { describe, expect, it } from 'vitest'
import type { Metric } from 'web-vitals'
import { createWebVitalsReport } from '@/features/metrics/client/web-vitals-report'

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
})
