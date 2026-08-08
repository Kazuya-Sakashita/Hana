import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { canonicalizeBareUuid } from '@/lib/uuid'
import {
  isWebVitalStatusDurationCombination,
  WEB_VITAL_ROUTE_GROUPS,
  type WebVitalDurationBucket,
  type WebVitalOperation,
  type WebVitalStatus,
} from '../shared/web-vitals-dimensions'
import { productEventOccurrenceMinuteFromEventId } from '../product-event-occurrence'

export const TELEMETRY_EVENT_SCHEMA_VERSION = 'hana-telemetry-event/v2' as const
export const TELEMETRY_EVIDENCE_SCHEMA_VERSION = 'hana-telemetry-evidence/v5' as const
export const TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION =
  'hana-telemetry-expectation-manifest/v5' as const
export const TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION =
  'hana-telemetry-authority-registration/v3' as const
export const TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION =
  'hana-telemetry-authority-registry-receipt/v1' as const
export const TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION = 'hana-telemetry-event-universe/v1' as const
export const TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION = 'hana-telemetry-ingest-receipt/v2' as const
export const TELEMETRY_MEMORY_TRUTH_RECEIPT_SCHEMA_VERSION =
  'hana-telemetry-memory-truth-receipt/v1' as const
export const TELEMETRY_TARGET_DECISION_SCHEMA_VERSION = 'hana-telemetry-target-decision/v2' as const
export const TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION =
  'hana-telemetry-baseline-evidence-receipt/v1' as const
export const TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION =
  'hana-telemetry-binary-outcome-table/v1' as const
export const TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION =
  'hana-telemetry-metric-window-manifest/v2' as const
export const TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION = 'hana-telemetry-eligible-census/v1' as const
export const TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION =
  'hana-telemetry-censoring-status/v1' as const
export const TELEMETRY_QUERY_VERSION = 'issue-191-v2' as const
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
  'received_order_ambiguous',
] as const
const COMMITMENT_DOMAINS = [
  'metric_window_manifest',
  'authoritative_event_universe',
  'eligible_census',
  'censoring_status',
] as const
const TELEMETRY_EVIDENCE_DIGEST_DOMAIN = 'hana-telemetry-evidence-digest/v1\0'
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
export const TELEMETRY_REQUIRED_METRIC_IDS = [
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
] as const satisfies readonly (typeof METRIC_IDS)[number][]
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
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const SHA_PATTERN = /^[0-9a-f]{40}$/
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/
const UTC_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00Z$/
const ACTOR_KEY_VERSION_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/
const PROTECTED_ACTOR_KEY_VERSION_PATTERN = /^v[1-9][0-9]{0,5}$/
const TELEMETRY_COMMITMENT_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_DOMAIN = 'hana-telemetry-stable-sampling/v3\0'
const TELEMETRY_SAMPLING_KEY_COMMITMENT_DOMAIN = 'hana-telemetry-sampling-key-commitment/v1\0'
const TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_DOMAIN = 'hana-telemetry-authority-registry-receipt/v1\0'
const TELEMETRY_EVENT_UNIVERSE_DOMAIN = 'hana-telemetry-event-universe/v1\0'
const TELEMETRY_INGEST_RECEIPT_DOMAIN = 'hana-telemetry-ingest-receipt/v2\0'
const TELEMETRY_MEMORY_TRUTH_RECEIPT_DOMAIN = 'hana-telemetry-memory-truth-receipt/v1\0'
const TELEMETRY_TARGET_DECISION_DOMAIN = 'hana-telemetry-target-decision/v2\0'
const TELEMETRY_BASELINE_EVIDENCE_RECEIPT_DOMAIN = 'hana-telemetry-baseline-evidence-receipt/v1\0'
const TELEMETRY_ELIGIBILITY_POLICY_VERSION = 'source-operation-actor-window/v1' as const
const TELEMETRY_METRIC_POLICY_VERSION = 'immutable-metric-policy/v2' as const
const TELEMETRY_TARGET_POLICY_VERSION = 'protected-baseline-target/v2' as const
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
    | 'received_order_ambiguous'
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
    | 'DELIVERY_REJECTED'
    | 'AUTH_BOUNDARY'
    | 'UNKNOWN'
  sampling_policy_version: typeof TELEMETRY_SAMPLING_POLICY_VERSION
  sampling_key_version: string
  sampling_key_commitment: string
  query_version: typeof TELEMETRY_QUERY_VERSION
  authority_key_version: string
  authority_commitment: string
  universe_key_version: string
  universe_commitment: string
  universe_cutoff_utc: string
  manifest_key_version: string
  expected_event_ids: readonly string[]
}

export type TelemetryAuthorityRegistration = {
  schema_version: typeof TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  source: TelemetrySource
  expected_actor: SyntheticActorRef | null
  window_start_utc: string
  window_end_utc: string
  authority_key_version: string
  sampling_policy_version: typeof TELEMETRY_SAMPLING_POLICY_VERSION
  sampling_key_version: string
  sampling_key_commitment: string
  eligibility_policy_version: typeof TELEMETRY_ELIGIBILITY_POLICY_VERSION
  eligible_operations: readonly TelemetryOperation[]
  cohort_rule: 'expected_actor_only' | 'all_actors'
  exclusion_rule: 'pre_registered_actor_allowlist'
  exclusion_policy_version: string
  exclusion_policy_commitment: string
}

export type TelemetryAuthorityEvent = {
  event_id: string
  operation: TelemetryOperation
  flow_id: string | null
  actor: SyntheticActorRef | null
  occurred_at_utc: string
}

export type TelemetryEventUniverse = {
  schema_version: typeof TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  source: TelemetrySource
  window_start_utc: string
  window_end_utc: string
  cutoff_utc: string
  sealed_at_utc: string
  registration_commitment: string
  universe_key_version: string
  eligible_events: readonly TelemetryAuthorityEvent[]
  universe_commitment: string
}

export type TelemetryAuthorityRegistryReceipt = {
  schema_version: typeof TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION
  receipt_id: string
  registered_at_utc: string
  registration_commitment: string
  registry_key_version: string
  registry_commitment: string
}

export type TelemetryIngestReceipt = {
  schema_version: typeof TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION
  event_id: string
  envelope_digest: string
  received_at_utc: string
  source: TelemetrySource
  query_version: typeof TELEMETRY_QUERY_VERSION
  window_start_utc: string
  window_end_utc: string
  registration_commitment: string
  universe_commitment: string
  receipt_key_version: string
  receipt_commitment: string
}

export type TelemetryCompletenessInput = {
  source: TelemetrySource
  manifest: TelemetryExpectationManifest
  received: readonly TelemetryEnvelope[]
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  authority_registration: TelemetryAuthorityRegistration
  authority_registry_receipt: TelemetryAuthorityRegistryReceipt
  event_universe: TelemetryEventUniverse
  received_receipts: readonly TelemetryIngestReceipt[]
  sampling_key_version: string
  sampling_key: string | null
  manifest_commitment: string
}

export type TelemetryMemoryTruthReceipt = {
  schema_version: typeof TELEMETRY_MEMORY_TRUTH_RECEIPT_SCHEMA_VERSION
  metric_id: 'M2' | 'M3' | 'M9'
  actor: SyntheticActorRef
  generated_at_utc: string
  window_start_utc: string
  window_end_utc: string
  registration_commitment: string
  universe_commitment: string
  memory_set_digest: string
  record_count: number
  receipt_key_version: string
  receipt_commitment: string
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

function protectedActorKeyVersion(): string | null {
  const configured = process.env.TELEMETRY_ACTOR_KEY_VERSION
  return typeof configured === 'string' && PROTECTED_ACTOR_KEY_VERSION_PATTERN.test(configured)
    ? configured
    : null
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
      includes(WEB_VITAL_ROUTE_GROUPS, dimensions.route_group) &&
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
  const eventId = typeof raw.event_id === 'string' ? canonicalizeBareUuid(raw.event_id) : null
  if (
    raw.schema_version !== TELEMETRY_EVENT_SCHEMA_VERSION ||
    eventId === null ||
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
    event_id: eventId,
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

export function createTelemetryExpectationManifestCommitment(input: {
  manifest: TelemetryExpectationManifest
  window_start_utc: string
  window_end_utc: string
  actor_key_version: string
  commitment_key: string
}): string {
  return createTelemetryCommitment({
    domain: 'metric_window_manifest',
    window_start_utc: input.window_start_utc,
    window_end_utc: input.window_end_utc,
    actor_key_version: input.actor_key_version,
    value: input.manifest,
    commitment_key: input.commitment_key,
  })
}

export function createTelemetryEventUniverseCommitment(input: {
  universe: Omit<TelemetryEventUniverse, 'universe_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_EVENT_UNIVERSE_DOMAIN)
    .update(JSON.stringify(stableValue(input.universe)))
    .digest('hex')
}

export function createTelemetryAuthorityRegistrationCommitment(input: {
  registration: TelemetryAuthorityRegistration
  commitment_key: string
}): string {
  return createTelemetryCommitment({
    domain: 'authoritative_event_universe',
    window_start_utc: input.registration.window_start_utc,
    window_end_utc: input.registration.window_end_utc,
    actor_key_version:
      input.registration.expected_actor?.actor_key_version ??
      input.registration.authority_key_version,
    value: input.registration,
    commitment_key: input.commitment_key,
  })
}

export function createTelemetryAuthorityRegistryReceiptCommitment(input: {
  receipt: Omit<TelemetryAuthorityRegistryReceipt, 'registry_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_DOMAIN)
    .update(JSON.stringify(stableValue(input.receipt)))
    .digest('hex')
}

export function createTelemetryIngestReceiptCommitment(input: {
  receipt: Omit<TelemetryIngestReceipt, 'receipt_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_INGEST_RECEIPT_DOMAIN)
    .update(JSON.stringify(stableValue(input.receipt)))
    .digest('hex')
}

export function createTelemetryMemoryTruthReceiptCommitment(input: {
  receipt: Omit<TelemetryMemoryTruthReceipt, 'receipt_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_MEMORY_TRUTH_RECEIPT_DOMAIN)
    .update(JSON.stringify(stableValue(input.receipt)))
    .digest('hex')
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
  const configuredVersion = process.env.TELEMETRY_MANIFEST_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_MANIFEST_COMMITMENT_KEY
  if (
    input.manifest.manifest_key_version !== configuredVersion ||
    typeof configuredKey !== 'string' ||
    !SHA256_PATTERN.test(input.manifest_commitment) ||
    !protectedCommitmentKeysAreDistinct(input)
  ) {
    return false
  }
  try {
    const expected = Buffer.from(
      createTelemetryExpectationManifestCommitment({
        manifest: input.manifest,
        window_start_utc: input.window_start_utc,
        window_end_utc: input.window_end_utc,
        actor_key_version: input.actor_key_version,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(input.manifest_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function validAuthorityRegistration(input: TelemetryCompletenessInput): boolean {
  const registration = input.authority_registration as TelemetryAuthorityRegistration | undefined
  if (
    !registration ||
    !isRecord(registration) ||
    !hasExactKeys(registration, [
      'schema_version',
      'query_version',
      'source',
      'expected_actor',
      'window_start_utc',
      'window_end_utc',
      'authority_key_version',
      'sampling_policy_version',
      'sampling_key_version',
      'sampling_key_commitment',
      'eligibility_policy_version',
      'eligible_operations',
      'cohort_rule',
      'exclusion_rule',
      'exclusion_policy_version',
      'exclusion_policy_commitment',
    ]) ||
    registration.schema_version !== TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION ||
    registration.query_version !== TELEMETRY_QUERY_VERSION ||
    registration.source !== input.source ||
    registration.window_start_utc !== input.window_start_utc ||
    registration.window_end_utc !== input.window_end_utc ||
    !ACTOR_KEY_VERSION_PATTERN.test(registration.authority_key_version) ||
    registration.sampling_policy_version !== TELEMETRY_SAMPLING_POLICY_VERSION ||
    !SHA256_PATTERN.test(registration.sampling_key_commitment) ||
    registration.eligibility_policy_version !== TELEMETRY_ELIGIBILITY_POLICY_VERSION ||
    !Array.isArray(registration.eligible_operations) ||
    registration.eligible_operations.length === 0 ||
    registration.eligible_operations.some(
      (operation) =>
        !includes(OPERATIONS, operation) ||
        telemetrySourceForOperation(operation) !== registration.source,
    ) ||
    new Set(registration.eligible_operations).size !== registration.eligible_operations.length ||
    registration.cohort_rule !==
      (registration.expected_actor === null ? 'all_actors' : 'expected_actor_only') ||
    registration.exclusion_rule !== 'pre_registered_actor_allowlist' ||
    !ACTOR_KEY_VERSION_PATTERN.test(registration.exclusion_policy_version) ||
    !SHA256_PATTERN.test(registration.exclusion_policy_commitment) ||
    (registration.expected_actor !== null &&
      (!validSyntheticActorRef(registration.expected_actor) ||
        registration.expected_actor.actor_key_version !== input.actor_key_version)) ||
    (registration.source === 'funnel' && registration.expected_actor === null) ||
    parseUtc(registration.window_start_utc) === null ||
    parseUtc(registration.window_end_utc) === null ||
    parseUtc(registration.window_start_utc)! >= parseUtc(registration.window_end_utc)!
  ) {
    return false
  }
  return (
    input.manifest.query_version === registration.query_version &&
    input.manifest.authority_key_version === registration.authority_key_version &&
    input.manifest.sampling_policy_version === registration.sampling_policy_version &&
    input.manifest.sampling_key_version === registration.sampling_key_version &&
    input.manifest.sampling_key_commitment === registration.sampling_key_commitment
  )
}

function configuredCommitmentKeys(): readonly (string | undefined)[] {
  return [
    process.env.TELEMETRY_MANIFEST_COMMITMENT_KEY,
    process.env.TELEMETRY_AUTHORITY_COMMITMENT_KEY,
    process.env.TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY,
    process.env.TELEMETRY_SAMPLING_COMMITMENT_KEY,
    process.env.TELEMETRY_AUTHORITY_REGISTRY_COMMITMENT_KEY,
    process.env.TELEMETRY_INGEST_RECEIPT_COMMITMENT_KEY,
    process.env.TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY,
    process.env.TELEMETRY_TARGET_DECISION_COMMITMENT_KEY,
    process.env.TELEMETRY_EVIDENCE_COMMITMENT_KEY,
  ]
}

function validEventUniverse(input: TelemetryCompletenessInput): boolean {
  const universe = input.event_universe as TelemetryEventUniverse | undefined
  const configuredVersion = process.env.TELEMETRY_EVENT_UNIVERSE_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY
  if (
    !universe ||
    !isRecord(universe) ||
    !hasExactKeys(universe, [
      'schema_version',
      'query_version',
      'source',
      'window_start_utc',
      'window_end_utc',
      'cutoff_utc',
      'sealed_at_utc',
      'registration_commitment',
      'universe_key_version',
      'eligible_events',
      'universe_commitment',
    ]) ||
    universe.schema_version !== TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION ||
    universe.query_version !== TELEMETRY_QUERY_VERSION ||
    universe.source !== input.source ||
    universe.window_start_utc !== input.window_start_utc ||
    universe.window_end_utc !== input.window_end_utc ||
    universe.cutoff_utc !== input.window_end_utc ||
    universe.registration_commitment !== input.manifest.authority_commitment ||
    universe.universe_key_version !== configuredVersion ||
    input.manifest.universe_key_version !== universe.universe_key_version ||
    input.manifest.universe_commitment !== universe.universe_commitment ||
    input.manifest.universe_cutoff_utc !== universe.cutoff_utc ||
    typeof configuredKey !== 'string' ||
    !SHA256_PATTERN.test(universe.registration_commitment) ||
    !SHA256_PATTERN.test(universe.universe_commitment) ||
    !protectedCommitmentKeysAreDistinct(input) ||
    !Array.isArray(universe.eligible_events) ||
    universe.eligible_events.length === 0
  ) {
    return false
  }
  const cutoff = parseUtc(universe.cutoff_utc)
  const sealedAt = parseUtc(universe.sealed_at_utc)
  const windowStart = parseUtc(universe.window_start_utc)
  const windowEnd = parseUtc(universe.window_end_utc)
  if (
    cutoff === null ||
    sealedAt === null ||
    windowStart === null ||
    windowEnd === null ||
    sealedAt < cutoff
  ) {
    return false
  }
  const operations = new Set(input.authority_registration.eligible_operations)
  const invalidEvent = universe.eligible_events.some((event) => {
    if (
      !isRecord(event) ||
      !hasExactKeys(event, ['event_id', 'operation', 'flow_id', 'actor', 'occurred_at_utc']) ||
      typeof event.event_id !== 'string' ||
      canonicalizeBareUuid(event.event_id) !== event.event_id ||
      !includes(OPERATIONS, event.operation) ||
      !operations.has(event.operation) ||
      telemetrySourceForOperation(event.operation) !== universe.source ||
      (event.flow_id !== null &&
        (typeof event.flow_id !== 'string' ||
          canonicalizeBareUuid(event.flow_id) !== event.flow_id)) ||
      (event.actor !== null &&
        !validSyntheticActorRef(event.actor as SyntheticActorRef | undefined)) ||
      typeof event.occurred_at_utc !== 'string'
    ) {
      return true
    }
    const occurredAt = parseUtc(event.occurred_at_utc)
    return (
      occurredAt === null ||
      occurredAt < windowStart ||
      occurredAt >= windowEnd ||
      (universe.source === 'funnel' && (event.flow_id === null || event.actor === null)) ||
      (input.authority_registration.expected_actor !== null &&
        !sameSyntheticActor(
          event.actor as SyntheticActorRef | null | undefined,
          input.authority_registration.expected_actor,
        ))
    )
  })
  if (
    invalidEvent ||
    new Set(universe.eligible_events.map((event) => event.event_id)).size !==
      universe.eligible_events.length
  ) {
    return false
  }
  const sortedEvents = [...universe.eligible_events].sort((left, right) => {
    const occurrenceDifference =
      Date.parse(left.occurred_at_utc) - Date.parse(right.occurred_at_utc)
    return occurrenceDifference === 0
      ? left.event_id.localeCompare(right.event_id)
      : occurrenceDifference
  })
  if (
    sortedEvents.some(
      (event, index) => event.event_id !== universe.eligible_events[index]!.event_id,
    )
  ) {
    return false
  }
  const universeIds = universe.eligible_events.map((event) => event.event_id)
  if (
    input.manifest.expected_event_ids.length !== universeIds.length ||
    input.manifest.expected_event_ids.some((eventId, index) => eventId !== universeIds[index])
  ) {
    return false
  }
  try {
    const { universe_commitment: _commitment, ...unsignedUniverse } = universe
    const expected = Buffer.from(
      createTelemetryEventUniverseCommitment({
        universe: unsignedUniverse,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(universe.universe_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function protectedCommitmentKeysAreDistinct(input: TelemetryCompletenessInput): boolean {
  const keys = configuredCommitmentKeys()
  return (
    protectedEnvironmentCommitmentKeysAreDistinct() &&
    (input.sampling_key === null || !keys.includes(input.sampling_key))
  )
}

function protectedEnvironmentCommitmentKeysAreDistinct(): boolean {
  const keys = configuredCommitmentKeys()
  return (
    keys.every(
      (key) =>
        typeof key === 'string' &&
        Buffer.byteLength(key, 'utf8') >= TELEMETRY_COMMITMENT_KEY_MIN_LENGTH,
    ) && new Set(keys).size === keys.length
  )
}

function validAuthorityCommitment(input: TelemetryCompletenessInput): boolean {
  const registration = input.authority_registration
  const configuredVersion = process.env.TELEMETRY_AUTHORITY_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_AUTHORITY_COMMITMENT_KEY
  if (
    configuredVersion !== registration.authority_key_version ||
    typeof configuredKey !== 'string' ||
    Buffer.byteLength(configuredKey, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH ||
    !protectedCommitmentKeysAreDistinct(input) ||
    !SHA256_PATTERN.test(input.manifest.authority_commitment)
  ) {
    return false
  }
  try {
    const expected = Buffer.from(
      createTelemetryAuthorityRegistrationCommitment({
        registration,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(input.manifest.authority_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function validAuthorityRegistryReceipt(input: TelemetryCompletenessInput): boolean {
  const receipt = input.authority_registry_receipt as TelemetryAuthorityRegistryReceipt | undefined
  const configuredVersion = process.env.TELEMETRY_AUTHORITY_REGISTRY_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_AUTHORITY_REGISTRY_COMMITMENT_KEY
  if (
    !receipt ||
    !isRecord(receipt) ||
    !hasExactKeys(receipt, [
      'schema_version',
      'receipt_id',
      'registered_at_utc',
      'registration_commitment',
      'registry_key_version',
      'registry_commitment',
    ]) ||
    receipt.schema_version !== TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION ||
    canonicalizeBareUuid(receipt.receipt_id) !== receipt.receipt_id ||
    receipt.registry_key_version !== configuredVersion ||
    !ACTOR_KEY_VERSION_PATTERN.test(receipt.registry_key_version) ||
    receipt.registration_commitment !== input.manifest.authority_commitment ||
    !SHA256_PATTERN.test(receipt.registration_commitment) ||
    !SHA256_PATTERN.test(receipt.registry_commitment) ||
    typeof configuredKey !== 'string' ||
    !protectedCommitmentKeysAreDistinct(input)
  ) {
    return false
  }
  const registeredAt = parseUtc(receipt.registered_at_utc)
  const windowStart = parseUtc(input.window_start_utc)
  if (registeredAt === null || windowStart === null || registeredAt >= windowStart) return false
  try {
    const { registry_commitment: _registryCommitment, ...unsignedReceipt } = receipt
    const expected = Buffer.from(
      createTelemetryAuthorityRegistryReceiptCommitment({
        receipt: unsignedReceipt,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(receipt.registry_commitment, 'hex')
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
      'query_version',
      'authority_key_version',
      'authority_commitment',
      'universe_key_version',
      'universe_commitment',
      'universe_cutoff_utc',
      'manifest_key_version',
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
      'DELIVERY_REJECTED',
      'AUTH_BOUNDARY',
      'UNKNOWN',
    ].includes(manifest.degradation) &&
    typeof manifest.sampling_key_version === 'string' &&
    ACTOR_KEY_VERSION_PATTERN.test(manifest.sampling_key_version) &&
    typeof manifest.sampling_key_commitment === 'string' &&
    SHA256_PATTERN.test(manifest.sampling_key_commitment) &&
    manifest.query_version === TELEMETRY_QUERY_VERSION &&
    typeof manifest.authority_key_version === 'string' &&
    ACTOR_KEY_VERSION_PATTERN.test(manifest.authority_key_version) &&
    typeof manifest.authority_commitment === 'string' &&
    SHA256_PATTERN.test(manifest.authority_commitment) &&
    ACTOR_KEY_VERSION_PATTERN.test(manifest.universe_key_version) &&
    SHA256_PATTERN.test(manifest.universe_commitment) &&
    parseUtc(manifest.universe_cutoff_utc) !== null &&
    ACTOR_KEY_VERSION_PATTERN.test(manifest.manifest_key_version) &&
    Array.isArray(manifest.expected_event_ids) &&
    manifest.expected_event_ids.length > 0 &&
    manifest.expected_event_ids.every(
      (eventId): eventId is string =>
        typeof eventId === 'string' && canonicalizeBareUuid(eventId) !== null,
    ) &&
    new Set(manifest.expected_event_ids.map((eventId) => canonicalizeBareUuid(eventId))).size ===
      manifest.expected_event_ids.length
  )
}

function validSamplingKeyCommitment(input: TelemetryCompletenessInput): boolean {
  const configuredKey = process.env.TELEMETRY_SAMPLING_COMMITMENT_KEY
  if (
    !SHA256_PATTERN.test(input.manifest.sampling_key_commitment) ||
    typeof configuredKey !== 'string' ||
    !protectedCommitmentKeysAreDistinct(input)
  ) {
    return false
  }
  try {
    const expected = Buffer.from(
      createTelemetrySamplingKeyCommitment({ ...input, commitment_key: configuredKey }),
      'hex',
    )
    const received = Buffer.from(input.manifest.sampling_key_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

export function createTelemetryEnvelopeDigest(envelope: TelemetryEnvelope): string {
  return createHash('sha256')
    .update(JSON.stringify(stableValue(envelope)))
    .digest('hex')
}

function validReceivedReceipts(
  input: TelemetryCompletenessInput,
  envelopes: readonly TelemetryEnvelope[],
): ReadonlyMap<string, TelemetryIngestReceipt> | null {
  const configuredVersion = process.env.TELEMETRY_INGEST_RECEIPT_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_INGEST_RECEIPT_COMMITMENT_KEY
  if (
    !Array.isArray(input.received_receipts) ||
    typeof configuredVersion !== 'string' ||
    !ACTOR_KEY_VERSION_PATTERN.test(configuredVersion) ||
    typeof configuredKey !== 'string' ||
    !protectedCommitmentKeysAreDistinct(input)
  ) {
    return null
  }
  const uniqueEnvelopeIds = new Set(envelopes.map((envelope) => envelope.event_id))
  if (input.received_receipts.length !== uniqueEnvelopeIds.size) return null
  const receipts = new Map<string, TelemetryIngestReceipt>()
  for (const rawReceipt of input.received_receipts) {
    if (
      !isRecord(rawReceipt) ||
      !hasExactKeys(rawReceipt, [
        'schema_version',
        'event_id',
        'envelope_digest',
        'received_at_utc',
        'source',
        'query_version',
        'window_start_utc',
        'window_end_utc',
        'registration_commitment',
        'universe_commitment',
        'receipt_key_version',
        'receipt_commitment',
      ]) ||
      rawReceipt.schema_version !== TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION ||
      typeof rawReceipt.event_id !== 'string' ||
      typeof rawReceipt.envelope_digest !== 'string' ||
      typeof rawReceipt.received_at_utc !== 'string' ||
      typeof rawReceipt.receipt_key_version !== 'string' ||
      typeof rawReceipt.receipt_commitment !== 'string' ||
      canonicalizeBareUuid(rawReceipt.event_id) !== rawReceipt.event_id ||
      rawReceipt.receipt_key_version !== configuredVersion ||
      rawReceipt.source !== input.source ||
      rawReceipt.query_version !== TELEMETRY_QUERY_VERSION ||
      rawReceipt.window_start_utc !== input.window_start_utc ||
      rawReceipt.window_end_utc !== input.window_end_utc ||
      rawReceipt.registration_commitment !== input.manifest.authority_commitment ||
      rawReceipt.universe_commitment !== input.manifest.universe_commitment ||
      !SHA256_PATTERN.test(rawReceipt.envelope_digest) ||
      !SHA256_PATTERN.test(rawReceipt.receipt_commitment) ||
      receipts.has(rawReceipt.event_id) ||
      !uniqueEnvelopeIds.has(rawReceipt.event_id)
    ) {
      return null
    }
    const receipt = rawReceipt as TelemetryIngestReceipt
    const receivedAt = parseUtc(receipt.received_at_utc)
    const envelope = envelopes.find((candidate) => candidate.event_id === receipt.event_id)
    const occurredAt = envelope ? parseUtc(envelope.occurred_at_utc) : null
    const sealedAt = parseUtc(input.event_universe.sealed_at_utc)
    if (
      receivedAt === null ||
      occurredAt === null ||
      sealedAt === null ||
      receivedAt < occurredAt ||
      receivedAt > sealedAt ||
      receipt.envelope_digest !== createTelemetryEnvelopeDigest(envelope!)
    ) {
      return null
    }
    try {
      const { receipt_commitment: _receiptCommitment, ...unsignedReceipt } = receipt
      const expected = Buffer.from(
        createTelemetryIngestReceiptCommitment({
          receipt: unsignedReceipt,
          commitment_key: configuredKey,
        }),
        'hex',
      )
      const received = Buffer.from(receipt.receipt_commitment, 'hex')
      if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
    } catch {
      return null
    }
    receipts.set(receipt.event_id, receipt)
  }
  return receipts
}

function receivedEnvelopeSignature(envelope: TelemetryEnvelope): string {
  return createTelemetryEnvelopeDigest(envelope)
}

export function evaluateTelemetryCompleteness(
  input: TelemetryCompletenessInput,
): TelemetryCompletenessResult {
  const manifest = input.manifest as TelemetryExpectationManifest | undefined
  if (!manifest) return completenessHold(input.source, 'expected_manifest_missing')
  if (manifest.sampling_policy_version !== TELEMETRY_SAMPLING_POLICY_VERSION) {
    return completenessHold(input.source, 'sampling_policy_mismatch')
  }
  if (
    input.actor_key_version !== protectedActorKeyVersion() ||
    !validExpectationManifest(manifest, input.source) ||
    !validAuthorityRegistration(input) ||
    !validAuthorityCommitment(input) ||
    !validAuthorityRegistryReceipt(input) ||
    !validEventUniverse(input) ||
    !validManifestCommitment(input)
  ) {
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
    sampledExpectedEventIds = manifest.expected_event_ids
      .map((eventId) => canonicalizeBareUuid(eventId)!)
      .filter((eventId) =>
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
  const receivedReceipts = validReceivedReceipts(input, validatedReceived)
  if (receivedReceipts === null) {
    return completenessHold(input.source, 'received_envelope_invalid')
  }
  const authorityEvents = new Map(
    input.event_universe.eligible_events.map((event) => [event.event_id, event]),
  )
  const expected = new Set(sampledExpectedEventIds)
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
      receivedSignatures.set(envelope.event_id, signature)
    }
    received.add(envelope.event_id)
    const authorityEvent = authorityEvents.get(envelope.event_id)
    if (
      !expected.has(envelope.event_id) ||
      telemetrySourceForOperation(envelope.dimensions.operation) !== input.source ||
      authorityEvent?.operation !== envelope.dimensions.operation ||
      authorityEvent?.occurred_at_utc !== envelope.occurred_at_utc ||
      !receivedReceipts.has(envelope.event_id)
    ) {
      unexpected = true
    }
  }
  const loss = sampledExpectedEventIds.some((eventId) => !received.has(eventId))
  const receivedExpectedReceipts = [...receivedReceipts.values()]
    .filter((receipt) => expected.has(receipt.event_id))
    .sort((left, right) => {
      const receivedDifference =
        Date.parse(left.received_at_utc) - Date.parse(right.received_at_utc)
      return receivedDifference === 0
        ? left.event_id.localeCompare(right.event_id)
        : receivedDifference
    })
  const ambiguousOrder = receivedExpectedReceipts.some(
    (receipt, index) =>
      index > 0 && receipt.received_at_utc === receivedExpectedReceipts[index - 1]!.received_at_utc,
  )
  if (ambiguousOrder) {
    return {
      source: input.source,
      status: 'HOLD',
      reason: 'received_order_ambiguous',
      duplicate: duplicate ? 'DETECTED' : 'NONE',
      reorder: 'NONE',
    }
  }
  const receivedExpectedOrder = receivedExpectedReceipts.map((receipt) => receipt.event_id)
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
  event_name:
    | 'record_started'
    | 'photo_selected'
    | 'ai_draft_shown'
    | 'memory_saved'
    | 'memory_viewed'
  occurred_minute_utc: string
  received_at_utc: string
  anchor_trust: 'verified' | 'unverified'
}

export type SyntheticMemoryTruth = {
  memory_id: string
  idempotency_key: string
  actor: SyntheticActorRef
  created_at_utc: string
}

export type SyntheticProfileMemoryTruth = Pick<
  SyntheticMemoryTruth,
  'memory_id' | 'actor' | 'created_at_utc'
>

function validSyntheticActorRef(
  actor: SyntheticActorRef | null | undefined,
): actor is SyntheticActorRef {
  return (
    isRecord(actor) &&
    hasExactKeys(actor, ['actor_key_version', 'actor_token']) &&
    PROTECTED_ACTOR_KEY_VERSION_PATTERN.test(actor.actor_key_version) &&
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

export function createTelemetryMemorySetDigest(
  memories: readonly (SyntheticMemoryTruth | SyntheticProfileMemoryTruth)[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        stableValue(
          [...memories].sort((left, right) => left.memory_id.localeCompare(right.memory_id)),
        ),
      ),
    )
    .digest('hex')
}

function validMemoryTruthReceipt(input: {
  metric_id: 'M2' | 'M3' | 'M9'
  expected_actor: SyntheticActorRef
  generated_at_utc: string
  completeness_input: TelemetryCompletenessInput
  memories: readonly (SyntheticMemoryTruth | SyntheticProfileMemoryTruth)[]
  receipt: TelemetryMemoryTruthReceipt
}): boolean {
  const receipt = input.receipt as TelemetryMemoryTruthReceipt | undefined
  const configuredVersion = process.env.TELEMETRY_MEMORY_TRUTH_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY
  if (
    !receipt ||
    !isRecord(receipt) ||
    !hasExactKeys(receipt, [
      'schema_version',
      'metric_id',
      'actor',
      'generated_at_utc',
      'window_start_utc',
      'window_end_utc',
      'registration_commitment',
      'universe_commitment',
      'memory_set_digest',
      'record_count',
      'receipt_key_version',
      'receipt_commitment',
    ]) ||
    receipt.schema_version !== TELEMETRY_MEMORY_TRUTH_RECEIPT_SCHEMA_VERSION ||
    receipt.metric_id !== input.metric_id ||
    !sameSyntheticActor(receipt.actor, input.expected_actor) ||
    receipt.generated_at_utc !== input.generated_at_utc ||
    receipt.window_start_utc !== input.completeness_input.window_start_utc ||
    receipt.window_end_utc !== input.completeness_input.window_end_utc ||
    receipt.registration_commitment !== input.completeness_input.manifest.authority_commitment ||
    receipt.universe_commitment !== input.completeness_input.manifest.universe_commitment ||
    receipt.receipt_key_version !== configuredVersion ||
    typeof configuredKey !== 'string' ||
    Buffer.byteLength(configuredKey, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH ||
    !protectedCommitmentKeysAreDistinct(input.completeness_input) ||
    configuredKey === input.completeness_input.sampling_key ||
    !SHA256_PATTERN.test(receipt.memory_set_digest) ||
    !SHA256_PATTERN.test(receipt.receipt_commitment) ||
    !Number.isSafeInteger(receipt.record_count) ||
    receipt.record_count !== input.memories.length ||
    parseUtc(receipt.generated_at_utc) === null ||
    !Array.isArray(input.memories) ||
    input.memories.some((memory) => {
      const expectedKeys =
        input.metric_id === 'M9'
          ? ['memory_id', 'actor', 'created_at_utc']
          : ['memory_id', 'idempotency_key', 'actor', 'created_at_utc']
      return (
        !isRecord(memory) ||
        !hasExactKeys(memory, expectedKeys) ||
        typeof memory.memory_id !== 'string' ||
        canonicalizeBareUuid(memory.memory_id) !== memory.memory_id ||
        !sameSyntheticActor(memory.actor as SyntheticActorRef | undefined, input.expected_actor) ||
        parseUtc(memory.created_at_utc as string) === null ||
        (input.metric_id !== 'M9' &&
          canonicalizeBareUuid((memory as SyntheticMemoryTruth).idempotency_key) !==
            (memory as SyntheticMemoryTruth).idempotency_key)
      )
    }) ||
    new Set(input.memories.map((memory) => memory.memory_id)).size !== input.memories.length ||
    receipt.memory_set_digest !== createTelemetryMemorySetDigest(input.memories)
  ) {
    return false
  }
  try {
    const { receipt_commitment: _commitment, ...unsignedReceipt } = receipt
    const expected = Buffer.from(
      createTelemetryMemoryTruthReceiptCommitment({
        receipt: unsignedReceipt,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(receipt.receipt_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

type OccurrenceMinuteInterval = {
  start: number
  end: number
}

function verifiedOccurrenceMinuteInterval(input: {
  event: SyntheticFunnelEvent
  expected_operation: SyntheticFunnelEvent['event_name']
  received_by_id: ReadonlyMap<string, TelemetryEnvelope>
  receipt_by_id: ReadonlyMap<string, TelemetryIngestReceipt>
  authority_event_by_id: ReadonlyMap<string, TelemetryAuthorityEvent>
  generated_at: number
  window_start: number
  window_end: number
}):
  | { interval: OccurrenceMinuteInterval; reason: null }
  | { interval: null; reason: 'telemetry_incomplete' | 'stage_time_invalid' } {
  const canonicalEventId = canonicalizeBareUuid(input.event.event_id)
  const envelope = canonicalEventId ? input.received_by_id.get(canonicalEventId) : undefined
  const receipt = canonicalEventId ? input.receipt_by_id.get(canonicalEventId) : undefined
  const authorityEvent = canonicalEventId
    ? input.authority_event_by_id.get(canonicalEventId)
    : undefined
  if (
    envelope?.dimensions.operation !== input.expected_operation ||
    receipt === undefined ||
    authorityEvent?.operation !== input.expected_operation ||
    canonicalizeBareUuid(input.event.flow_id) !== authorityEvent.flow_id ||
    !sameSyntheticActor(input.event.actor, authorityEvent.actor)
  ) {
    return { interval: null, reason: 'telemetry_incomplete' }
  }
  const decodedOccurredMinute = productEventOccurrenceMinuteFromEventId(input.event.event_id)
  const occurredAt = decodedOccurredMinute ? parseUtc(decodedOccurredMinute) : null
  const envelopeOccurredAt = parseUtc(envelope.occurred_at_utc)
  const receivedAt = parseUtc(receipt.received_at_utc)
  if (
    decodedOccurredMinute !== input.event.occurred_minute_utc ||
    !UTC_MINUTE_PATTERN.test(input.event.occurred_minute_utc) ||
    occurredAt === null ||
    envelopeOccurredAt !== occurredAt ||
    authorityEvent.occurred_at_utc !== decodedOccurredMinute ||
    input.event.received_at_utc !== receipt.received_at_utc ||
    occurredAt < input.window_start ||
    occurredAt + 60 * 1000 > input.window_end ||
    receivedAt === null ||
    receivedAt < occurredAt ||
    receivedAt > input.generated_at
  ) {
    return { interval: null, reason: 'stage_time_invalid' }
  }
  return { interval: { start: occurredAt, end: occurredAt + 60 * 1000 }, reason: null }
}

export function evaluateSyntheticFunnelFlow(input: {
  metric_id: 'M2' | 'M3'
  flow_id: string
  expected_actor: SyntheticActorRef
  generated_at_utc: string
  completeness_input: TelemetryCompletenessInput
  events: readonly SyntheticFunnelEvent[]
  memories: readonly SyntheticMemoryTruth[]
  memory_truth_receipt: TelemetryMemoryTruthReceipt
}): {
  metric_id: 'M2' | 'M3'
  status: MetricStatus
  reason: TelemetryMetricReason
} {
  const flowId = canonicalizeBareUuid(input.flow_id)
  if (
    !validSyntheticActorRef(input.expected_actor) ||
    !flowId ||
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
  if (
    !sameSyntheticActor(
      input.expected_actor,
      input.completeness_input.authority_registration.expected_actor,
    )
  ) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'actor_reference_invalid' }
  }
  if (!validMemoryTruthReceipt({ ...input, receipt: input.memory_truth_receipt })) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'telemetry_incomplete' }
  }
  const stageName = input.metric_id === 'M2' ? 'photo_selected' : 'ai_draft_shown'
  const sameFlowStages = input.events.filter(
    (event) => canonicalizeBareUuid(event.flow_id) === flowId && event.event_name === stageName,
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
    input.completeness_input.received.map((envelope) => [
      canonicalizeBareUuid(envelope.event_id)!,
      envelope,
    ]),
  )
  const verifiedReceipts = new Map(
    input.completeness_input.received_receipts.map((receipt) => [receipt.event_id, receipt]),
  )
  const authorityEvents = new Map(
    input.completeness_input.event_universe.eligible_events.map((event) => [event.event_id, event]),
  )
  if (sameFlowStages.length === 0) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_missing' }
  }
  if (sameFlowStages.some((event) => event.anchor_trust !== 'verified')) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_anchor_unverified' }
  }
  const generatedAt = parseUtc(input.generated_at_utc)
  const windowStart = parseUtc(input.completeness_input.window_start_utc)
  const windowEnd = parseUtc(input.completeness_input.window_end_utc)
  if (generatedAt === null || windowStart === null || windowEnd === null) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_time_invalid' }
  }
  const stageIntervals = sameFlowStages.map((event) =>
    verifiedOccurrenceMinuteInterval({
      event,
      expected_operation: stageName,
      received_by_id: verifiedReceived,
      receipt_by_id: verifiedReceipts,
      authority_event_by_id: authorityEvents,
      generated_at: generatedAt,
      window_start: windowStart,
      window_end: windowEnd,
    }),
  )
  const invalidStage = stageIntervals.find((result) => result.interval === null)
  if (invalidStage) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: invalidStage.reason }
  }
  const intervals = stageIntervals.map((result) => result.interval!)
  if (new Set(intervals.map((interval) => interval.start)).size !== 1) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'stage_time_invalid' }
  }
  const stageMinuteStart = intervals[0]!.start
  const stageMinuteEnd = intervals[0]!.end
  const conversionWindowMs = 30 * 60 * 1000
  if (generatedAt < stageMinuteEnd + conversionWindowMs) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'window_not_mature' }
  }
  const sameFlowMemories = input.memories.filter(
    (candidate) => canonicalizeBareUuid(candidate.idempotency_key) === flowId,
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
      canonicalizeBareUuid(candidate.idempotency_key) === flowId &&
      sameSyntheticActor(candidate.actor, input.expected_actor),
  )
  if (
    matchingMemories.some(
      (candidate) =>
        canonicalizeBareUuid(candidate.idempotency_key) === null ||
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

export function evaluateSyntheticM9ViewToMemory(input: {
  expected_actor: SyntheticActorRef
  generated_at_utc: string
  completeness_input: TelemetryCompletenessInput
  events: readonly SyntheticFunnelEvent[]
  memories: readonly SyntheticProfileMemoryTruth[]
  memory_truth_receipt: TelemetryMemoryTruthReceipt
}): { metric_id: 'M9'; status: MetricStatus; reason: TelemetryMetricReason } {
  const hold = (reason: TelemetryMetricReason) => ({
    metric_id: 'M9' as const,
    status: 'HOLD' as const,
    reason,
  })
  if (
    !validSyntheticActorRef(input.expected_actor) ||
    input.expected_actor.actor_key_version !== input.completeness_input.actor_key_version
  ) {
    return hold('actor_reference_invalid')
  }
  const completeness = evaluateTelemetryCompleteness(input.completeness_input)
  if (
    completeness.source !== 'funnel' ||
    completeness.status !== 'PASS' ||
    completeness.reason !== 'complete'
  ) {
    return hold('telemetry_incomplete')
  }
  if (
    !sameSyntheticActor(
      input.expected_actor,
      input.completeness_input.authority_registration.expected_actor,
    )
  ) {
    return hold('actor_reference_invalid')
  }
  if (
    !validMemoryTruthReceipt({ ...input, metric_id: 'M9', receipt: input.memory_truth_receipt })
  ) {
    return hold('telemetry_incomplete')
  }
  const views = input.events.filter((event) => event.event_name === 'memory_viewed')
  if (
    views.some(
      (event) =>
        !validSyntheticActorRef(event.actor) ||
        !sameSyntheticActor(event.actor, input.expected_actor),
    ) ||
    input.memories.some(
      (memory) =>
        !validSyntheticActorRef(memory.actor) ||
        !sameSyntheticActor(memory.actor, input.expected_actor),
    )
  ) {
    return hold('actor_reference_invalid')
  }
  if (views.length === 0) return hold('stage_missing')
  const suppliedViewIds = views.map((event) => canonicalizeBareUuid(event.event_id))
  const receivedViewIds = input.completeness_input.received
    .filter((envelope) => envelope.dimensions.operation === 'memory_viewed')
    .map((envelope) => canonicalizeBareUuid(envelope.event_id))
  if (
    suppliedViewIds.some((eventId) => eventId === null) ||
    receivedViewIds.some((eventId) => eventId === null) ||
    new Set(suppliedViewIds).size !== suppliedViewIds.length ||
    new Set(receivedViewIds).size !== receivedViewIds.length ||
    suppliedViewIds.length !== receivedViewIds.length ||
    suppliedViewIds.some((eventId) => !receivedViewIds.includes(eventId))
  ) {
    return hold('telemetry_incomplete')
  }
  if (views.some((event) => event.anchor_trust !== 'verified')) {
    return hold('stage_anchor_unverified')
  }
  const generatedAt = parseUtc(input.generated_at_utc)
  const windowStart = parseUtc(input.completeness_input.window_start_utc)
  const windowEnd = parseUtc(input.completeness_input.window_end_utc)
  if (generatedAt === null || windowStart === null || windowEnd === null) {
    return hold('stage_time_invalid')
  }
  const verifiedReceived = new Map(
    input.completeness_input.received.map((envelope) => [
      canonicalizeBareUuid(envelope.event_id)!,
      envelope,
    ]),
  )
  const verifiedReceipts = new Map(
    input.completeness_input.received_receipts.map((receipt) => [receipt.event_id, receipt]),
  )
  const authorityEvents = new Map(
    input.completeness_input.event_universe.eligible_events.map((event) => [event.event_id, event]),
  )
  const viewIntervals = views.map((event) =>
    verifiedOccurrenceMinuteInterval({
      event,
      expected_operation: 'memory_viewed',
      received_by_id: verifiedReceived,
      receipt_by_id: verifiedReceipts,
      authority_event_by_id: authorityEvents,
      generated_at: generatedAt,
      window_start: windowStart,
      window_end: windowEnd,
    }),
  )
  const invalidView = viewIntervals.find((result) => result.interval === null)
  if (invalidView) return hold(invalidView.reason)
  const firstView = viewIntervals
    .map((result) => result.interval!)
    .sort((left, right) => left.start - right.start)[0]!
  const conversionWindowMs = 7 * 24 * 60 * 60 * 1000
  if (generatedAt < firstView.end + conversionWindowMs) return hold('window_not_mature')
  const parsedMemories = input.memories.map((memory) => ({
    ...memory,
    createdAt: parseUtc(memory.created_at_utc),
  }))
  if (
    parsedMemories.some((memory) => memory.createdAt === null || memory.createdAt > generatedAt)
  ) {
    return hold('stage_time_invalid')
  }
  const memory = parsedMemories
    .filter(
      (candidate): candidate is typeof candidate & { createdAt: number } =>
        candidate.createdAt !== null && candidate.createdAt >= firstView.start,
    )
    .sort((left, right) => left.createdAt - right.createdAt)[0]
  if (!memory) return { metric_id: 'M9', status: 'FAIL', reason: 'memory_not_saved' }
  if (memory.createdAt < firstView.end) return hold('event_reordered_after_truth')
  const longestPossibleDuration = memory.createdAt - firstView.start
  const shortestPossibleDuration = memory.createdAt - firstView.end
  if (longestPossibleDuration < conversionWindowMs) {
    return { metric_id: 'M9', status: 'PASS', reason: 'memory_saved_within_window' }
  }
  if (shortestPossibleDuration >= conversionWindowMs) {
    return { metric_id: 'M9', status: 'FAIL', reason: 'memory_saved_after_window' }
  }
  return hold('stage_anchor_boundary')
}

const FIXED_RATE_POLICIES = {
  M1: { target: 0.7, minimum: 20, requires_distinct_units: false },
  M2: { target: 0.85, minimum: 20, requires_distinct_units: true },
  M3: { target: 0.75, minimum: 20, requires_distinct_units: true },
  M5: { target: 0.4, minimum: 20, requires_distinct_units: false },
  M6: { target: 0.25, minimum: 20, requires_distinct_units: false },
  M7: { target: 0.4, minimum: 20, requires_distinct_units: true },
} as const

export type TelemetryBaselineEvidenceReceipt = {
  schema_version: typeof TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION
  evidence_schema_version: typeof TELEMETRY_EVIDENCE_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  metric_id: 'M8' | 'M9'
  cohort_role: 'baseline'
  actor_key_version: string
  window_start_utc: string
  window_end_utc: string
  generated_at_utc: string
  evidence_digest: string
  metric_status: 'HOLD'
  metric_reason: 'baseline_only'
  evidence_key_version: string
  receipt_commitment: string
}

export type TelemetryTargetDecision = {
  schema_version: typeof TELEMETRY_TARGET_DECISION_SCHEMA_VERSION
  policy_version: typeof TELEMETRY_TARGET_POLICY_VERSION
  metric_id: 'M8' | 'M9'
  target: number
  direction: 'at_or_above'
  baseline_evidence_receipt: TelemetryBaselineEvidenceReceipt
  target_fixed_at_utc: string
  evaluation_window_start_utc: string
  evaluation_window_end_utc: string
  remeasurement_deadline_utc: string
  cohort_role: 'evaluation'
  target_key_version: string
  target_commitment: string
}

export function createTelemetryBaselineEvidenceReceiptCommitment(input: {
  receipt: Omit<TelemetryBaselineEvidenceReceipt, 'receipt_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_BASELINE_EVIDENCE_RECEIPT_DOMAIN)
    .update(JSON.stringify(stableValue(input.receipt)))
    .digest('hex')
}

export function createTelemetryTargetDecisionCommitment(input: {
  decision: Omit<TelemetryTargetDecision, 'target_commitment'>
  commitment_key: string
}): string {
  if (
    typeof input.commitment_key !== 'string' ||
    Buffer.byteLength(input.commitment_key, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', input.commitment_key)
    .update(TELEMETRY_TARGET_DECISION_DOMAIN)
    .update(JSON.stringify(stableValue(input.decision)))
    .digest('hex')
}

function validBaselineEvidenceReceipt(
  receipt: TelemetryBaselineEvidenceReceipt,
  metricId: 'M8' | 'M9',
): boolean {
  const configuredActorVersion = protectedActorKeyVersion()
  const configuredEvidenceVersion = process.env.TELEMETRY_EVIDENCE_KEY_VERSION
  const configuredEvidenceKey = process.env.TELEMETRY_EVIDENCE_COMMITMENT_KEY
  if (
    !isRecord(receipt) ||
    !hasExactKeys(receipt, [
      'schema_version',
      'evidence_schema_version',
      'query_version',
      'metric_id',
      'cohort_role',
      'actor_key_version',
      'window_start_utc',
      'window_end_utc',
      'generated_at_utc',
      'evidence_digest',
      'metric_status',
      'metric_reason',
      'evidence_key_version',
      'receipt_commitment',
    ]) ||
    receipt.schema_version !== TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION ||
    receipt.evidence_schema_version !== TELEMETRY_EVIDENCE_SCHEMA_VERSION ||
    receipt.query_version !== TELEMETRY_QUERY_VERSION ||
    receipt.metric_id !== metricId ||
    receipt.cohort_role !== 'baseline' ||
    receipt.actor_key_version !== configuredActorVersion ||
    receipt.metric_status !== 'HOLD' ||
    receipt.metric_reason !== 'baseline_only' ||
    receipt.evidence_key_version !== configuredEvidenceVersion ||
    typeof configuredEvidenceKey !== 'string' ||
    !SHA256_PATTERN.test(receipt.evidence_digest) ||
    !SHA256_PATTERN.test(receipt.receipt_commitment)
  ) {
    return false
  }
  const windowStart = parseUtc(receipt.window_start_utc)
  const windowEnd = parseUtc(receipt.window_end_utc)
  const generatedAt = parseUtc(receipt.generated_at_utc)
  const maturityCutoff =
    windowEnd === null ? null : windowEnd + (metricId === 'M9' ? 7 * 24 * 60 * 60 * 1000 : 0)
  if (
    windowStart === null ||
    windowEnd === null ||
    generatedAt === null ||
    maturityCutoff === null ||
    windowStart >= windowEnd ||
    generatedAt < maturityCutoff ||
    (metricId === 'M8' && !isUtcCalendarMonthWindow(windowStart, windowEnd)) ||
    (metricId === 'M9' &&
      (!UTC_MINUTE_PATTERN.test(receipt.window_start_utc) ||
        !UTC_MINUTE_PATTERN.test(receipt.window_end_utc)))
  ) {
    return false
  }
  try {
    const { receipt_commitment: _commitment, ...unsignedReceipt } = receipt
    const expected = Buffer.from(
      createTelemetryBaselineEvidenceReceiptCommitment({
        receipt: unsignedReceipt,
        commitment_key: configuredEvidenceKey,
      }),
      'hex',
    )
    const received = Buffer.from(receipt.receipt_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

function validatedProtectedTarget(input: {
  metric_id: TelemetryMetricId
  evaluation_window_start_utc: string | null
  evaluation_window_end_utc: string | null
  generated_at_utc: string
  target_decision: TelemetryTargetDecision | null
}): number | null {
  if (input.metric_id !== 'M8' && input.metric_id !== 'M9') return null
  const decision = input.target_decision
  const configuredVersion = process.env.TELEMETRY_TARGET_DECISION_KEY_VERSION
  const configuredKey = process.env.TELEMETRY_TARGET_DECISION_COMMITMENT_KEY
  if (
    !decision ||
    !isRecord(decision) ||
    !hasExactKeys(decision, [
      'schema_version',
      'policy_version',
      'metric_id',
      'target',
      'direction',
      'baseline_evidence_receipt',
      'target_fixed_at_utc',
      'evaluation_window_start_utc',
      'evaluation_window_end_utc',
      'remeasurement_deadline_utc',
      'cohort_role',
      'target_key_version',
      'target_commitment',
    ]) ||
    decision.schema_version !== TELEMETRY_TARGET_DECISION_SCHEMA_VERSION ||
    decision.policy_version !== TELEMETRY_TARGET_POLICY_VERSION ||
    decision.metric_id !== input.metric_id ||
    !Number.isFinite(decision.target) ||
    decision.target < 0 ||
    decision.target > 1 ||
    decision.direction !== 'at_or_above' ||
    !validBaselineEvidenceReceipt(decision.baseline_evidence_receipt, input.metric_id) ||
    decision.evaluation_window_start_utc !== input.evaluation_window_start_utc ||
    decision.evaluation_window_end_utc !== input.evaluation_window_end_utc ||
    decision.cohort_role !== 'evaluation' ||
    decision.target_key_version !== configuredVersion ||
    typeof configuredKey !== 'string' ||
    !SHA256_PATTERN.test(decision.target_commitment) ||
    !protectedEnvironmentCommitmentKeysAreDistinct()
  ) {
    return null
  }
  const baselineWindowEnd = parseUtc(decision.baseline_evidence_receipt.window_end_utc)
  const baselineGeneratedAt = parseUtc(decision.baseline_evidence_receipt.generated_at_utc)
  const targetFixedAt = parseUtc(decision.target_fixed_at_utc)
  const windowStart = parseUtc(decision.evaluation_window_start_utc)
  const windowEnd = parseUtc(decision.evaluation_window_end_utc)
  const generatedAt = parseUtc(input.generated_at_utc)
  const remeasurementDeadline = parseUtc(decision.remeasurement_deadline_utc)
  if (
    baselineWindowEnd === null ||
    baselineGeneratedAt === null ||
    targetFixedAt === null ||
    windowStart === null ||
    windowEnd === null ||
    generatedAt === null ||
    remeasurementDeadline === null ||
    baselineWindowEnd > baselineGeneratedAt ||
    baselineGeneratedAt > targetFixedAt ||
    targetFixedAt >= windowStart ||
    windowStart >= windowEnd ||
    generatedAt > remeasurementDeadline
  ) {
    return null
  }
  try {
    const { target_commitment: _commitment, ...unsignedDecision } = decision
    const expected = Buffer.from(
      createTelemetryTargetDecisionCommitment({
        decision: unsignedDecision,
        commitment_key: configuredKey,
      }),
      'hex',
    )
    const received = Buffer.from(decision.target_commitment, 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
      ? decision.target
      : null
  } catch {
    return null
  }
}

export function evaluateCensoredRate(input: {
  metric_id: TelemetryMetricId
  eligible: number
  succeeded: number
  censored: number
  distinct_profiles: number | null
  distinct_eligible_units: number | null
  evaluation_window_start_utc: string | null
  evaluation_window_end_utc: string | null
  generated_at_utc: string
  target_decision: TelemetryTargetDecision | null
}): { metric_id: TelemetryMetricId; status: MetricStatus; reason: TelemetryMetricReason } {
  if (!HIGHER_IS_BETTER_PRODUCTION_METRICS.has(input.metric_id)) {
    return {
      metric_id: input.metric_id,
      status: 'HOLD',
      reason: 'unsupported_metric_direction',
    }
  }
  const valid =
    isRecord(input) &&
    hasExactKeys(input, [
      'metric_id',
      'eligible',
      'succeeded',
      'censored',
      'distinct_profiles',
      'distinct_eligible_units',
      'evaluation_window_start_utc',
      'evaluation_window_end_utc',
      'generated_at_utc',
      'target_decision',
    ]) &&
    Number.isSafeInteger(input.eligible) &&
    Number.isSafeInteger(input.succeeded) &&
    Number.isSafeInteger(input.censored) &&
    input.eligible >= 0 &&
    input.succeeded >= 0 &&
    input.censored >= 0 &&
    input.succeeded + input.censored <= input.eligible
  if (!valid) return { metric_id: input.metric_id, status: 'HOLD', reason: 'invalid_census' }
  const fixedPolicy = FIXED_RATE_POLICIES[input.metric_id as keyof typeof FIXED_RATE_POLICIES]
  const dynamicTarget = validatedProtectedTarget(input)
  if (!fixedPolicy && dynamicTarget === null) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'target_not_configured' }
  }
  const minimum = fixedPolicy?.minimum ?? 20
  const requiresDistinctUnits = fixedPolicy?.requires_distinct_units ?? false
  const distinctValuesValid = requiresDistinctUnits
    ? Number.isSafeInteger(input.distinct_profiles) &&
      Number.isSafeInteger(input.distinct_eligible_units) &&
      input.distinct_profiles! >= 0 &&
      input.distinct_eligible_units === input.eligible
    : input.distinct_profiles === null && input.distinct_eligible_units === null
  if (!distinctValuesValid) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'invalid_census' }
  }
  if (input.eligible < minimum || (requiresDistinctUnits && input.distinct_profiles! < minimum)) {
    return { metric_id: input.metric_id, status: 'HOLD', reason: 'minimum_not_met' }
  }
  const target = fixedPolicy?.target ?? dynamicTarget!
  const lowerBound = input.succeeded / input.eligible
  const upperBound = (input.succeeded + input.censored) / input.eligible
  if (lowerBound >= target) {
    return { metric_id: input.metric_id, status: 'PASS', reason: 'worst_case_passed' }
  }
  if (upperBound < target) {
    return { metric_id: input.metric_id, status: 'FAIL', reason: 'best_case_failed' }
  }
  return { metric_id: input.metric_id, status: 'HOLD', reason: 'censoring_changes_decision' }
}

export type SuppressionCell = {
  id: 'success' | 'failure' | 'total'
  value: number
}

export type TelemetryBinaryOutcomeTable = {
  schema_version: typeof TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION
  cells: readonly SuppressionCell[]
}

export function applyTelemetrySuppression(input: TelemetryBinaryOutcomeTable): {
  id: SuppressionCell['id']
  value: number | 'suppressed'
  reason: 'visible' | 'primary' | 'secondary'
}[] {
  const requiredIds = ['success', 'failure', 'total'] as const
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ['schema_version', 'cells']) ||
    input.schema_version !== TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION ||
    !Array.isArray(input.cells) ||
    input.cells.length !== requiredIds.length ||
    input.cells.some(
      (cell) =>
        !isRecord(cell) ||
        !hasExactKeys(cell, ['id', 'value']) ||
        !includes(requiredIds, cell.id) ||
        typeof cell.value !== 'number' ||
        !Number.isSafeInteger(cell.value) ||
        cell.value < 0,
    ) ||
    new Set(input.cells.map((cell) => cell.id)).size !== requiredIds.length ||
    requiredIds.some((id) => !input.cells.some((cell) => cell.id === id))
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  const cells = new Map(input.cells.map((cell) => [cell.id, cell]))
  if (cells.get('success')!.value + cells.get('failure')!.value !== cells.get('total')!.value) {
    throw new TelemetryContractError('invalid_input')
  }
  const primary = new Set(
    input.cells.filter((cell) => cell.value < TELEMETRY_MIN_CELL_SIZE).map((cell) => cell.id),
  )
  const secondary = new Set<SuppressionCell['id']>()
  if (primary.size === 1) {
    const candidate = requiredIds
      .filter((id) => !primary.has(id))
      .sort((left, right) => {
        const difference = cells.get(left)!.value - cells.get(right)!.value
        return difference === 0 ? left.localeCompare(right) : difference
      })[0]
    if (candidate) secondary.add(candidate)
  }
  return requiredIds.map((id) => {
    const cell = cells.get(id)!
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

function evidenceDigest(value: unknown, commitmentKey: string): string {
  if (
    typeof commitmentKey !== 'string' ||
    Buffer.byteLength(commitmentKey, 'utf8') < TELEMETRY_COMMITMENT_KEY_MIN_LENGTH
  ) {
    throw new TelemetryContractError('invalid_input')
  }
  return createHmac('sha256', commitmentKey)
    .update(TELEMETRY_EVIDENCE_DIGEST_DOMAIN)
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
  const canonicalEventId = canonicalizeBareUuid(eventId)
  if (canonicalEventId === null) throw new TelemetryContractError('invalid_input')
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
      .update(canonicalEventId)
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

const CENSORED_RATE_REASONS = [
  'invalid_census',
  'minimum_not_met',
  'worst_case_passed',
  'best_case_failed',
  'censoring_changes_decision',
] as const satisfies readonly TelemetryMetricReason[]
const EVIDENCE_RATE_REASONS = [...CENSORED_RATE_REASONS, 'window_not_mature'] as const
const FUNNEL_CORRELATION_HOLD_REASONS = [
  'telemetry_incomplete',
  'stage_missing',
  'window_not_mature',
  'event_reordered_after_truth',
  'stage_anchor_unverified',
  'stage_anchor_boundary',
  'stage_time_invalid',
  'actor_reference_invalid',
] as const satisfies readonly TelemetryMetricReason[]
const FUNNEL_CORRELATION_OVERRIDE_REASONS = [
  'stage_missing',
  'event_reordered_after_truth',
  'stage_anchor_unverified',
  'stage_anchor_boundary',
  'stage_time_invalid',
  'actor_reference_invalid',
] as const satisfies readonly TelemetryMetricReason[]

const METRIC_REASON_ALLOWLIST = {
  M1: EVIDENCE_RATE_REASONS,
  M2: [...EVIDENCE_RATE_REASONS, ...FUNNEL_CORRELATION_HOLD_REASONS],
  M3: [...EVIDENCE_RATE_REASONS, ...FUNNEL_CORRELATION_HOLD_REASONS],
  M4: ['unsupported_metric_direction'],
  M5: EVIDENCE_RATE_REASONS,
  M6: EVIDENCE_RATE_REASONS,
  M7: EVIDENCE_RATE_REASONS,
  M8: [...EVIDENCE_RATE_REASONS, 'telemetry_incomplete', 'target_not_configured'],
  M9: [...EVIDENCE_RATE_REASONS, ...FUNNEL_CORRELATION_HOLD_REASONS, 'target_not_configured'],
  M10: ['unsupported_metric_direction'],
  M11: ['unsupported_metric_direction'],
  M12: ['unsupported_metric_direction'],
  north_star_monthly_memories_per_active_profile: [
    'database_truth_complete',
    'unsupported_metric_direction',
  ],
} as const satisfies Record<TelemetryMetricId, readonly TelemetryMetricReason[]>

function validMetricResult(metric: TelemetryMetricResult): boolean {
  return (
    includes(METRIC_IDS, metric.metric_id) &&
    includes(METRIC_STATUSES, metric.status) &&
    includes(METRIC_REASONS, metric.reason) &&
    METRIC_REASON_STATUS[metric.reason] === metric.status &&
    (METRIC_REASON_ALLOWLIST[metric.metric_id] as readonly TelemetryMetricReason[]).includes(
      metric.reason,
    )
  )
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

type RequiredTelemetryMetricId = (typeof TELEMETRY_REQUIRED_METRIC_IDS)[number]

const METRIC_WINDOW_POLICIES = {
  M1: {
    anchor: 'profile_created_at',
    entry_rule: 'anchor_in_half_open_window',
    maturity_rule: 'anchor_plus_24_hours',
    maturity_offset_seconds: 24 * 60 * 60,
  },
  M2: {
    anchor: 'photo_selected_occurrence_minute',
    entry_rule: 'full_occurrence_minute_in_half_open_window',
    maturity_rule: 'occurrence_minute_end_plus_30_minutes',
    maturity_offset_seconds: 30 * 60,
  },
  M3: {
    anchor: 'ai_draft_shown_occurrence_minute',
    entry_rule: 'full_occurrence_minute_in_half_open_window',
    maturity_rule: 'occurrence_minute_end_plus_30_minutes',
    maturity_offset_seconds: 30 * 60,
  },
  M4: {
    anchor: 'pilot_first_attempt_interactive_screen_presented_at',
    entry_rule: 'first_attempt_anchor_in_half_open_window',
    maturity_rule: 'db_save_confirmed_or_terminal_outcome_classified',
    maturity_offset_seconds: null,
  },
  M5: {
    anchor: 'profile_created_at',
    entry_rule: 'anchor_in_half_open_window',
    maturity_rule: 'anchor_plus_8_days',
    maturity_offset_seconds: 8 * 24 * 60 * 60,
  },
  M6: {
    anchor: 'profile_created_at',
    entry_rule: 'anchor_in_half_open_window',
    maturity_rule: 'anchor_plus_31_days',
    maturity_offset_seconds: 31 * 24 * 60 * 60,
  },
  M7: {
    anchor: 'utc_week_start',
    entry_rule: 'whole_utc_week_in_half_open_window',
    maturity_rule: 'utc_week_end',
    maturity_offset_seconds: 0,
  },
  M8: {
    anchor: 'utc_calendar_month_start',
    entry_rule: 'whole_utc_calendar_month_in_half_open_window',
    maturity_rule: 'next_utc_calendar_month_start',
    maturity_offset_seconds: 0,
  },
  M9: {
    anchor: 'first_eligible_memory_viewed_occurrence_minute_per_profile',
    entry_rule: 'full_occurrence_minute_in_half_open_window',
    maturity_rule: 'occurrence_minute_end_plus_7_days',
    maturity_offset_seconds: 7 * 24 * 60 * 60,
  },
} as const

type MetricWindowMetricId = keyof typeof METRIC_WINDOW_POLICIES

export type TelemetryMetricWindowEntry = {
  metric_id: MetricWindowMetricId
  anchor: (typeof METRIC_WINDOW_POLICIES)[MetricWindowMetricId]['anchor']
  entry_rule: (typeof METRIC_WINDOW_POLICIES)[MetricWindowMetricId]['entry_rule']
  entry_window_start_utc: string
  entry_window_end_utc: string
  maturity_rule: (typeof METRIC_WINDOW_POLICIES)[MetricWindowMetricId]['maturity_rule']
  maturity_cutoff_utc: string | null
}

export type TelemetryMetricWindowManifest = {
  schema_version: typeof TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  contract_version: '2026-08-08.1'
  metric_policy_version: typeof TELEMETRY_METRIC_POLICY_VERSION
  actor_key_version: string
  cohort_role: 'evaluation'
  window_start_utc: string
  window_end_utc: string
  metric_ids: readonly RequiredTelemetryMetricId[]
  metric_windows: readonly TelemetryMetricWindowEntry[]
  target_decisions: readonly TelemetryTargetDecision[]
}

export type TelemetryEligibleCensus = {
  schema_version: typeof TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  census_policy_version: 'distinct-profile-and-unit/v1'
  window_start_utc: string
  window_end_utc: string
  metrics: readonly {
    metric_id: RequiredTelemetryMetricId
    eligible: number
    distinct_profiles: number | null
    distinct_eligible_units: number | null
  }[]
}

export type TelemetryCensoringStatus = {
  schema_version: typeof TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION
  query_version: typeof TELEMETRY_QUERY_VERSION
  censoring_policy_version: 'right-censor-worst-case/v1'
  window_start_utc: string
  window_end_utc: string
  metrics: readonly {
    metric_id: RequiredTelemetryMetricId
    succeeded: number
    censored: number
  }[]
}

function hasExactRequiredMetricSet(metricIds: readonly unknown[]): boolean {
  return (
    metricIds.length === TELEMETRY_REQUIRED_METRIC_IDS.length &&
    new Set(metricIds).size === metricIds.length &&
    TELEMETRY_REQUIRED_METRIC_IDS.every((metricId) => metricIds.includes(metricId))
  )
}

function isUtcWeekWindow(start: number, end: number): boolean {
  const startDate = new Date(start)
  const endDate = new Date(end)
  return (
    startDate.getUTCDay() === 1 &&
    endDate.getUTCDay() === 1 &&
    startDate.getUTCHours() === 0 &&
    startDate.getUTCMinutes() === 0 &&
    startDate.getUTCSeconds() === 0 &&
    endDate.getUTCHours() === 0 &&
    endDate.getUTCMinutes() === 0 &&
    endDate.getUTCSeconds() === 0 &&
    (end - start) % (7 * 24 * 60 * 60 * 1000) === 0
  )
}

function isUtcCalendarMonthWindow(start: number, end: number): boolean {
  const startDate = new Date(start)
  const expectedEnd = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1),
  ).getTime()
  return (
    startDate.getUTCDate() === 1 &&
    startDate.getUTCHours() === 0 &&
    startDate.getUTCMinutes() === 0 &&
    startDate.getUTCSeconds() === 0 &&
    end === expectedEnd
  )
}

function canonicalUtc(timestamp: number): string {
  return new Date(timestamp).toISOString().replace('.000Z', 'Z')
}

function innerMetricEntryWindow(
  metricId: MetricWindowMetricId,
  outerStart: number,
  outerEnd: number,
): { start: number; end: number } {
  if (metricId === 'M2' || metricId === 'M3' || metricId === 'M9') {
    const minute = 60 * 1000
    return {
      start: Math.ceil(outerStart / minute) * minute,
      end: Math.floor(outerEnd / minute) * minute,
    }
  }
  if (metricId === 'M7') {
    const day = 24 * 60 * 60 * 1000
    const startDay = Date.UTC(
      new Date(outerStart).getUTCFullYear(),
      new Date(outerStart).getUTCMonth(),
      new Date(outerStart).getUTCDate(),
    )
    const startDayOfWeek = new Date(startDay).getUTCDay()
    let start = startDay + ((8 - startDayOfWeek) % 7) * day
    if (start < outerStart) start += 7 * day
    const endDay = Date.UTC(
      new Date(outerEnd).getUTCFullYear(),
      new Date(outerEnd).getUTCMonth(),
      new Date(outerEnd).getUTCDate(),
    )
    const endDayOfWeek = new Date(endDay).getUTCDay()
    let end = endDay - ((endDayOfWeek + 6) % 7) * day
    if (end > outerEnd) end -= 7 * day
    return { start, end }
  }
  if (metricId === 'M8') {
    const startDate = new Date(outerStart)
    let start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)
    if (start < outerStart) {
      start = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1)
    }
    const endDate = new Date(outerEnd)
    let end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1)
    if (end > outerEnd) {
      end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth() - 1, 1)
    }
    return { start, end }
  }
  return { start: outerStart, end: outerEnd }
}

function validMetricWindowEntries(input: {
  entries: readonly TelemetryMetricWindowEntry[]
  window_start_utc: string
  window_end_utc: string
}): boolean {
  if (
    !Array.isArray(input.entries) ||
    input.entries.length !== Object.keys(METRIC_WINDOW_POLICIES).length ||
    new Set(input.entries.map((entry) => (isRecord(entry) ? entry.metric_id : undefined))).size !==
      input.entries.length
  ) {
    return false
  }
  const outerStart = parseUtc(input.window_start_utc)
  const outerEnd = parseUtc(input.window_end_utc)
  if (outerStart === null || outerEnd === null) return false
  return (Object.keys(METRIC_WINDOW_POLICIES) as MetricWindowMetricId[]).every((metricId) => {
    const entry = input.entries.find(
      (candidate) => isRecord(candidate) && candidate.metric_id === metricId,
    )
    const policy = METRIC_WINDOW_POLICIES[metricId]
    if (
      !entry ||
      !isRecord(entry) ||
      !hasExactKeys(entry, [
        'metric_id',
        'anchor',
        'entry_rule',
        'entry_window_start_utc',
        'entry_window_end_utc',
        'maturity_rule',
        'maturity_cutoff_utc',
      ]) ||
      entry.metric_id !== metricId ||
      entry.anchor !== policy.anchor ||
      entry.entry_rule !== policy.entry_rule ||
      entry.maturity_rule !== policy.maturity_rule
    ) {
      return false
    }
    const entryStart = parseUtc(entry.entry_window_start_utc)
    const entryEnd = parseUtc(entry.entry_window_end_utc)
    const expectedWindow = innerMetricEntryWindow(metricId, outerStart, outerEnd)
    const expectedCutoff =
      policy.maturity_offset_seconds === null
        ? null
        : canonicalUtc(expectedWindow.end + policy.maturity_offset_seconds * 1000)
    if (
      entryStart === null ||
      entryEnd === null ||
      entryStart !== expectedWindow.start ||
      entryEnd !== expectedWindow.end ||
      entryStart >= entryEnd ||
      entry.maturity_cutoff_utc !== expectedCutoff
    ) {
      return false
    }
    if (metricId === 'M7' && !isUtcWeekWindow(entryStart, entryEnd)) return false
    if (metricId === 'M8' && !isUtcCalendarMonthWindow(entryStart, entryEnd)) return false
    if (
      (metricId === 'M2' || metricId === 'M3' || metricId === 'M9') &&
      (!UTC_MINUTE_PATTERN.test(entry.entry_window_start_utc) ||
        !UTC_MINUTE_PATTERN.test(entry.entry_window_end_utc))
    ) {
      return false
    }
    return true
  })
}

function validMetricWindowManifest(
  value: TelemetryMetricWindowManifest,
  windowStartUtc: string,
  windowEndUtc: string,
  generatedAtUtc: string,
): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'schema_version',
      'query_version',
      'contract_version',
      'metric_policy_version',
      'actor_key_version',
      'cohort_role',
      'window_start_utc',
      'window_end_utc',
      'metric_ids',
      'metric_windows',
      'target_decisions',
    ]) &&
    value.schema_version === TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION &&
    value.query_version === TELEMETRY_QUERY_VERSION &&
    value.contract_version === '2026-08-08.1' &&
    value.metric_policy_version === TELEMETRY_METRIC_POLICY_VERSION &&
    value.actor_key_version === protectedActorKeyVersion() &&
    value.cohort_role === 'evaluation' &&
    value.window_start_utc === windowStartUtc &&
    value.window_end_utc === windowEndUtc &&
    Array.isArray(value.metric_ids) &&
    hasExactRequiredMetricSet(value.metric_ids) &&
    validMetricWindowEntries({
      entries: value.metric_windows,
      window_start_utc: windowStartUtc,
      window_end_utc: windowEndUtc,
    }) &&
    Array.isArray(value.target_decisions) &&
    value.target_decisions.length === 2 &&
    new Set(
      value.target_decisions.map((decision) =>
        isRecord(decision) ? decision.metric_id : undefined,
      ),
    ).size === 2 &&
    (['M8', 'M9'] as const).every((metricId) => {
      const decision = value.target_decisions.find(
        (candidate) => isRecord(candidate) && candidate.metric_id === metricId,
      )
      return (
        decision !== undefined &&
        value.metric_windows.some((entry) => entry.metric_id === metricId) &&
        validatedProtectedTarget({
          metric_id: metricId,
          evaluation_window_start_utc: value.metric_windows.find(
            (entry) => entry.metric_id === metricId,
          )!.entry_window_start_utc,
          evaluation_window_end_utc: value.metric_windows.find(
            (entry) => entry.metric_id === metricId,
          )!.entry_window_end_utc,
          generated_at_utc: generatedAtUtc,
          target_decision: decision,
        }) !== null
      )
    })
  )
}

function validEligibleCensus(
  value: TelemetryEligibleCensus,
  windowStartUtc: string,
  windowEndUtc: string,
): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schema_version',
      'query_version',
      'census_policy_version',
      'window_start_utc',
      'window_end_utc',
      'metrics',
    ]) ||
    value.schema_version !== TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION ||
    value.query_version !== TELEMETRY_QUERY_VERSION ||
    value.census_policy_version !== 'distinct-profile-and-unit/v1' ||
    value.window_start_utc !== windowStartUtc ||
    value.window_end_utc !== windowEndUtc ||
    !Array.isArray(value.metrics) ||
    !hasExactRequiredMetricSet(
      value.metrics.map((metric) => (isRecord(metric) ? metric.metric_id : undefined)),
    )
  ) {
    return false
  }
  return value.metrics.every((metric) => {
    if (
      !isRecord(metric) ||
      !hasExactKeys(metric, [
        'metric_id',
        'eligible',
        'distinct_profiles',
        'distinct_eligible_units',
      ]) ||
      !includes(TELEMETRY_REQUIRED_METRIC_IDS, metric.metric_id) ||
      typeof metric.eligible !== 'number' ||
      !Number.isSafeInteger(metric.eligible) ||
      metric.eligible < 0
    ) {
      return false
    }
    const requiresDistinct = ['M2', 'M3', 'M7'].includes(metric.metric_id)
    return requiresDistinct
      ? Number.isSafeInteger(metric.distinct_profiles) &&
          Number.isSafeInteger(metric.distinct_eligible_units) &&
          typeof metric.distinct_profiles === 'number' &&
          metric.distinct_profiles >= 0 &&
          metric.distinct_eligible_units === metric.eligible
      : metric.distinct_profiles === null && metric.distinct_eligible_units === null
  })
}

function validCensoringStatus(
  value: TelemetryCensoringStatus,
  census: TelemetryEligibleCensus,
  windowStartUtc: string,
  windowEndUtc: string,
): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schema_version',
      'query_version',
      'censoring_policy_version',
      'window_start_utc',
      'window_end_utc',
      'metrics',
    ]) ||
    value.schema_version !== TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION ||
    value.query_version !== TELEMETRY_QUERY_VERSION ||
    value.censoring_policy_version !== 'right-censor-worst-case/v1' ||
    value.window_start_utc !== windowStartUtc ||
    value.window_end_utc !== windowEndUtc ||
    !Array.isArray(value.metrics) ||
    !hasExactRequiredMetricSet(
      value.metrics.map((metric) => (isRecord(metric) ? metric.metric_id : undefined)),
    )
  ) {
    return false
  }
  return value.metrics.every((metric) => {
    if (
      !isRecord(metric) ||
      !hasExactKeys(metric, ['metric_id', 'succeeded', 'censored']) ||
      !includes(TELEMETRY_REQUIRED_METRIC_IDS, metric.metric_id) ||
      typeof metric.succeeded !== 'number' ||
      typeof metric.censored !== 'number' ||
      !Number.isSafeInteger(metric.succeeded) ||
      !Number.isSafeInteger(metric.censored) ||
      metric.succeeded < 0 ||
      metric.censored < 0
    ) {
      return false
    }
    const eligible = census.metrics.find((item) => item.metric_id === metric.metric_id)?.eligible
    return eligible !== undefined && metric.succeeded + metric.censored <= eligible
  })
}

const EVIDENCE_RATE_METRIC_IDS = ['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8', 'M9'] as const

function evidenceRateResultsMatch(input: {
  window_start_utc: string
  window_end_utc: string
  generated_at_utc: string
  metric_window_manifest: TelemetryMetricWindowManifest
  eligible_census: TelemetryEligibleCensus
  censoring_status: TelemetryCensoringStatus
  completeness: readonly TelemetryCompletenessResult[]
  metrics: readonly TelemetryMetricResult[]
}): boolean {
  const funnelCompleteness = input.completeness.find((item) => item.source === 'funnel')
  const funnelComplete =
    funnelCompleteness?.status === 'PASS' && funnelCompleteness.reason === 'complete'
  return EVIDENCE_RATE_METRIC_IDS.every((metricId) => {
    const census = input.eligible_census.metrics.find((item) => item.metric_id === metricId)
    const censoring = input.censoring_status.metrics.find((item) => item.metric_id === metricId)
    const supplied = input.metrics.find((item) => item.metric_id === metricId)
    if (!census || !censoring || !supplied) return false
    if (!funnelComplete && ['M2', 'M3', 'M8', 'M9'].includes(metricId)) {
      return supplied.status === 'HOLD' && supplied.reason === 'telemetry_incomplete'
    }
    const metricWindow = input.metric_window_manifest.metric_windows.find(
      (entry) => entry.metric_id === metricId,
    )
    const maturityCutoff =
      metricWindow?.maturity_cutoff_utc === null || metricWindow === undefined
        ? null
        : parseUtc(metricWindow.maturity_cutoff_utc)
    if (maturityCutoff !== null && parseUtc(input.generated_at_utc)! < maturityCutoff) {
      return supplied.status === 'HOLD' && supplied.reason === 'window_not_mature'
    }
    const requiresTarget = metricId === 'M8' || metricId === 'M9'
    const targetDecision = requiresTarget
      ? (input.metric_window_manifest.target_decisions.find(
          (decision) => decision.metric_id === metricId,
        ) ?? null)
      : null
    const recomputed = evaluateCensoredRate({
      metric_id: metricId,
      eligible: census.eligible,
      succeeded: censoring.succeeded,
      censored: censoring.censored,
      distinct_profiles: census.distinct_profiles,
      distinct_eligible_units: census.distinct_eligible_units,
      evaluation_window_start_utc: metricWindow?.entry_window_start_utc ?? null,
      evaluation_window_end_utc: metricWindow?.entry_window_end_utc ?? null,
      generated_at_utc: input.generated_at_utc,
      target_decision: targetDecision,
    })
    if (supplied.status === recomputed.status && supplied.reason === recomputed.reason) return true
    if (
      supplied.status === 'HOLD' &&
      (metricId === 'M2' || metricId === 'M3' || metricId === 'M9') &&
      (FUNNEL_CORRELATION_OVERRIDE_REASONS as readonly TelemetryMetricReason[]).includes(
        supplied.reason,
      )
    ) {
      return true
    }
    return false
  })
}

export type TelemetryEvidence = {
  schema_version: typeof TELEMETRY_EVIDENCE_SCHEMA_VERSION
  source_sha: string
  query_version: typeof TELEMETRY_QUERY_VERSION
  event_schema_version: typeof TELEMETRY_EVENT_SCHEMA_VERSION
  actor_key_version: string
  generated_at_utc: string
  commitment_scheme: typeof TELEMETRY_COMMITMENT_SCHEME
  evidence_key_version: string
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
}

export function buildTelemetryEvidence(input: {
  source_sha: string
  window_start_utc: string
  window_end_utc: string
  generated_at_utc: string
  metric_window_manifest: TelemetryMetricWindowManifest
  eligible_census: TelemetryEligibleCensus
  censoring_status: TelemetryCensoringStatus
  completeness: readonly TelemetryCompletenessResult[]
  metrics: readonly TelemetryMetricResult[]
}): TelemetryEvidence {
  const evidenceKeyVersion = process.env.TELEMETRY_EVIDENCE_KEY_VERSION
  const evidenceKey = process.env.TELEMETRY_EVIDENCE_COMMITMENT_KEY
  const actorKeyVersion = protectedActorKeyVersion()
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      'source_sha',
      'window_start_utc',
      'window_end_utc',
      'generated_at_utc',
      'metric_window_manifest',
      'eligible_census',
      'censoring_status',
      'completeness',
      'metrics',
    ]) ||
    !SHA_PATTERN.test(input.source_sha) ||
    parseUtc(input.window_start_utc) === null ||
    parseUtc(input.window_end_utc) === null ||
    parseUtc(input.window_start_utc)! >= parseUtc(input.window_end_utc)! ||
    actorKeyVersion === null ||
    parseUtc(input.generated_at_utc) === null ||
    typeof evidenceKeyVersion !== 'string' ||
    !ACTOR_KEY_VERSION_PATTERN.test(evidenceKeyVersion) ||
    typeof evidenceKey !== 'string' ||
    !protectedEnvironmentCommitmentKeysAreDistinct() ||
    !validMetricWindowManifest(
      input.metric_window_manifest,
      input.window_start_utc,
      input.window_end_utc,
      input.generated_at_utc,
    ) ||
    !validEligibleCensus(input.eligible_census, input.window_start_utc, input.window_end_utc) ||
    !validCensoringStatus(
      input.censoring_status,
      input.eligible_census,
      input.window_start_utc,
      input.window_end_utc,
    ) ||
    input.completeness.length !== SOURCES.length ||
    input.metrics.length !== TELEMETRY_REQUIRED_METRIC_IDS.length ||
    new Set(input.completeness.map((item) => item.source)).size !== input.completeness.length ||
    SOURCES.some((source) => !input.completeness.some((item) => item.source === source)) ||
    input.completeness.some((item) => !validCompletenessResult(item)) ||
    new Set(input.metrics.map((metric) => metric.metric_id)).size !== input.metrics.length ||
    TELEMETRY_REQUIRED_METRIC_IDS.some(
      (metricId) => !input.metrics.some((metric) => metric.metric_id === metricId),
    ) ||
    input.metrics.some((metric) => !validMetricResult(metric)) ||
    !evidenceRateResultsMatch(input)
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
    actor_key_version: actorKeyVersion,
    commitment_key: evidenceKey,
  }
  const evidenceWithoutDigest = {
    schema_version: TELEMETRY_EVIDENCE_SCHEMA_VERSION,
    source_sha: input.source_sha,
    query_version: TELEMETRY_QUERY_VERSION,
    event_schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    actor_key_version: actorKeyVersion,
    generated_at_utc: input.generated_at_utc,
    commitment_scheme: TELEMETRY_COMMITMENT_SCHEME,
    evidence_key_version: evidenceKeyVersion,
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
  return {
    ...evidenceWithoutDigest,
    evidence_digest: evidenceDigest(evidenceWithoutDigest, evidenceKey),
  }
}

export function verifyTelemetryEvidence(value: unknown): value is TelemetryEvidence {
  const evidenceKeyVersion = process.env.TELEMETRY_EVIDENCE_KEY_VERSION
  const evidenceKey = process.env.TELEMETRY_EVIDENCE_COMMITMENT_KEY
  const actorKeyVersion = protectedActorKeyVersion()
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'schema_version',
      'source_sha',
      'query_version',
      'event_schema_version',
      'actor_key_version',
      'generated_at_utc',
      'commitment_scheme',
      'evidence_key_version',
      'metric_window_manifest_commitment',
      'window_start_utc',
      'window_end_utc',
      'eligible_census_commitment',
      'censoring_policy_version',
      'censoring_status_commitment',
      'completeness',
      'metrics',
      'status',
      'evidence_digest',
    ]) ||
    value.schema_version !== TELEMETRY_EVIDENCE_SCHEMA_VERSION ||
    value.query_version !== TELEMETRY_QUERY_VERSION ||
    value.event_schema_version !== TELEMETRY_EVENT_SCHEMA_VERSION ||
    value.actor_key_version !== actorKeyVersion ||
    value.commitment_scheme !== TELEMETRY_COMMITMENT_SCHEME ||
    value.evidence_key_version !== evidenceKeyVersion ||
    value.censoring_policy_version !== 'right-censor-worst-case/v1' ||
    typeof evidenceKey !== 'string' ||
    !protectedEnvironmentCommitmentKeysAreDistinct() ||
    typeof value.source_sha !== 'string' ||
    !SHA_PATTERN.test(value.source_sha) ||
    typeof value.generated_at_utc !== 'string' ||
    typeof value.window_start_utc !== 'string' ||
    typeof value.window_end_utc !== 'string' ||
    parseUtc(value.generated_at_utc) === null ||
    parseUtc(value.window_start_utc) === null ||
    parseUtc(value.window_end_utc) === null ||
    parseUtc(value.window_start_utc)! >= parseUtc(value.window_end_utc)! ||
    typeof value.metric_window_manifest_commitment !== 'string' ||
    typeof value.eligible_census_commitment !== 'string' ||
    typeof value.censoring_status_commitment !== 'string' ||
    typeof value.evidence_digest !== 'string' ||
    !SHA256_PATTERN.test(value.metric_window_manifest_commitment) ||
    !SHA256_PATTERN.test(value.eligible_census_commitment) ||
    !SHA256_PATTERN.test(value.censoring_status_commitment) ||
    !SHA256_PATTERN.test(value.evidence_digest) ||
    !Array.isArray(value.completeness) ||
    !Array.isArray(value.metrics) ||
    value.completeness.length !== SOURCES.length ||
    value.metrics.length !== TELEMETRY_REQUIRED_METRIC_IDS.length ||
    new Set(value.completeness.map((item) => (isRecord(item) ? item.source : undefined))).size !==
      SOURCES.length ||
    new Set(value.metrics.map((item) => (isRecord(item) ? item.metric_id : undefined))).size !==
      TELEMETRY_REQUIRED_METRIC_IDS.length ||
    value.completeness.some((item) => !validCompletenessResult(item as never)) ||
    value.metrics.some((item) => !validMetricResult(item as never)) ||
    !includes(METRIC_STATUSES, value.status)
  ) {
    return false
  }
  try {
    const { evidence_digest: _digest, ...unsignedEvidence } = value
    const expected = Buffer.from(evidenceDigest(unsignedEvidence, evidenceKey), 'hex')
    const received = Buffer.from(String(value.evidence_digest), 'hex')
    return expected.length === received.length && timingSafeEqual(expected, received)
  } catch {
    return false
  }
}
