import { createHash } from 'node:crypto'

export const TELEMETRY_EVENT_SCHEMA_VERSION = 'hana-telemetry-event/v1' as const
export const TELEMETRY_EVIDENCE_SCHEMA_VERSION = 'hana-telemetry-evidence/v1' as const
export const TELEMETRY_QUERY_VERSION = 'issue-152-v1' as const
export const TELEMETRY_RETENTION_DAYS = 90
export const TELEMETRY_MIN_CELL_SIZE = 5

export const TELEMETRY_SAMPLING = {
  funnel: 1,
  web_vital: 0.1,
  api: 0.1,
  ai: 1,
} as const

export const TELEMETRY_ACCESS_POLICY = {
  ingest: ['deduplicate', 'rate_limit', 'insert'],
  retention: ['delete_expired'],
  aggregate_reader: ['read_versioned_window'],
} as const

const OPERATIONS = [
  'record_started',
  'photo_selected',
  'ai_draft_shown',
  'memory_saved',
  'memory_viewed',
  'web_vital_cls',
  'web_vital_fcp',
  'web_vital_inp',
  'web_vital_lcp',
  'web_vital_ttfb',
  'api_request',
  'ai_generation',
] as const
const REASONS = [
  'stage_observed',
  'not_applicable',
  'none',
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'consent_required',
  'quota_exceeded',
  'policy_blocked',
  'provider_error',
  'upstream_error',
  'internal_error',
  'timeout',
  'discarded',
] as const
const ROUTE_GROUPS = [
  'public',
  'auth',
  'home',
  'record',
  'memory',
  'settings',
  'metrics',
  'account',
  'ai',
  'other_private',
] as const
const STATUSES = [
  'success',
  'client_error',
  'server_error',
  'timeout',
  'discarded',
  'good',
  'needs_improvement',
  'poor',
] as const
const DURATION_BUCKETS = [
  'not_applicable',
  'under_100ms',
  'from_100_to_500ms',
  'from_501_to_1000ms',
  'from_1001_to_2500ms',
  'from_2501_to_4000ms',
  'over_4000ms',
  'under_10s',
  'from_10_to_30s',
  'from_31_to_60s',
  'over_60s',
] as const
const SOURCES = ['funnel', 'web_vital', 'api', 'ai'] as const
const METRIC_STATUSES = ['PASS', 'FAIL', 'HOLD'] as const
const METRIC_IDS = [
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
  'M9',
  'M10',
  'M11',
  'M12',
  'north_star_monthly_memories_per_active_profile',
] as const
const METRIC_REASONS = [
  'memory_saved_within_window',
  'memory_not_saved',
  'memory_saved_after_window',
  'telemetry_incomplete',
  'stage_missing',
  'window_not_mature',
  'event_reordered_after_truth',
  'invalid_census',
  'minimum_not_met',
  'worst_case_passed',
  'best_case_failed',
  'censoring_changes_decision',
  'database_truth_complete',
  'target_not_configured',
] as const
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SHA_PATTERN = /^[0-9a-f]{40}$/
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

export type TelemetryOperation = (typeof OPERATIONS)[number]
export type TelemetryReason = (typeof REASONS)[number]
export type TelemetryRouteGroup = (typeof ROUTE_GROUPS)[number]
export type TelemetryStatus = (typeof STATUSES)[number]
export type TelemetryDurationBucket = (typeof DURATION_BUCKETS)[number]
export type TelemetrySource = (typeof SOURCES)[number]
export type MetricStatus = (typeof METRIC_STATUSES)[number]
export type TelemetryMetricId = (typeof METRIC_IDS)[number]
export type TelemetryMetricReason = (typeof METRIC_REASONS)[number]

export type TelemetryDimensions = {
  operation: TelemetryOperation
  reason: TelemetryReason
  route_group: TelemetryRouteGroup
  status: TelemetryStatus
  duration_bucket: TelemetryDurationBucket
}

export type TelemetryEnvelope = {
  schema_version: typeof TELEMETRY_EVENT_SCHEMA_VERSION
  event_id: string
  occurred_at_utc: string
  dimensions: TelemetryDimensions
}

export type TelemetryCompletenessResult = {
  source: TelemetrySource
  status: 'PASS' | 'HOLD'
  reason: 'complete' | 'expected_manifest_missing' | 'loss_detected' | 'unexpected_event'
  duplicate: 'NONE' | 'DETECTED'
  reorder: 'NONE' | 'DETECTED'
}

export const NORTH_STAR_CONTRACT = {
  metric_id: 'north_star_monthly_memories_per_active_profile',
  active_unit: 'profile_with_non_deleted_memory_created_in_utc_calendar_month',
  numerator: 'distinct_non_deleted_memory_created_in_same_utc_calendar_month',
  window: 'utc_calendar_month_half_open',
  deduplication: 'memory_id',
  completeness: 'database_memory_truth',
  status: 'diagnostic',
} as const

export class TelemetryContractError extends Error {
  constructor(readonly reason: 'invalid_input' | 'unknown_field' | 'unknown_value') {
    super(reason)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  )
}

function includes<const T extends readonly string[]>(
  values: T,
  value: unknown,
): value is T[number] {
  return typeof value === 'string' && values.includes(value as T[number])
}

function parseUtc(value: string): number | null {
  if (!UTC_PATTERN.test(value)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function telemetrySourceForOperation(operation: TelemetryOperation): TelemetrySource {
  if (operation.startsWith('web_vital_')) return 'web_vital'
  if (operation === 'api_request') return 'api'
  if (operation === 'ai_generation') return 'ai'
  return 'funnel'
}

function validDimensionsCombination(dimensions: TelemetryDimensions): boolean {
  const source = telemetrySourceForOperation(dimensions.operation)
  if (source === 'funnel') {
    const memoryViewed = dimensions.operation === 'memory_viewed'
    const noDuration = dimensions.operation === 'record_started' || memoryViewed
    return (
      dimensions.reason === 'stage_observed' &&
      dimensions.status === 'success' &&
      dimensions.route_group === (memoryViewed ? 'memory' : 'record') &&
      (noDuration
        ? dimensions.duration_bucket === 'not_applicable'
        : ['under_10s', 'from_10_to_30s', 'from_31_to_60s', 'over_60s'].includes(
            dimensions.duration_bucket,
          ))
    )
  }
  if (source === 'web_vital') {
    const cls = dimensions.operation === 'web_vital_cls'
    return (
      dimensions.reason === 'not_applicable' &&
      ['good', 'needs_improvement', 'poor'].includes(dimensions.status) &&
      (cls
        ? dimensions.duration_bucket === 'not_applicable'
        : [
            'under_100ms',
            'from_100_to_500ms',
            'from_501_to_1000ms',
            'from_1001_to_2500ms',
            'from_2501_to_4000ms',
            'over_4000ms',
          ].includes(dimensions.duration_bucket))
    )
  }
  if (source === 'api') {
    const validOutcome =
      (dimensions.status === 'success' && dimensions.reason === 'none') ||
      (dimensions.status === 'client_error' &&
        [
          'validation_error',
          'unauthorized',
          'forbidden',
          'not_found',
          'conflict',
          'rate_limited',
        ].includes(dimensions.reason)) ||
      (dimensions.status === 'server_error' &&
        ['internal_error', 'upstream_error'].includes(dimensions.reason)) ||
      (dimensions.status === 'timeout' && dimensions.reason === 'timeout')
    return validOutcome && !['ai', 'public'].includes(dimensions.route_group)
  }
  const validOutcome =
    (dimensions.status === 'success' && dimensions.reason === 'none') ||
    (dimensions.status === 'client_error' &&
      ['consent_required', 'quota_exceeded', 'policy_blocked'].includes(dimensions.reason)) ||
    (dimensions.status === 'server_error' && dimensions.reason === 'provider_error') ||
    (dimensions.status === 'timeout' && dimensions.reason === 'timeout') ||
    (dimensions.status === 'discarded' && dimensions.reason === 'discarded')
  return validOutcome && dimensions.route_group === 'ai'
}

export function parseTelemetryEnvelope(raw: unknown): TelemetryEnvelope {
  if (!isRecord(raw)) throw new TelemetryContractError('invalid_input')
  if (!hasExactKeys(raw, ['schema_version', 'event_id', 'occurred_at_utc', 'dimensions'])) {
    throw new TelemetryContractError('unknown_field')
  }
  if (
    raw.schema_version !== TELEMETRY_EVENT_SCHEMA_VERSION ||
    typeof raw.event_id !== 'string' ||
    !UUID_PATTERN.test(raw.event_id) ||
    typeof raw.occurred_at_utc !== 'string' ||
    parseUtc(raw.occurred_at_utc) === null ||
    !isRecord(raw.dimensions)
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  if (
    !hasExactKeys(raw.dimensions, [
      'operation',
      'reason',
      'route_group',
      'status',
      'duration_bucket',
    ])
  ) {
    throw new TelemetryContractError('unknown_field')
  }
  if (
    !includes(OPERATIONS, raw.dimensions.operation) ||
    !includes(REASONS, raw.dimensions.reason) ||
    !includes(ROUTE_GROUPS, raw.dimensions.route_group) ||
    !includes(STATUSES, raw.dimensions.status) ||
    !includes(DURATION_BUCKETS, raw.dimensions.duration_bucket)
  ) {
    throw new TelemetryContractError('unknown_value')
  }
  if (!validDimensionsCombination(raw.dimensions as TelemetryDimensions)) {
    throw new TelemetryContractError('unknown_value')
  }
  return {
    schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    event_id: raw.event_id,
    occurred_at_utc: raw.occurred_at_utc,
    dimensions: raw.dimensions as TelemetryDimensions,
  }
}

export function evaluateTelemetryCompleteness(input: {
  source: TelemetrySource
  expected_event_ids: readonly string[]
  received: readonly TelemetryEnvelope[]
}): TelemetryCompletenessResult {
  if (input.expected_event_ids.length === 0) {
    return {
      source: input.source,
      status: 'HOLD',
      reason: 'expected_manifest_missing',
      duplicate: 'NONE',
      reorder: 'NONE',
    }
  }
  const expected = new Set(input.expected_event_ids)
  const firstReceived: string[] = []
  const received = new Set<string>()
  let duplicate = false
  let unexpected = false
  for (const envelope of input.received) {
    if (received.has(envelope.event_id)) duplicate = true
    else firstReceived.push(envelope.event_id)
    received.add(envelope.event_id)
    if (
      !expected.has(envelope.event_id) ||
      telemetrySourceForOperation(envelope.dimensions.operation) !== input.source
    ) {
      unexpected = true
    }
  }
  const loss = input.expected_event_ids.some((eventId) => !received.has(eventId))
  const receivedExpectedOrder = firstReceived.filter((eventId) => expected.has(eventId))
  const expectedReceivedOrder = input.expected_event_ids.filter((eventId) => received.has(eventId))
  const reordered = receivedExpectedOrder.some(
    (eventId, index) => eventId !== expectedReceivedOrder[index],
  )
  return {
    source: input.source,
    status: loss || unexpected ? 'HOLD' : 'PASS',
    reason: unexpected ? 'unexpected_event' : loss ? 'loss_detected' : 'complete',
    duplicate: duplicate ? 'DETECTED' : 'NONE',
    reorder: reordered ? 'DETECTED' : 'NONE',
  }
}

export type SyntheticFunnelEvent = {
  event_id: string
  flow_id: string
  event_name: 'record_started' | 'photo_selected' | 'ai_draft_shown' | 'memory_saved'
  received_at_utc: string
}

export type SyntheticMemoryTruth = {
  idempotency_key: string
  created_at_utc: string
}

export function evaluateSyntheticFunnelFlow(input: {
  metric_id: 'M2' | 'M3'
  flow_id: string
  generated_at_utc: string
  completeness: TelemetryCompletenessResult
  events: readonly SyntheticFunnelEvent[]
  memories: readonly SyntheticMemoryTruth[]
}): { metric_id: 'M2' | 'M3'; status: MetricStatus; reason: string } {
  if (input.completeness.status !== 'PASS') {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'telemetry_incomplete' }
  }
  const stageName = input.metric_id === 'M2' ? 'photo_selected' : 'ai_draft_shown'
  const stages = input.events
    .filter((event) => event.flow_id === input.flow_id && event.event_name === stageName)
    .map((event) => ({ ...event, receivedAt: parseUtc(event.received_at_utc) }))
    .filter((event): event is typeof event & { receivedAt: number } => event.receivedAt !== null)
    .sort((left, right) => left.receivedAt - right.receivedAt)
  const stage = stages[0]
  if (!stage) return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_missing' }
  const generatedAt = parseUtc(input.generated_at_utc)
  if (generatedAt === null || generatedAt < stage.receivedAt + 30 * 60 * 1000) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'window_not_mature' }
  }
  const memory = input.memories
    .filter((candidate) => candidate.idempotency_key === input.flow_id)
    .map((candidate) => ({ ...candidate, createdAt: parseUtc(candidate.created_at_utc) }))
    .filter(
      (candidate): candidate is typeof candidate & { createdAt: number } =>
        candidate.createdAt !== null,
    )
    .sort((left, right) => left.createdAt - right.createdAt)[0]
  if (!memory) return { metric_id: input.metric_id, status: 'FAIL', reason: 'memory_not_saved' }
  if (memory.createdAt < stage.receivedAt) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'event_reordered_after_truth' }
  }
  return memory.createdAt < stage.receivedAt + 30 * 60 * 1000
    ? { metric_id: input.metric_id, status: 'PASS', reason: 'memory_saved_within_window' }
    : { metric_id: input.metric_id, status: 'FAIL', reason: 'memory_saved_after_window' }
}

export function evaluateCensoredRate(input: {
  metric_id: TelemetryMetricId
  eligible: number
  succeeded: number
  censored: number
  minimum: number
  target: number
}): { metric_id: TelemetryMetricId; status: MetricStatus; reason: TelemetryMetricReason } {
  const valid =
    Number.isSafeInteger(input.eligible) &&
    Number.isSafeInteger(input.succeeded) &&
    Number.isSafeInteger(input.censored) &&
    Number.isSafeInteger(input.minimum) &&
    input.eligible >= 0 &&
    input.succeeded >= 0 &&
    input.censored >= 0 &&
    input.succeeded + input.censored <= input.eligible &&
    input.minimum > 0 &&
    Number.isFinite(input.target) &&
    input.target >= 0 &&
    input.target <= 1
  if (!valid) return { metric_id: input.metric_id, status: 'HOLD', reason: 'invalid_census' }
  if (input.eligible < input.minimum) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'minimum_not_met' }
  }
  const lowerBound = input.succeeded / input.eligible
  const upperBound = (input.succeeded + input.censored) / input.eligible
  if (lowerBound >= input.target) {
    return { metric_id: input.metric_id, status: 'PASS', reason: 'worst_case_passed' }
  }
  if (upperBound < input.target) {
    return { metric_id: input.metric_id, status: 'FAIL', reason: 'best_case_failed' }
  }
  return { metric_id: input.metric_id, status: 'HOLD', reason: 'censoring_changes_decision' }
}

export type SuppressionCell = {
  id: string
  value: number
}

export function applyTelemetrySuppression(input: {
  cells: readonly SuppressionCell[]
  reconstruction_groups: readonly (readonly string[])[]
}): { id: string; value: number | 'suppressed'; reason: 'visible' | 'primary' | 'secondary' }[] {
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  const primary = new Set(
    input.cells.filter((cell) => cell.value < TELEMETRY_MIN_CELL_SIZE).map((cell) => cell.id),
  )
  const secondary = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const group of input.reconstruction_groups) {
      const present = group.filter((id) => cells.has(id))
      const hidden = present.filter((id) => primary.has(id) || secondary.has(id))
      if (present.length < 2 || hidden.length !== 1) continue
      const candidate = present
        .filter((id) => !primary.has(id) && !secondary.has(id))
        .sort((left, right) => {
          const difference = cells.get(left)!.value - cells.get(right)!.value
          return difference === 0 ? left.localeCompare(right) : difference
        })[0]
      if (candidate) {
        secondary.add(candidate)
        changed = true
      }
    }
  }
  return input.cells.map((cell) => {
    if (primary.has(cell.id)) return { id: cell.id, value: 'suppressed', reason: 'primary' }
    if (secondary.has(cell.id)) return { id: cell.id, value: 'suppressed', reason: 'secondary' }
    return { id: cell.id, value: cell.value, reason: 'visible' }
  })
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  )
}

export function telemetryDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export function shouldSampleTelemetry(source: TelemetrySource, eventId: string): boolean {
  if (!UUID_PATTERN.test(eventId)) throw new TelemetryContractError('invalid_input')
  const rate = TELEMETRY_SAMPLING[source]
  if (rate === 1) return true
  const bucket = createHash('sha256').update(eventId).digest().readUInt32BE(0) / 0xffffffff
  return bucket < rate
}

export type TelemetryMetricResult = {
  metric_id: TelemetryMetricId
  status: MetricStatus
  reason: TelemetryMetricReason
}

export function buildTelemetryEvidence(input: {
  source_sha: string
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  generated_at_utc: string
  metric_window_manifest_digest: string
  eligible_census_digest: string
  censoring_status_digest: string
  completeness: readonly TelemetryCompletenessResult[]
  metrics: readonly TelemetryMetricResult[]
}): {
  schema_version: typeof TELEMETRY_EVIDENCE_SCHEMA_VERSION
  source_sha: string
  query_version: typeof TELEMETRY_QUERY_VERSION
  event_schema_version: typeof TELEMETRY_EVENT_SCHEMA_VERSION
  actor_key_version: string
  generated_at_utc: string
  metric_window_manifest_digest: string
  window_start_utc: string
  window_end_utc: string
  eligible_census_digest: string
  censoring_policy_version: 'right-censor-worst-case/v1'
  censoring_status_digest: string
  completeness: readonly TelemetryCompletenessResult[]
  metrics: readonly TelemetryMetricResult[]
  status: MetricStatus
  evidence_digest: string
} {
  if (
    !SHA_PATTERN.test(input.source_sha) ||
    parseUtc(input.window_start_utc) === null ||
    parseUtc(input.window_end_utc) === null ||
    parseUtc(input.window_start_utc)! >= parseUtc(input.window_end_utc)! ||
    !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(input.actor_key_version) ||
    parseUtc(input.generated_at_utc) === null ||
    !SHA256_PATTERN.test(input.metric_window_manifest_digest) ||
    !SHA256_PATTERN.test(input.eligible_census_digest) ||
    !SHA256_PATTERN.test(input.censoring_status_digest) ||
    input.completeness.length === 0 ||
    input.metrics.length === 0 ||
    new Set(input.completeness.map((item) => item.source)).size !== input.completeness.length ||
    new Set(input.metrics.map((metric) => metric.metric_id)).size !== input.metrics.length ||
    input.metrics.some(
      (metric) =>
        !includes(METRIC_IDS, metric.metric_id) ||
        !includes(METRIC_STATUSES, metric.status) ||
        !includes(METRIC_REASONS, metric.reason),
    )
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  const status: MetricStatus =
    input.metrics.some((metric) => metric.status === 'HOLD') ||
    input.completeness.some((item) => item.status === 'HOLD')
      ? 'HOLD'
      : input.metrics.some((metric) => metric.status === 'FAIL')
        ? 'FAIL'
        : 'PASS'
  const evidenceWithoutDigest = {
    schema_version: TELEMETRY_EVIDENCE_SCHEMA_VERSION,
    source_sha: input.source_sha,
    query_version: TELEMETRY_QUERY_VERSION,
    event_schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    actor_key_version: input.actor_key_version,
    generated_at_utc: input.generated_at_utc,
    metric_window_manifest_digest: input.metric_window_manifest_digest,
    window_start_utc: input.window_start_utc,
    window_end_utc: input.window_end_utc,
    eligible_census_digest: input.eligible_census_digest,
    censoring_policy_version: 'right-censor-worst-case/v1' as const,
    censoring_status_digest: input.censoring_status_digest,
    completeness: input.completeness,
    metrics: input.metrics,
    status,
  }
  return { ...evidenceWithoutDigest, evidence_digest: telemetryDigest(evidenceWithoutDigest) }
}
