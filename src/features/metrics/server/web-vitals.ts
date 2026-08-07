import type { components } from '@/lib/api/generated/schema'
import { problems } from '@/server/api/problems'
import type {
  TelemetryDimensions,
  TelemetryDurationBucket,
  TelemetryOperation,
  TelemetryRouteGroup,
  TelemetryStatus,
} from './telemetry-contract'

export type WebVitalsReport = components['schemas']['WebVitalsReport']

const ALLOWED_KEYS = new Set(['name', 'value', 'id', 'navigationType', 'route'])
const ALLOWED_NAMES = new Set<WebVitalsReport['name']>(['CLS', 'FCP', 'INP', 'LCP', 'TTFB'])
const ALLOWED_NAVIGATION_TYPES = new Set<NonNullable<WebVitalsReport['navigationType']>>([
  'navigate',
  'reload',
  'back-forward',
  'back-forward-cache',
  'prerender',
  'restore',
])

const VITAL_THRESHOLDS: Record<WebVitalsReport['name'], readonly [number, number]> = {
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  INP: [200, 500],
  LCP: [2500, 4000],
  TTFB: [800, 1800],
}

function validation(path: string, message: string): never {
  throw problems.validation([{ path, reason: 'invalid', message }])
}

export function parseWebVitalsReport(raw: unknown): WebVitalsReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    validation('body', '入力内容を確認してください')
  }
  const input = raw as Record<string, unknown>
  const unknownKey = Object.keys(input).find((key) => !ALLOWED_KEYS.has(key))
  if (unknownKey) validation(`body.${unknownKey}`, '許可されていない項目です')
  if (typeof input.name !== 'string' || !ALLOWED_NAMES.has(input.name as never)) {
    validation('body.name', '許可されていないmetric名です')
  }
  if (typeof input.value !== 'number' || !Number.isFinite(input.value) || input.value < 0) {
    validation('body.value', '0以上の有限値を指定してください')
  }
  if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 128) {
    validation('body.id', '1〜128文字で指定してください')
  }
  if (typeof input.route !== 'string' || input.route.length === 0 || input.route.length > 256) {
    validation('body.route', '1〜256文字で指定してください')
  }
  if (
    input.navigationType !== undefined &&
    input.navigationType !== null &&
    (typeof input.navigationType !== 'string' ||
      !ALLOWED_NAVIGATION_TYPES.has(input.navigationType as never))
  ) {
    validation('body.navigationType', '許可されていないnavigation typeです')
  }
  return {
    name: input.name as WebVitalsReport['name'],
    value: input.value as number,
    id: input.id as string,
    navigationType: (input.navigationType ?? null) as WebVitalsReport['navigationType'],
    route: input.route as string,
  }
}

function routeGroup(route: string): TelemetryRouteGroup {
  if (route === '/lp') return 'public'
  if (route === '/') return 'home'
  if (route.startsWith('/auth') || route.startsWith('/sign-in')) return 'auth'
  if (route.startsWith('/record')) return 'record'
  if (route.startsWith('/memory/')) return 'memory'
  if (route.startsWith('/settings')) return 'settings'
  return 'other_private'
}

function status(report: WebVitalsReport): TelemetryStatus {
  const [good, poor] = VITAL_THRESHOLDS[report.name]
  if (report.value <= good) return 'good'
  if (report.value <= poor) return 'needs_improvement'
  return 'poor'
}

function durationBucket(report: WebVitalsReport): TelemetryDurationBucket {
  if (report.name === 'CLS') return 'not_applicable'
  if (report.value < 100) return 'under_100ms'
  if (report.value <= 500) return 'from_100_to_500ms'
  if (report.value <= 1000) return 'from_501_to_1000ms'
  if (report.value <= 2500) return 'from_1001_to_2500ms'
  if (report.value <= 4000) return 'from_2501_to_4000ms'
  return 'over_4000ms'
}

export function toWebVitalsTelemetryDimensions(report: WebVitalsReport): TelemetryDimensions {
  return {
    operation: `web_vital_${report.name.toLowerCase()}` as TelemetryOperation,
    reason: 'not_applicable',
    route_group: routeGroup(report.route),
    status: status(report),
    duration_bucket: durationBucket(report),
  }
}
