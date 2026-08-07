import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import {
  isWebVitalStatusDurationCombination,
  OPENAPI_UUID_PATTERN,
  type WebVitalDurationBucket,
  type WebVitalOperation,
  type WebVitalStatus,
} from '../shared/web-vitals-dimensions'
import { productEventOccurrenceMinuteFromEventId } from '../product-event-occurrence'

export const TELEMETRY_EVENT_SCHEMA_VERSION = 'hana-telemetry-event/v2' as const
export const TELEMETRY_EVIDENCE_SCHEMA_VERSION = 'hana-telemetry-evidence/v2' as const
export const TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION =
  'hana-telemetry-expectation-manifest/v2' as const
export const TELEMETRY_QUERY_VERSION = 'issue-152-v3' as const
export const TELEMETRY_SAMPLING_POLICY_VERSION = 'hmac-event-id/v3' as const
export const TELEMETRY_COMMITMENT_SCHEME = 'hmac-sha256/v1' as const
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
const COMPLETENESS_REASONS = [
  'complete',
  'expected_manifest_missing',
  'expected_manifest_untrusted',
  'telemetry_degraded',
  'sampling_policy_mismatch',
  'loss_detected',
  'unexpected_event',
  'received_envelope_invalid',
  'received_event_outside_window',
  'duplicate_conflict',
] as const
const COMMITMENT_DOMAINS = [
  'metric_window_manifest',
  'eligible_census',
  'censoring_status',
] as const
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
  'stage_anchor_unverified',
  'stage_anchor_boundary',
  'stage_time_invalid',
  'actor_reference_invalid',
  'invalid_census',
  'minimum_not_met',
  'worst_case_passed',
  'best_case_failed',
  'censoring_changes_decision',
  'database_truth_complete',
  'target_not_configured',
  'unsupported_metric_direction',
] as const
const UUID_PATTERN = OPENAPI_UUID_PATTERN
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SHA_PATTERN = /^[0-9a-f]{40}$/
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const UTC_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/
const ACTOR_KEY_VERSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/
const TELEMETRY_COMMITMENT_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_DOMAIN = 'hana-telemetry-stable-sampling/v3\0'
const TELEMETRY_SAMPLING_KEY_COMMITMENT_DOMAIN = 'hana-telemetry-sampling-key-commitment/v1\0'
const HIGHER_IS_BETTER_PRODUCTION_METRICS = new Set<TelemetryMetricId>([
  'M1',
  'M2',
  'M3',
  'M5',
  'M6',
  'M7',
  'M8',
  'M9',
])

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
  reason:
    | 'complete'
    | 'expected_manifest_missing'
    | 'expected_manifest_untrusted'
    | 'telemetry_degraded'
    | 'sampling_policy_mismatch'
    | 'loss_detected'
    | 'unexpected_event'
    | 'received_envelope_invalid'
    | 'received_event_outside_window'
    | 'duplicate_conflict'
  duplicate: 'NONE' | 'DETECTED'
  reorder: 'NONE' | 'DETECTED'
}

export type TelemetryExpectationManifest = {
  schema_version: typeof TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION
  source: TelemetrySource
  status: 'PASS' | 'HOLD'
  degradation:
    | 'NONE'
    | 'STORAGE_UNAVAILABLE'
    | 'CAPACITY_EXCEEDED'
    | 'TTL_EXPIRED'
    | 'AUTH_BOUNDARY'
    | 'UNKNOWN'
  sampling_policy_version: typeof TELEMETRY_SAMPLING_POLICY_VERSION
  sampling_key_version: string
  sampling_key_commitment: string
  expected_event_ids: readonly string[]
}

export type TelemetryCompletenessInput = {
  source: TelemetrySource
  manifest: TelemetryExpectationManifest
  received: readonly TelemetryEnvelope[]
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  sampling_key_version: string
  sampling_key: string | null
  manifest_commitment: string
  commitment_key: string
}

export type SyntheticActorRef = {
  actor_key_version: string
  actor_token: string
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
  if (!Number.isFinite(parsed)) return null
  const canonicalInput = value.includes('.') ? value : value.replace('Z', '.000Z')
  return new Date(parsed).toISOString() === canonicalInput ? parsed : null
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
    return (
      dimensions.reason === 'not_applicable' &&
      ['good', 'needs_improvement', 'poor'].includes(dimensions.status) &&
      isWebVitalStatusDurationCombination({
        operation: dimensions.operation as WebVitalOperation,
        status: dimensions.status as WebVitalStatus,
        duration_bucket: dimensions.duration_bucket as WebVitalDurationBucket,
      })
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

function completenessHold(
  source: TelemetrySource,
  reason: Exclude<TelemetryCompletenessResult['reason'], 'complete'>,
): TelemetryCompletenessResult {
  return { source, status: 'HOLD', reason, duplicate: 'NONE', reorder: 'NONE' }
}

export function createTelemetryExpectationManifestCommitment(
  input: Pick<
    TelemetryCompletenessInput,
    'manifest' | 'window_start_utc' | 'window_end_utc' | 'actor_key_version' | 'commitment_key'
  >,
): string {
  return createTelemetryCommitment({
    domain: 'metric_window_manifest',
    window_start_utc: input.window_start_utc,
    window_end_utc: input.window_end_utc,
    actor_key_version: input.actor_key_version,
    value: input.manifest,
    commitment_key: input.commitment_key,
  })
}

function validSamplingConfiguration(
  source: TelemetrySource,
  sampling: { key_version: string; key: string | null },
): boolean {
  if (TELEMETRY_SAMPLING[source] === 1) {
    return sampling.key_version === 'none' && sampling.key === null
  }
  return (
    ACTOR_KEY_VERSION_PATTERN.test(sampling.key_version) &&
    sampling.key_version !== 'none' &&
    typeof sampling.key === 'string' &&
    Buffer.byteLength(sampling.key, 'utf8') >= TELEMETRY_SAMPLING_KEY_MIN_LENGTH
  )
}

export function createTelemetrySamplingKeyCommitment(input: {
  source: TelemetrySource
  sampling_key_version: string
  sampling_key: string | null
  commitment_key: string
}): string {
  if (
    !validSamplingConfiguration(input.source, {
      key_version: input.sampling_key_version,
      key: input.sampling_key,
    }) ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_SAMPLING_KEY_COMMITMENT_DOMAIN)
    .update(input.source)
    .update('\0')
    .update(input.sampling_key_version)
    .update('\0')
    .update(input.sampling_key ?? '')
    .digest('hex')
}

function validManifestCommitment(input: TelemetryCompletenessInput): boolean {
  if (!SHA256_PATTERN.test(input.manifest_commitment)) return false
  try {
    const expected = Buffer.from(createTelemetryExpectationManifestCommitment(input), 'hex')
    const received = Buffer.from(input.manifest_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function validExpectationManifest(
  manifest: TelemetryExpectationManifest | undefined,
  source: TelemetrySource,
): manifest is TelemetryExpectationManifest {
  return (
    manifest !== undefined &&
    isRecord(manifest) &&
    hasExactKeys(manifest, [
      'schema_version',
      'source',
      'status',
      'degradation',
      'sampling_policy_version',
      'sampling_key_version',
      'sampling_key_commitment',
      'expected_event_ids',
    ]) &&
    manifest.schema_version === TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION &&
    manifest.source === source &&
    manifest.status === 'PASS' &&
    [
      'NONE',
      'STORAGE_UNAVAILABLE',
      'CAPACITY_EXCEEDED',
      'TTL_EXPIRED',
      'AUTH_BOUNDARY',
      'UNKNOWN',
    ].includes(manifest.degradation) &&
    typeof manifest.sampling_key_version === 'string' &&
    ACTOR_KEY_VERSION_PATTERN.test(manifest.sampling_key_version) &&
    typeof manifest.sampling_key_commitment === 'string' &&
    SHA256_PATTERN.test(manifest.sampling_key_commitment) &&
    Array.isArray(manifest.expected_event_ids) &&
    manifest.expected_event_ids.length > 0 &&
    manifest.expected_event_ids.every(
      (eventId): eventId is string => typeof eventId === 'string' && UUID_PATTERN.test(eventId),
    ) &&
    new Set(manifest.expected_event_ids).size === manifest.expected_event_ids.length
  )
}

function validSamplingKeyCommitment(input: TelemetryCompletenessInput): boolean {
  if (!SHA256_PATTERN.test(input.manifest.sampling_key_commitment)) return false
  try {
    const expected = Buffer.from(createTelemetrySamplingKeyCommitment(input), 'hex')
    const received = Buffer.from(input.manifest.sampling_key_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function receivedEnvelopeSignature(envelope: TelemetryEnvelope): string {
  return JSON.stringify(stableValue(envelope))
}

export function evaluateTelemetryCompleteness(
  input: TelemetryCompletenessInput,
): TelemetryCompletenessResult {
  const manifest = input.manifest as TelemetryExpectationManifest | undefined
  if (!manifest) return completenessHold(input.source, 'expected_manifest_missing')
  if (manifest.sampling_policy_version !== TELEMETRY_SAMPLING_POLICY_VERSION) {
    return completenessHold(input.source, 'sampling_policy_mismatch')
  }
  if (!validExpectationManifest(manifest, input.source) || !validManifestCommitment(input)) {
    return completenessHold(input.source, 'expected_manifest_untrusted')
  }
  if (manifest.degradation !== 'NONE') {
    return completenessHold(input.source, 'telemetry_degraded')
  }
  if (
    manifest.sampling_key_version !== input.sampling_key_version ||
    !validSamplingKeyCommitment(input)
  ) {
    return completenessHold(input.source, 'sampling_policy_mismatch')
  }
  let sampledExpectedEventIds: readonly string[]
  try {
    sampledExpectedEventIds = manifest.expected_event_ids.filter((eventId) =>
      shouldSampleTelemetry(input.source, eventId, {
        key_version: input.sampling_key_version,
        key: input.sampling_key,
      }),
    )
  } catch {
    return completenessHold(input.source, 'sampling_policy_mismatch')
  }
  const windowStart = parseUtc(input.window_start_utc)
  const windowEnd = parseUtc(input.window_end_utc)
  if (windowStart === null || windowEnd === null || windowStart >= windowEnd) {
    return completenessHold(input.source, 'expected_manifest_untrusted')
  }
  const validatedReceived: TelemetryEnvelope[] = []
  if (!Array.isArray(input.received)) {
    return completenessHold(input.source, 'received_envelope_invalid')
  }
  for (const rawEnvelope of input.received) {
    let envelope: TelemetryEnvelope
    try {
      envelope = parseTelemetryEnvelope(rawEnvelope)
    } catch {
      return completenessHold(input.source, 'received_envelope_invalid')
    }
    const occurredAt = parseUtc(envelope.occurred_at_utc)
    if (occurredAt === null || occurredAt < windowStart || occurredAt >= windowEnd) {
      return completenessHold(input.source, 'received_event_outside_window')
    }
    validatedReceived.push(envelope)
  }
  const expected = new Set(sampledExpectedEventIds)
  const firstReceived: string[] = []
  const received = new Set<string>()
  const receivedSignatures = new Map<string, string>()
  let duplicate = false
  let unexpected = false
  for (const envelope of validatedReceived) {
    const signature = receivedEnvelopeSignature(envelope)
    const existingSignature = receivedSignatures.get(envelope.event_id)
    if (existingSignature !== undefined) {
      duplicate = true
      if (existingSignature !== signature) {
        return {
          source: input.source,
          status: 'HOLD',
          reason: 'duplicate_conflict',
          duplicate: 'DETECTED',
          reorder: 'NONE',
        }
      }
    } else {
      firstReceived.push(envelope.event_id)
      receivedSignatures.set(envelope.event_id, signature)
    }
    received.add(envelope.event_id)
    if (
      !expected.has(envelope.event_id) ||
      telemetrySourceForOperation(envelope.dimensions.operation) !== input.source
    ) {
      unexpected = true
    }
  }
  const loss = sampledExpectedEventIds.some((eventId) => !received.has(eventId))
  const receivedExpectedOrder = firstReceived.filter((eventId) => expected.has(eventId))
  const expectedReceivedOrder = sampledExpectedEventIds.filter((eventId) => received.has(eventId))
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
  actor: SyntheticActorRef
  event_name: 'record_started' | 'photo_selected' | 'ai_draft_shown' | 'memory_saved'
  occurred_minute_utc: string
  received_at_utc: string
  anchor_trust: 'verified' | 'unverified'
}

export type SyntheticMemoryTruth = {
  idempotency_key: string
  actor: SyntheticActorRef
  created_at_utc: string
}

function validSyntheticActorRef(
  actor: SyntheticActorRef | null | undefined,
): actor is SyntheticActorRef {
  return (
    actor !== null &&
    actor !== undefined &&
    ACTOR_KEY_VERSION_PATTERN.test(actor.actor_key_version) &&
    SHA256_PATTERN.test(actor.actor_token)
  )
}

function sameSyntheticActor(
  left: SyntheticActorRef | null | undefined,
  right: SyntheticActorRef | null | undefined,
): boolean {
  return (
    validSyntheticActorRef(left) &&
    validSyntheticActorRef(right) &&
    left.actor_key_version === right.actor_key_version &&
    left.actor_token === right.actor_token
  )
}

export function evaluateSyntheticFunnelFlow(input: {
  metric_id: 'M2' | 'M3'
  flow_id: string
  expected_actor: SyntheticActorRef
  generated_at_utc: string
  completeness_input: TelemetryCompletenessInput
  events: readonly SyntheticFunnelEvent[]
  memories: readonly SyntheticMemoryTruth[]
}): {
  metric_id: 'M2' | 'M3'
  status: MetricStatus
  reason: TelemetryMetricReason
} {
  if (
    !validSyntheticActorRef(input.expected_actor) ||
    !UUID_PATTERN.test(input.flow_id) ||
    input.expected_actor.actor_key_version !== input.completeness_input.actor_key_version
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'actor_reference_invalid' }
  }
  const completeness = evaluateTelemetryCompleteness(input.completeness_input)
  if (
    completeness.source !== 'funnel' ||
    completeness.status !== 'PASS' ||
    completeness.reason !== 'complete'
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'telemetry_incomplete' }
  }
  const stageName = input.metric_id === 'M2' ? 'photo_selected' : 'ai_draft_shown'
  const sameFlowStages = input.events.filter(
    (event) => event.flow_id === input.flow_id && event.event_name === stageName,
  )
  if (
    sameFlowStages.some(
      (event) =>
        !validSyntheticActorRef(event.actor) ||
        !sameSyntheticActor(event.actor, input.expected_actor),
    )
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'actor_reference_invalid' }
  }
  const verifiedReceived = new Map(
    input.completeness_input.received.map((envelope) => [envelope.event_id, envelope]),
  )
  const matchingStages = sameFlowStages.filter((event) => {
    const envelope = verifiedReceived.get(event.event_id)
    return envelope?.dimensions.operation === event.event_name
  })
  if (matchingStages.length !== sameFlowStages.length) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'telemetry_incomplete' }
  }
  if (matchingStages.length === 0) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_missing' }
  }
  if (matchingStages.some((event) => event.anchor_trust !== 'verified')) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_anchor_unverified' }
  }
  const generatedAt = parseUtc(input.generated_at_utc)
  const windowStart = parseUtc(input.completeness_input.window_start_utc)
  const windowEnd = parseUtc(input.completeness_input.window_end_utc)
  const stages = matchingStages.map((event) => {
    const envelope = verifiedReceived.get(event.event_id)
    const decodedOccurredMinute = productEventOccurrenceMinuteFromEventId(event.event_id)
    const occurredAt = decodedOccurredMinute ? parseUtc(decodedOccurredMinute) : null
    return {
      ...event,
      occurredAt,
      decodedOccurredMinute,
      envelopeOccurredAt: envelope ? parseUtc(envelope.occurred_at_utc) : null,
      receivedAt: parseUtc(event.received_at_utc),
    }
  })
  if (
    generatedAt === null ||
    windowStart === null ||
    windowEnd === null ||
    stages.some(
      (event) =>
        event.decodedOccurredMinute !== event.occurred_minute_utc ||
        !UTC_MINUTE_PATTERN.test(event.occurred_minute_utc) ||
        !validSyntheticActorRef(event.actor) ||
        event.occurredAt === null ||
        event.envelopeOccurredAt !== event.occurredAt ||
        event.occurredAt < windowStart ||
        event.occurredAt + 60 * 1000 > windowEnd ||
        event.receivedAt === null ||
        event.receivedAt < event.occurredAt ||
        event.receivedAt > generatedAt,
    ) ||
    new Set(stages.map((event) => event.occurredAt)).size !== 1
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_time_invalid' }
  }
  const stageMinuteStart = stages[0]!.occurredAt!
  const stageMinuteEnd = stageMinuteStart + 60 * 1000
  const conversionWindowMs = 30 * 60 * 1000
  if (generatedAt < stageMinuteEnd + conversionWindowMs) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'window_not_mature' }
  }
  const sameFlowMemories = input.memories.filter(
    (candidate) => candidate.idempotency_key === input.flow_id,
  )
  if (
    sameFlowMemories.some(
      (candidate) =>
        !validSyntheticActorRef(candidate.actor) ||
        !sameSyntheticActor(candidate.actor, input.expected_actor),
    )
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'actor_reference_invalid' }
  }
  const matchingMemories = sameFlowMemories.filter(
    (candidate) =>
      candidate.idempotency_key === input.flow_id &&
      sameSyntheticActor(candidate.actor, input.expected_actor),
  )
  if (
    matchingMemories.some(
      (candidate) =>
        !UUID_PATTERN.test(candidate.idempotency_key) ||
        !validSyntheticActorRef(candidate.actor) ||
        parseUtc(candidate.created_at_utc) === null ||
        parseUtc(candidate.created_at_utc)! > generatedAt,
    )
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_time_invalid' }
  }
  const memory = matchingMemories
    .map((candidate) => ({ ...candidate, createdAt: parseUtc(candidate.created_at_utc) }))
    .filter(
      (candidate): candidate is typeof candidate & { createdAt: number } =>
        candidate.createdAt !== null,
    )
    .sort((left, right) => left.createdAt - right.createdAt)[0]
  if (!memory) return { metric_id: input.metric_id, status: 'FAIL', reason: 'memory_not_saved' }
  if (memory.createdAt < stageMinuteEnd) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'event_reordered_after_truth' }
  }
  const longestPossibleDuration = memory.createdAt - stageMinuteStart
  const shortestPossibleDuration = memory.createdAt - stageMinuteEnd
  if (longestPossibleDuration < conversionWindowMs) {
    return { metric_id: input.metric_id, status: 'PASS', reason: 'memory_saved_within_window' }
  }
  if (shortestPossibleDuration >= conversionWindowMs) {
    return { metric_id: input.metric_id, status: 'FAIL', reason: 'memory_saved_after_window' }
  }
  return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_anchor_boundary' }
}

export function evaluateCensoredRate(input: {
  metric_id: TelemetryMetricId
  eligible: number
  succeeded: number
  censored: number
  minimum: number
  target: number
}): { metric_id: TelemetryMetricId; status: MetricStatus; reason: TelemetryMetricReason } {
  if (!HIGHER_IS_BETTER_PRODUCTION_METRICS.has(input.metric_id)) {
    return {
      metric_id: input.metric_id,
      status: 'HOLD',
      reason: 'unsupported_metric_direction',
    }
  }
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

function evidenceDigest(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex')
}

export type TelemetryCommitmentDomain = (typeof COMMITMENT_DOMAINS)[number]

export function createTelemetryCommitment(input: {
  domain: TelemetryCommitmentDomain
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  value: unknown
  commitment_key: string
}): string {
  const windowStart = parseUtc(input.window_start_utc)
  const windowEnd = parseUtc(input.window_end_utc)
  if (
    windowStart === null ||
    windowEnd === null ||
    windowStart >= windowEnd ||
    !includes(COMMITMENT_DOMAINS, input.domain) ||
    !ACTOR_KEY_VERSION_PATTERN.test(input.actor_key_version) ||
    input.value === undefined ||
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  try {
    return createHmac('sha256', input.commitment_key)
      .update(
        JSON.stringify(
          stableValue({
            domain: input.domain,
            window_start_utc: input.window_start_utc,
            window_end_utc: input.window_end_utc,
            actor_key_version: input.actor_key_version,
            value: input.value,
          }),
        ),
      )
      .digest('hex')
  } catch {
    throw new TelemetryContractError('invalid_input')
  }
}

export function shouldSampleTelemetry(
  source: TelemetrySource,
  eventId: string,
  sampling: { key_version: string; key: string | null },
): boolean {
  if (!UUID_PATTERN.test(eventId)) throw new TelemetryContractError('invalid_input')
  const rate = TELEMETRY_SAMPLING[source]
  if (!validSamplingConfiguration(source, sampling)) {
    throw new TelemetryContractError('invalid_input')
  }
  if (rate === 1) return true
  if (sampling.key === null) throw new TelemetryContractError('invalid_input')
  const bucket =
    createHmac('sha256', sampling.key)
      .update(TELEMETRY_SAMPLING_DOMAIN)
      .update(source)
      .update('\0')
      .update(sampling.key_version)
      .update('\0')
      .update(eventId)
      .digest()
      .readUInt32BE(0) / 0x1_0000_0000
  return bucket < rate
}

export type TelemetryMetricResult = {
  metric_id: TelemetryMetricId
  status: MetricStatus
  reason: TelemetryMetricReason
}

const METRIC_REASON_STATUS: Record<TelemetryMetricReason, MetricStatus> = {
  memory_saved_within_window: 'PASS',
  memory_not_saved: 'FAIL',
  memory_saved_after_window: 'FAIL',
  telemetry_incomplete: 'HOLD',
  stage_missing: 'HOLD',
  window_not_mature: 'HOLD',
  event_reordered_after_truth: 'HOLD',
  stage_anchor_unverified: 'HOLD',
  stage_anchor_boundary: 'HOLD',
  stage_time_invalid: 'HOLD',
  actor_reference_invalid: 'HOLD',
  invalid_census: 'HOLD',
  minimum_not_met: 'HOLD',
  worst_case_passed: 'PASS',
  best_case_failed: 'FAIL',
  censoring_changes_decision: 'HOLD',
  database_truth_complete: 'PASS',
  target_not_configured: 'HOLD',
  unsupported_metric_direction: 'HOLD',
}

function validCompletenessResult(result: TelemetryCompletenessResult): boolean {
  const validReasonStatus =
    (result.reason === 'complete' && result.status === 'PASS') ||
    (result.reason !== 'complete' && result.status === 'HOLD')
  return (
    includes(SOURCES, result.source) &&
    includes(COMPLETENESS_REASONS, result.reason) &&
    validReasonStatus &&
    ['NONE', 'DETECTED'].includes(result.duplicate) &&
    ['NONE', 'DETECTED'].includes(result.reorder)
  )
}

export function buildTelemetryEvidence(input: {
  source_sha: string
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  generated_at_utc: string
  commitment_key: string
  metric_window_manifest: unknown
  eligible_census: unknown
  censoring_status: unknown
  completeness: readonly TelemetryCompletenessResult[]
  metrics: readonly TelemetryMetricResult[]
}): {
  schema_version: typeof TELEMETRY_EVIDENCE_SCHEMA_VERSION
  source_sha: string
  query_version: typeof TELEMETRY_QUERY_VERSION
  event_schema_version: typeof TELEMETRY_EVENT_SCHEMA_VERSION
  actor_key_version: string
  generated_at_utc: string
  commitment_scheme: typeof TELEMETRY_COMMITMENT_SCHEME
  metric_window_manifest_commitment: string
  window_start_utc: string
  window_end_utc: string
  eligible_census_commitment: string
  censoring_policy_version: 'right-censor-worst-case/v1'
  censoring_status_commitment: string
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
    !ACTOR_KEY_VERSION_PATTERN.test(input.actor_key_version) ||
    parseUtc(input.generated_at_utc) === null ||
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH ||
    input.metric_window_manifest === undefined ||
    input.eligible_census === undefined ||
    input.censoring_status === undefined ||
    input.completeness.length !== SOURCES.length ||
    input.metrics.length === 0 ||
    new Set(input.completeness.map((item) => item.source)).size !== input.completeness.length ||
    SOURCES.some((source) => !input.completeness.some((item) => item.source === source)) ||
    input.completeness.some((item) => !validCompletenessResult(item)) ||
    new Set(input.metrics.map((metric) => metric.metric_id)).size !== input.metrics.length ||
    input.metrics.some(
      (metric) =>
        !includes(METRIC_IDS, metric.metric_id) ||
        !includes(METRIC_STATUSES, metric.status) ||
        !includes(METRIC_REASONS, metric.reason) ||
        METRIC_REASON_STATUS[metric.reason as TelemetryMetricReason] !== metric.status,
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
  const orderedCompleteness = SOURCES.map((source) => {
    const item = input.completeness.find((candidate) => candidate.source === source)!
    return {
      source,
      status: item.status,
      reason: item.reason,
      duplicate: item.duplicate,
      reorder: item.reorder,
    }
  })
  const sanitizedMetrics = input.metrics.map((metric) => ({
    metric_id: metric.metric_id,
    status: metric.status,
    reason: metric.reason,
  }))
  const commitmentBoundary = {
    window_start_utc: input.window_start_utc,
    window_end_utc: input.window_end_utc,
    actor_key_version: input.actor_key_version,
    commitment_key: input.commitment_key,
  }
  const evidenceWithoutDigest = {
    schema_version: TELEMETRY_EVIDENCE_SCHEMA_VERSION,
    source_sha: input.source_sha,
    query_version: TELEMETRY_QUERY_VERSION,
    event_schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    actor_key_version: input.actor_key_version,
    generated_at_utc: input.generated_at_utc,
    commitment_scheme: TELEMETRY_COMMITMENT_SCHEME,
    metric_window_manifest_commitment: createTelemetryCommitment({
      ...commitmentBoundary,
      domain: 'metric_window_manifest',
      value: input.metric_window_manifest,
    }),
    window_start_utc: input.window_start_utc,
    window_end_utc: input.window_end_utc,
    eligible_census_commitment: createTelemetryCommitment({
      ...commitmentBoundary,
      domain: 'eligible_census',
      value: input.eligible_census,
    }),
    censoring_policy_version: 'right-censor-worst-case/v1' as const,
    censoring_status_commitment: createTelemetryCommitment({
      ...commitmentBoundary,
      domain: 'censoring_status',
      value: input.censoring_status,
    }),
    completeness: orderedCompleteness,
    metrics: sanitizedMetrics,
    status,
  }
  return { ...evidenceWithoutDigest, evidence_digest: evidenceDigest(evidenceWithoutDigest) }
}
