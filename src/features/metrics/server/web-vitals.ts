import type { components } from '@/lib/api/generated/schema'
import { problems } from '@/server/api/problems'
import { shouldSampleTelemetry, type TelemetryDimensions } from './telemetry-contract'

export type WebVitalsReport = components['schemas']['WebVitalsReport']

const ALLOWED_KEYS = [
  'schema_version',
  'event_id',
  'operation',
  'reason',
  'route_group',
  'status',
  'duration_bucket',
] as const
const OPERATIONS = new Set<WebVitalsReport['operation']>([
  'web_vital_cls',
  'web_vital_fcp',
  'web_vital_inp',
  'web_vital_lcp',
  'web_vital_ttfb',
])
const ROUTE_GROUPS = new Set<WebVitalsReport['route_group']>([
  'public',
  'auth',
  'home',
  'record',
  'memory',
  'settings',
  'other_private',
])
const STATUSES = new Set<WebVitalsReport['status']>(['good', 'needs_improvement', 'poor'])
const DURATION_BUCKETS = new Set<WebVitalsReport['duration_bucket']>([
  'not_applicable',
  'under_100ms',
  'from_100_to_500ms',
  'from_501_to_1000ms',
  'from_1001_to_2500ms',
  'from_2501_to_4000ms',
  'over_4000ms',
])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DEVELOPMENT_SAMPLING_KEY = 'hana-web-vitals-development-sampling-key'
const DEVELOPMENT_SAMPLING_KEY_VERSION = 'development-v1'
const SAMPLING_KEY_VERSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

function validation(path: string, message: string): never {
  throw problems.validation([{ path, reason: 'invalid', message }])
}

function hasExactKeys(input: Record<string, unknown>): boolean {
  const actual = Object.keys(input).sort()
  const expected = [...ALLOWED_KEYS].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseWebVitalsReport(raw: unknown): WebVitalsReport {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    validation('body', '入力内容を確認してください')
  }
  const input = raw as Record<string, unknown>
  if (!hasExactKeys(input)) validation('body', '許可された固定項目だけを指定してください')
  if (input.schema_version !== 'hana-web-vitals-report/v2') {
    validation('body.schema_version', '対応していないschema versionです')
  }
  if (typeof input.event_id !== 'string' || !UUID_PATTERN.test(input.event_id)) {
    validation('body.event_id', 'UUID形式で指定してください')
  }
  if (typeof input.operation !== 'string' || !OPERATIONS.has(input.operation as never)) {
    validation('body.operation', '許可されていないoperationです')
  }
  if (input.reason !== 'not_applicable') {
    validation('body.reason', '許可されていないreasonです')
  }
  if (typeof input.route_group !== 'string' || !ROUTE_GROUPS.has(input.route_group as never)) {
    validation('body.route_group', '許可されていないroute groupです')
  }
  if (typeof input.status !== 'string' || !STATUSES.has(input.status as never)) {
    validation('body.status', '許可されていないstatusです')
  }
  if (
    typeof input.duration_bucket !== 'string' ||
    !DURATION_BUCKETS.has(input.duration_bucket as never)
  ) {
    validation('body.duration_bucket', '許可されていないduration bucketです')
  }

  const isCls = input.operation === 'web_vital_cls'
  if (
    (isCls && input.duration_bucket !== 'not_applicable') ||
    (!isCls && input.duration_bucket === 'not_applicable')
  ) {
    validation('body.duration_bucket', 'operationに対応するduration bucketを指定してください')
  }

  return {
    schema_version: 'hana-web-vitals-report/v2',
    event_id: input.event_id as string,
    operation: input.operation as WebVitalsReport['operation'],
    reason: 'not_applicable',
    route_group: input.route_group as WebVitalsReport['route_group'],
    status: input.status as WebVitalsReport['status'],
    duration_bucket: input.duration_bucket as WebVitalsReport['duration_bucket'],
  }
}

export function toWebVitalsTelemetryDimensions(report: WebVitalsReport): TelemetryDimensions {
  return {
    operation: report.operation,
    reason: report.reason,
    route_group: report.route_group,
    status: report.status,
    duration_bucket: report.duration_bucket,
  }
}

export function shouldSampleWebVitals(eventId: string): boolean {
  if (!UUID_PATTERN.test(eventId)) validation('body.event_id', 'UUID形式で指定してください')
  const configured = process.env.WEB_VITALS_SAMPLING_KEY
  const configuredVersion = process.env.WEB_VITALS_SAMPLING_KEY_VERSION
  if (
    process.env.NODE_ENV === 'production' &&
    (!configured ||
      configured.length < 32 ||
      !configuredVersion ||
      !SAMPLING_KEY_VERSION_PATTERN.test(configuredVersion) ||
      configuredVersion === 'none')
  ) {
    throw problems.telemetryUnavailable()
  }
  const key = configured && configured.length >= 32 ? configured : DEVELOPMENT_SAMPLING_KEY
  const keyVersion =
    configuredVersion &&
    configuredVersion !== 'none' &&
    SAMPLING_KEY_VERSION_PATTERN.test(configuredVersion)
      ? configuredVersion
      : DEVELOPMENT_SAMPLING_KEY_VERSION
  return shouldSampleTelemetry('web_vital', eventId, {
    key_version: keyVersion,
    key,
  })
}
