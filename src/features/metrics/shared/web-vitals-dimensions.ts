export const OPENAPI_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const WEB_VITAL_OPERATIONS = [
  'web_vital_cls',
  'web_vital_fcp',
  'web_vital_inp',
  'web_vital_lcp',
  'web_vital_ttfb',
] as const

export const WEB_VITAL_STATUSES = ['good', 'needs_improvement', 'poor'] as const

export const WEB_VITAL_DURATION_BUCKETS = [
  'not_applicable',
  'under_100ms',
  'from_100_to_500ms',
  'from_501_to_1000ms',
  'from_1001_to_2500ms',
  'from_2501_to_4000ms',
  'over_4000ms',
] as const

export type WebVitalOperation = (typeof WEB_VITAL_OPERATIONS)[number]
export type WebVitalStatus = (typeof WEB_VITAL_STATUSES)[number]
export type WebVitalDurationBucket = (typeof WEB_VITAL_DURATION_BUCKETS)[number]

export const WEB_VITAL_OPERATION_BY_NAME = {
  CLS: 'web_vital_cls',
  FCP: 'web_vital_fcp',
  INP: 'web_vital_inp',
  LCP: 'web_vital_lcp',
  TTFB: 'web_vital_ttfb',
} as const

export const WEB_VITAL_THRESHOLDS: Record<WebVitalOperation, readonly [number, number]> = {
  web_vital_cls: [0.1, 0.25],
  web_vital_fcp: [1800, 3000],
  web_vital_inp: [200, 500],
  web_vital_lcp: [2500, 4000],
  web_vital_ttfb: [800, 1800],
}

type NumericInterval = {
  minimum: number
  minimumInclusive: boolean
  maximum: number
  maximumInclusive: boolean
}

const DURATION_INTERVALS: Record<
  Exclude<WebVitalDurationBucket, 'not_applicable'>,
  NumericInterval
> = {
  under_100ms: {
    minimum: 0,
    minimumInclusive: true,
    maximum: 100,
    maximumInclusive: false,
  },
  from_100_to_500ms: {
    minimum: 100,
    minimumInclusive: true,
    maximum: 500,
    maximumInclusive: true,
  },
  from_501_to_1000ms: {
    minimum: 500,
    minimumInclusive: false,
    maximum: 1000,
    maximumInclusive: true,
  },
  from_1001_to_2500ms: {
    minimum: 1000,
    minimumInclusive: false,
    maximum: 2500,
    maximumInclusive: true,
  },
  from_2501_to_4000ms: {
    minimum: 2500,
    minimumInclusive: false,
    maximum: 4000,
    maximumInclusive: true,
  },
  over_4000ms: {
    minimum: 4000,
    minimumInclusive: false,
    maximum: Number.POSITIVE_INFINITY,
    maximumInclusive: false,
  },
}

function statusInterval(operation: WebVitalOperation, status: WebVitalStatus): NumericInterval {
  const [good, poor] = WEB_VITAL_THRESHOLDS[operation]
  if (status === 'good') {
    return { minimum: 0, minimumInclusive: true, maximum: good, maximumInclusive: true }
  }
  if (status === 'needs_improvement') {
    return { minimum: good, minimumInclusive: false, maximum: poor, maximumInclusive: true }
  }
  return {
    minimum: poor,
    minimumInclusive: false,
    maximum: Number.POSITIVE_INFINITY,
    maximumInclusive: false,
  }
}

function intervalsOverlap(left: NumericInterval, right: NumericInterval): boolean {
  const minimum = Math.max(left.minimum, right.minimum)
  const maximum = Math.min(left.maximum, right.maximum)
  if (minimum < maximum) return true
  if (minimum > maximum) return false
  const leftIncludes =
    (minimum !== left.minimum || left.minimumInclusive) &&
    (maximum !== left.maximum || left.maximumInclusive)
  const rightIncludes =
    (minimum !== right.minimum || right.minimumInclusive) &&
    (maximum !== right.maximum || right.maximumInclusive)
  return leftIncludes && rightIncludes
}

export function webVitalStatusForValue(
  operation: WebVitalOperation,
  value: number,
): WebVitalStatus {
  const [good, poor] = WEB_VITAL_THRESHOLDS[operation]
  if (value <= good) return 'good'
  if (value <= poor) return 'needs_improvement'
  return 'poor'
}

export function webVitalDurationBucketForValue(
  operation: WebVitalOperation,
  value: number,
): WebVitalDurationBucket {
  if (operation === 'web_vital_cls') return 'not_applicable'
  if (value < 100) return 'under_100ms'
  if (value <= 500) return 'from_100_to_500ms'
  if (value <= 1000) return 'from_501_to_1000ms'
  if (value <= 2500) return 'from_1001_to_2500ms'
  if (value <= 4000) return 'from_2501_to_4000ms'
  return 'over_4000ms'
}

export function isWebVitalStatusDurationCombination(input: {
  operation: WebVitalOperation
  status: WebVitalStatus
  duration_bucket: WebVitalDurationBucket
}): boolean {
  if (input.operation === 'web_vital_cls') return input.duration_bucket === 'not_applicable'
  if (input.duration_bucket === 'not_applicable') return false
  return intervalsOverlap(
    DURATION_INTERVALS[input.duration_bucket],
    statusInterval(input.operation, input.status),
  )
}
