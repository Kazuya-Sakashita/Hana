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
export const TELEMETRY_EVIDENCE_SCHEMA_VERSION = 'hana-telemetry-evidence/v2' as const
export const TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION =
  'hana-telemetry-expectation-manifest/v4' as const
export const TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION =
  'hana-telemetry-authority-registration/v2' as const
export const TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION =
  'hana-telemetry-authority-registry-receipt/v1' as const
export const TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION = 'hana-telemetry-ingest-receipt/v1' as const
export const TELEMETRY_QUERY_VERSION = 'issue-188-v1' as const
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
  'authoritative_event_universe',
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
const TELEMETRY_COMMITMENT_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_KEY_MIN_LENGTH = 32
const TELEMETRY_SAMPLING_DOMAIN = 'hana-telemetry-stable-sampling/v3\0'
const TELEMETRY_SAMPLING_KEY_COMMITMENT_DOMAIN = 'hana-telemetry-sampling-key-commitment/v1\0'
const TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_DOMAIN = 'hana-telemetry-authority-registry-receipt/v1\0'
const TELEMETRY_INGEST_RECEIPT_DOMAIN = 'hana-telemetry-ingest-receipt/v1\0'
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
    | 'DELIVERY_REJECTED'
    | 'AUTH_BOUNDARY'
    | 'UNKNOWN'
  sampling_policy_version: typeof TELEMETRY_SAMPLING_POLICY_VERSION
  sampling_key_version: string
  sampling_key_commitment: string
  query_version: typeof TELEMETRY_QUERY_VERSION
  authority_key_version: string
  authority_commitment: string
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
  eligible_events: readonly TelemetryAuthorityEvent[]
}

export type TelemetryAuthorityEvent = {
  event_id: string
  operation: TelemetryOperation
  flow_id: string | null
  actor: SyntheticActorRef | null
  occurred_at_utc: string
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
  received_at_utc: string
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
  received_receipts: readonly TelemetryIngestReceipt[]
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
      'eligible_events',
    ]) ||
    registration.schema_version !== TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION ||
    registration.query_version !== TELEMETRY_QUERY_VERSION ||
    registration.source !== input.source ||
    registration.window_start_utc !== input.window_start_utc ||
    registration.window_end_utc !== input.window_end_utc ||
    !ACTOR_KEY_VERSION_PATTERN.test(registration.authority_key_version) ||
    registration.sampling_policy_version !== TELEMETRY_SAMPLING_POLICY_VERSION ||
    !SHA256_PATTERN.test(registration.sampling_key_commitment) ||
    (registration.expected_actor !== null &&
      (!validSyntheticActorRef(registration.expected_actor) ||
        registration.expected_actor.actor_key_version !== input.actor_key_version)) ||
    (registration.source === 'funnel' && registration.expected_actor === null) ||
    !Array.isArray(registration.eligible_events) ||
    registration.eligible_events.length === 0 ||
    registration.eligible_events.some((event) => {
      if (
        !isRecord(event) ||
        !hasExactKeys(event, ['event_id', 'operation', 'flow_id', 'actor', 'occurred_at_utc']) ||
        typeof event.event_id !== 'string' ||
        canonicalizeBareUuid(event.event_id) !== event.event_id ||
        !includes(OPERATIONS, event.operation) ||
        telemetrySourceForOperation(event.operation) !== registration.source ||
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
      const windowStart = parseUtc(registration.window_start_utc)
      const windowEnd = parseUtc(registration.window_end_utc)
      return (
        occurredAt === null ||
        windowStart === null ||
        windowEnd === null ||
        occurredAt < windowStart ||
        occurredAt >= windowEnd ||
        (registration.source === 'funnel' && (event.flow_id === null || event.actor === null)) ||
        (registration.expected_actor !== null &&
          !sameSyntheticActor(
            event.actor as SyntheticActorRef | null | undefined,
            registration.expected_actor,
          ))
      )
    }) ||
    new Set(registration.eligible_events.map((event) => event.event_id)).size !==
      registration.eligible_events.length
  ) {
    return false
  }
  const registeredEventIds = registration.eligible_events.map((event) => event.event_id)
  return (
    input.manifest.query_version === registration.query_version &&
    input.manifest.authority_key_version === registration.authority_key_version &&
    input.manifest.sampling_policy_version === registration.sampling_policy_version &&
    input.manifest.sampling_key_version === registration.sampling_key_version &&
    input.manifest.sampling_key_commitment === registration.sampling_key_commitment &&
    input.manifest.expected_event_ids.length === registeredEventIds.length &&
    input.manifest.expected_event_ids.every(
      (eventId, index) => canonicalizeBareUuid(eventId) === registeredEventIds[index],
    )
  )
}

function configuredCommitmentKeys(
  input: TelemetryCompletenessInput,
): readonly (string | undefined)[] {
  return [
    input.commitment_key,
    process.env.TELEMETRY_AUTHORITY_COMMITMENT_KEY,
    process.env.TELEMETRY_SAMPLING_COMMITMENT_KEY,
    process.env.TELEMETRY_AUTHORITY_REGISTRY_COMMITMENT_KEY,
    process.env.TELEMETRY_INGEST_RECEIPT_COMMITMENT_KEY,
  ]
}

function protectedCommitmentKeysAreDistinct(input: TelemetryCompletenessInput): boolean {
  const keys = configuredCommitmentKeys(input)
  return (
    keys.every(
      (key) =>
        typeof key === 'string' &&
        Buffer.byteLength(key, 'utf8') >= TELEMETRY_COMMITMENT_KEY_MIN_LENGTH,
    ) &&
    new Set(keys).size === keys.length &&
    (input.sampling_key === null || !keys.includes(input.sampling_key))
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
        'received_at_utc',
        'receipt_key_version',
        'receipt_commitment',
      ]) ||
      rawReceipt.schema_version !== TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION ||
      typeof rawReceipt.event_id !== 'string' ||
      typeof rawReceipt.received_at_utc !== 'string' ||
      typeof rawReceipt.receipt_key_version !== 'string' ||
      typeof rawReceipt.receipt_commitment !== 'string' ||
      canonicalizeBareUuid(rawReceipt.event_id) !== rawReceipt.event_id ||
      rawReceipt.receipt_key_version !== configuredVersion ||
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
    if (receivedAt === null || occurredAt === null || receivedAt < occurredAt) {
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
  if (
    !validExpectationManifest(manifest, input.source) ||
    !validAuthorityRegistration(input) ||
    !validAuthorityCommitment(input) ||
    !validAuthorityRegistryReceipt(input) ||
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
    input.authority_registration.eligible_events.map((event) => [event.event_id, event]),
  )
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
  idempotency_key: string
  actor: SyntheticActorRef
  created_at_utc: string
}

export type SyntheticProfileMemoryTruth = Pick<SyntheticMemoryTruth, 'actor' | 'created_at_utc'>

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
    input.completeness_input.authority_registration.eligible_events.map((event) => [
      event.event_id,
      event,
    ]),
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
    input.completeness_input.authority_registration.eligible_events.map((event) => [
      event.event_id,
      event,
    ]),
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
const FUNNEL_CORRELATION_REASONS = [
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
] as const satisfies readonly TelemetryMetricReason[]

const METRIC_REASON_ALLOWLIST = {
  M1: CENSORED_RATE_REASONS,
  M2: [...CENSORED_RATE_REASONS, ...FUNNEL_CORRELATION_REASONS],
  M3: [...CENSORED_RATE_REASONS, ...FUNNEL_CORRELATION_REASONS],
  M4: ['unsupported_metric_direction'],
  M5: CENSORED_RATE_REASONS,
  M6: CENSORED_RATE_REASONS,
  M7: CENSORED_RATE_REASONS,
  M8: [...CENSORED_RATE_REASONS, 'target_not_configured'],
  M9: [...CENSORED_RATE_REASONS, ...FUNNEL_CORRELATION_REASONS, 'target_not_configured'],
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
    input.metrics.length < TELEMETRY_REQUIRED_METRIC_IDS.length ||
    new Set(input.completeness.map((item) => item.source)).size !== input.completeness.length ||
    SOURCES.some((source) => !input.completeness.some((item) => item.source === source)) ||
    input.completeness.some((item) => !validCompletenessResult(item)) ||
    new Set(input.metrics.map((metric) => metric.metric_id)).size !== input.metrics.length ||
    TELEMETRY_REQUIRED_METRIC_IDS.some(
      (metricId) => !input.metrics.some((metric) => metric.metric_id === metricId),
    ) ||
    input.metrics.some((metric) => !validMetricResult(metric))
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
