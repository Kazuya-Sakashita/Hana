import { createHmac } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyTelemetrySuppression,
  buildTelemetryEvidence,
  createTelemetryBaselineEvidenceReceiptCommitment,
  createTelemetryCommitment,
  createTelemetryAuthorityRegistrationCommitment,
  createTelemetryAuthorityRegistryReceiptCommitment,
  createTelemetryExpectationManifestCommitment,
  createTelemetryIngestReceiptCommitment,
  createTelemetrySamplingKeyCommitment,
  createTelemetryTargetDecisionCommitment,
  evaluateCensoredRate,
  evaluateSyntheticFunnelFlow as evaluateSyntheticFunnelFlowContract,
  evaluateSyntheticM9ViewToMemory as evaluateSyntheticM9ViewToMemoryContract,
  evaluateTelemetryCompleteness,
  createTelemetryEnvelopeDigest,
  createTelemetryEventUniverseCommitment,
  createTelemetryMemorySetDigest,
  createTelemetryMemoryTruthReceiptCommitment,
  NORTH_STAR_CONTRACT,
  parseTelemetryEnvelope,
  shouldSampleTelemetry,
  TELEMETRY_ACCESS_POLICY,
  TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION,
  TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION,
  TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION,
  TELEMETRY_COMMITMENT_SCHEME,
  TELEMETRY_EVENT_SCHEMA_VERSION,
  TELEMETRY_EVIDENCE_SCHEMA_VERSION,
  TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION,
  TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION,
  TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
  TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_MEMORY_TRUTH_RECEIPT_SCHEMA_VERSION,
  TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION,
  TELEMETRY_QUERY_VERSION,
  TELEMETRY_REQUIRED_METRIC_IDS,
  TELEMETRY_RETENTION_DAYS,
  TELEMETRY_SAMPLING,
  TELEMETRY_SAMPLING_POLICY_VERSION,
  TELEMETRY_TARGET_DECISION_SCHEMA_VERSION,
  type SyntheticActorRef,
  type SyntheticFunnelEvent,
  type SyntheticMemoryTruth,
  type SyntheticProfileMemoryTruth,
  type TelemetryAuthorityRegistration,
  type TelemetryAuthorityRegistryReceipt,
  type TelemetryBaselineEvidenceReceipt,
  type TelemetryCompletenessResult,
  type TelemetryCompletenessInput,
  type TelemetryEnvelope,
  type TelemetryExpectationManifest,
  type TelemetryEventUniverse,
  type TelemetryIngestReceipt,
  type TelemetryMemoryTruthReceipt,
  type TelemetryMetricResult,
  type TelemetrySource,
  type TelemetryTargetDecision,
} from '@/features/metrics/server/telemetry-contract'

function uuidV7ForMinute(minute: string, suffix: string): string {
  const timestamp = Date.parse(minute).toString(16).padStart(12, '0')
  return `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7000-8000-${suffix}`
}

const EVENT_A = '00000000-0000-4000-8000-000000000001'
const EVENT_B = uuidV7ForMinute('2026-08-07T00:00:00Z', '000000000002')
const EVENT_C = '00000000-0000-4000-8000-000000000003'
const EVENT_D = '00000000-0000-4000-8000-000000000004'
const FLOW_ID = '00000000-0000-4000-8000-000000000010'
const COMMITMENT_KEY = 'synthetic-commitment-key-32-bytes-minimum'
const AUTHORITY_KEY = 'synthetic-authority-key-32-bytes-minimum'
const AUTHORITY_KEY_VERSION = 'synthetic-authority-v1'
const MANIFEST_KEY = 'synthetic-manifest-key-with-32-bytes-minimum'
const MANIFEST_KEY_VERSION = 'synthetic-manifest-v1'
const UNIVERSE_KEY = 'synthetic-universe-key-with-32-bytes-minimum'
const UNIVERSE_KEY_VERSION = 'synthetic-universe-v1'
const SAMPLING_COMMITMENT_KEY = 'synthetic-sampling-commitment-key-32-bytes'
const REGISTRY_KEY = 'synthetic-registry-key-with-32-bytes-minimum'
const REGISTRY_KEY_VERSION = 'synthetic-registry-v1'
const INGEST_RECEIPT_KEY = 'synthetic-ingest-receipt-key-32-bytes'
const INGEST_RECEIPT_KEY_VERSION = 'synthetic-ingest-v1'
const MEMORY_TRUTH_KEY = 'synthetic-memory-truth-key-32-bytes-minimum'
const MEMORY_TRUTH_KEY_VERSION = 'synthetic-memory-truth-v1'
const TARGET_DECISION_KEY = 'synthetic-target-decision-key-32-bytes-minimum'
const TARGET_DECISION_KEY_VERSION = 'synthetic-target-v1'
const EVIDENCE_KEY = 'synthetic-evidence-key-with-32-bytes-minimum'
const EVIDENCE_KEY_VERSION = 'synthetic-evidence-v1'
const SAMPLING_KEY = 'synthetic-sampling-key-with-32-bytes-minimum'
const SAMPLING_KEY_VERSION = 'synthetic-v1'
const ACTOR_KEY_VERSION = 'v2'
const ACTOR_A: SyntheticActorRef = {
  actor_key_version: ACTOR_KEY_VERSION,
  actor_token: 'a'.repeat(64),
}
const ACTOR_B: SyntheticActorRef = {
  actor_key_version: ACTOR_KEY_VERSION,
  actor_token: 'b'.repeat(64),
}
const ACTOR_A_OLD_KEY: SyntheticActorRef = {
  actor_key_version: 'v1',
  actor_token: 'c'.repeat(64),
}

beforeEach(() => {
  vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', ACTOR_KEY_VERSION)
  vi.stubEnv('TELEMETRY_AUTHORITY_KEY_VERSION', AUTHORITY_KEY_VERSION)
  vi.stubEnv('TELEMETRY_AUTHORITY_COMMITMENT_KEY', AUTHORITY_KEY)
  vi.stubEnv('TELEMETRY_MANIFEST_KEY_VERSION', MANIFEST_KEY_VERSION)
  vi.stubEnv('TELEMETRY_MANIFEST_COMMITMENT_KEY', MANIFEST_KEY)
  vi.stubEnv('TELEMETRY_EVENT_UNIVERSE_KEY_VERSION', UNIVERSE_KEY_VERSION)
  vi.stubEnv('TELEMETRY_EVENT_UNIVERSE_COMMITMENT_KEY', UNIVERSE_KEY)
  vi.stubEnv('TELEMETRY_SAMPLING_COMMITMENT_KEY', SAMPLING_COMMITMENT_KEY)
  vi.stubEnv('TELEMETRY_AUTHORITY_REGISTRY_KEY_VERSION', REGISTRY_KEY_VERSION)
  vi.stubEnv('TELEMETRY_AUTHORITY_REGISTRY_COMMITMENT_KEY', REGISTRY_KEY)
  vi.stubEnv('TELEMETRY_INGEST_RECEIPT_KEY_VERSION', INGEST_RECEIPT_KEY_VERSION)
  vi.stubEnv('TELEMETRY_INGEST_RECEIPT_COMMITMENT_KEY', INGEST_RECEIPT_KEY)
  vi.stubEnv('TELEMETRY_MEMORY_TRUTH_KEY_VERSION', MEMORY_TRUTH_KEY_VERSION)
  vi.stubEnv('TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY', MEMORY_TRUTH_KEY)
  vi.stubEnv('TELEMETRY_TARGET_DECISION_KEY_VERSION', TARGET_DECISION_KEY_VERSION)
  vi.stubEnv('TELEMETRY_TARGET_DECISION_COMMITMENT_KEY', TARGET_DECISION_KEY)
  vi.stubEnv('TELEMETRY_EVIDENCE_KEY_VERSION', EVIDENCE_KEY_VERSION)
  vi.stubEnv('TELEMETRY_EVIDENCE_COMMITMENT_KEY', EVIDENCE_KEY)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

function envelope(
  eventId: string,
  operation: TelemetryEnvelope['dimensions']['operation'],
  occurredAtUtc = '2026-08-07T00:00:00Z',
) {
  const noDuration = operation === 'record_started' || operation === 'memory_viewed'
  return parseTelemetryEnvelope({
    schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    event_id: eventId,
    occurred_at_utc: occurredAtUtc,
    dimensions: {
      operation,
      reason: operation === 'api_request' ? 'validation_error' : 'stage_observed',
      route_group: operation === 'memory_viewed' ? 'memory' : 'record',
      status: operation === 'api_request' ? 'client_error' : 'success',
      duration_bucket:
        operation === 'api_request'
          ? 'from_100_to_500ms'
          : noDuration
            ? 'not_applicable'
            : 'under_10s',
    },
  })
}

function sourceEnvelope(source: TelemetrySource, eventId: string): TelemetryEnvelope {
  if (source === 'funnel') return envelope(eventId, 'record_started')
  if (source === 'api') return envelope(eventId, 'api_request')
  if (source === 'web_vital') {
    return parseTelemetryEnvelope({
      schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
      event_id: eventId,
      occurred_at_utc: '2026-08-07T00:00:00Z',
      dimensions: {
        operation: 'web_vital_lcp',
        reason: 'not_applicable',
        route_group: 'record',
        status: 'good',
        duration_bucket: 'from_1001_to_2500ms',
      },
    })
  }
  return parseTelemetryEnvelope({
    schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    event_id: eventId,
    occurred_at_utc: '2026-08-07T00:00:00Z',
    dimensions: {
      operation: 'ai_generation',
      reason: 'none',
      route_group: 'ai',
      status: 'success',
      duration_bucket: 'under_10s',
    },
  })
}

function samplingFor(source: TelemetrySource) {
  return TELEMETRY_SAMPLING[source] === 1
    ? { key_version: 'none', key: null }
    : { key_version: SAMPLING_KEY_VERSION, key: SAMPLING_KEY }
}

function authorityRegistration(
  source: TelemetrySource,
  eligibleEventIds: readonly string[],
  overrides: Partial<TelemetryAuthorityRegistration> = {},
): TelemetryAuthorityRegistration {
  const eligibleOperations = [
    ...new Set(
      eligibleEventIds.map((eventId) => sourceEnvelope(source, eventId).dimensions.operation),
    ),
  ]
  const sampling = samplingFor(source)
  const expectedActor = overrides.expected_actor === undefined ? ACTOR_A : overrides.expected_actor
  return {
    schema_version: TELEMETRY_AUTHORITY_REGISTRATION_SCHEMA_VERSION,
    query_version: TELEMETRY_QUERY_VERSION,
    source,
    expected_actor: expectedActor,
    window_start_utc: '2026-08-07T00:00:00Z',
    window_end_utc: '2026-08-08T00:00:00Z',
    authority_key_version: AUTHORITY_KEY_VERSION,
    sampling_policy_version: TELEMETRY_SAMPLING_POLICY_VERSION,
    sampling_key_version: sampling.key_version,
    sampling_key_commitment: createTelemetrySamplingKeyCommitment({
      source,
      sampling_key_version: sampling.key_version,
      sampling_key: sampling.key,
      commitment_key: SAMPLING_COMMITMENT_KEY,
    }),
    eligibility_policy_version: 'source-operation-actor-window/v1',
    eligible_operations: eligibleOperations,
    cohort_rule: expectedActor === null ? 'all_actors' : 'expected_actor_only',
    exclusion_rule: 'pre_registered_actor_allowlist',
    exclusion_policy_version: 'synthetic-allowlist-v1',
    exclusion_policy_commitment: 'e'.repeat(64),
    ...overrides,
  }
}

function manifest(
  expectedEventIds: readonly string[],
  overrides: Partial<TelemetryExpectationManifest> = {},
): TelemetryExpectationManifest {
  const source = overrides.source ?? 'funnel'
  const sampling = samplingFor(source)
  const registration = authorityRegistration(source, expectedEventIds)
  return {
    schema_version: TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
    source,
    status: 'PASS',
    degradation: 'NONE',
    sampling_policy_version: TELEMETRY_SAMPLING_POLICY_VERSION,
    sampling_key_version: sampling.key_version,
    sampling_key_commitment: createTelemetrySamplingKeyCommitment({
      source,
      sampling_key_version: sampling.key_version,
      sampling_key: sampling.key,
      commitment_key: SAMPLING_COMMITMENT_KEY,
    }),
    query_version: TELEMETRY_QUERY_VERSION,
    authority_key_version: AUTHORITY_KEY_VERSION,
    authority_commitment: createTelemetryAuthorityRegistrationCommitment({
      registration,
      commitment_key: AUTHORITY_KEY,
    }),
    universe_key_version: UNIVERSE_KEY_VERSION,
    universe_commitment: '0'.repeat(64),
    universe_cutoff_utc: '2026-08-08T00:00:00Z',
    manifest_key_version: MANIFEST_KEY_VERSION,
    expected_event_ids: expectedEventIds,
    ...overrides,
  }
}

function completenessInput(
  source: TelemetrySource,
  expectation: TelemetryExpectationManifest,
  received: readonly TelemetryEnvelope[],
  overrides: Partial<TelemetryCompletenessInput> = {},
): TelemetryCompletenessInput {
  const {
    manifest_commitment: suppliedCommitment,
    authority_registration: suppliedAuthority,
    authority_registry_receipt: suppliedRegistryReceipt,
    event_universe: suppliedUniverse,
    received_receipts: suppliedReceivedReceipts,
    ...boundaryOverrides
  } = overrides
  const sampling = samplingFor(source)
  const unsignedBoundary = {
    source,
    received,
    window_start_utc: '2026-08-07T00:00:00Z',
    window_end_utc: '2026-08-08T00:00:00Z',
    actor_key_version: 'v2',
    sampling_key_version: sampling.key_version,
    sampling_key: sampling.key,
    ...boundaryOverrides,
  }
  const eligibleEvents = expectation.expected_event_ids.map((eventId) => {
    const canonicalEventId = eventId.toLowerCase()
    const event =
      received.find((candidate) => candidate.event_id === canonicalEventId) ??
      sourceEnvelope(source, eventId)
    const occurredAt = Date.parse(event.occurred_at_utc)
    const windowStart = Date.parse(unsignedBoundary.window_start_utc)
    const windowEnd = Date.parse(unsignedBoundary.window_end_utc)
    const authoritativeOccurrence =
      Number.isFinite(occurredAt) && occurredAt >= windowStart && occurredAt < windowEnd
        ? event.occurred_at_utc
        : sourceEnvelope(source, eventId).occurred_at_utc
    return {
      event_id: canonicalEventId,
      operation: event.dimensions.operation,
      flow_id: source === 'funnel' ? FLOW_ID : null,
      actor: source === 'funnel' ? ACTOR_A : null,
      occurred_at_utc: authoritativeOccurrence,
    }
  })
  eligibleEvents.sort((left, right) => {
    const occurrenceDifference =
      Date.parse(left.occurred_at_utc) - Date.parse(right.occurred_at_utc)
    return occurrenceDifference === 0
      ? left.event_id.localeCompare(right.event_id)
      : occurrenceDifference
  })
  const registration =
    suppliedAuthority ??
    authorityRegistration(source, expectation.expected_event_ids, {
      window_start_utc: unsignedBoundary.window_start_utc,
      window_end_utc: unsignedBoundary.window_end_utc,
      eligible_operations: [...new Set(eligibleEvents.map((event) => event.operation))],
    })
  const registrationCommitment = createTelemetryAuthorityRegistrationCommitment({
    registration,
    commitment_key: AUTHORITY_KEY,
  })
  const unsignedUniverse = {
    schema_version: TELEMETRY_EVENT_UNIVERSE_SCHEMA_VERSION,
    query_version: TELEMETRY_QUERY_VERSION,
    source,
    window_start_utc: unsignedBoundary.window_start_utc,
    window_end_utc: unsignedBoundary.window_end_utc,
    cutoff_utc: unsignedBoundary.window_end_utc,
    sealed_at_utc: new Date(Date.parse(unsignedBoundary.window_end_utc) + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .replace('.000Z', 'Z'),
    registration_commitment: registrationCommitment,
    universe_key_version: UNIVERSE_KEY_VERSION,
    eligible_events: eligibleEvents.map((event) => ({
      ...event,
      actor: registration.expected_actor,
    })),
  }
  const universe: TelemetryEventUniverse = suppliedUniverse ?? {
    ...unsignedUniverse,
    universe_commitment: createTelemetryEventUniverseCommitment({
      universe: unsignedUniverse,
      commitment_key: UNIVERSE_KEY,
    }),
  }
  const boundExpectation = {
    ...expectation,
    authority_commitment: registrationCommitment,
    universe_key_version: universe.universe_key_version,
    universe_commitment: universe.universe_commitment,
    universe_cutoff_utc: universe.cutoff_utc,
    manifest_key_version: MANIFEST_KEY_VERSION,
    expected_event_ids: universe.eligible_events.map((event) => event.event_id),
  }
  const manifestValue = (
    Object.prototype.hasOwnProperty.call(boundaryOverrides, 'manifest')
      ? boundaryOverrides.manifest
      : boundExpectation
  ) as TelemetryExpectationManifest
  const receiptContext = {
    source,
    query_version: TELEMETRY_QUERY_VERSION,
    window_start_utc: unsignedBoundary.window_start_utc,
    window_end_utc: unsignedBoundary.window_end_utc,
    registration_commitment: manifestValue?.authority_commitment ?? registrationCommitment,
    universe_commitment: manifestValue?.universe_commitment ?? universe.universe_commitment,
  }
  const boundary = {
    ...unsignedBoundary,
    manifest: manifestValue,
    authority_registration: registration,
    authority_registry_receipt:
      suppliedRegistryReceipt ?? authorityRegistryReceipt(boundExpectation.authority_commitment),
    event_universe: universe,
    received_receipts: suppliedReceivedReceipts ?? [
      ...new Map(
        [...received].reverse().map((event) => [
          event.event_id,
          ingestReceiptFor(event, receiptContext, {
            received_at_utc: new Date(Date.parse(event.occurred_at_utc) + 20 * 60 * 1000)
              .toISOString()
              .replace('.000Z', 'Z'),
          }),
        ]),
      ).values(),
    ],
  }
  return {
    ...boundary,
    manifest_commitment:
      suppliedCommitment ??
      createTelemetryExpectationManifestCommitment({
        ...boundary,
        manifest: boundary.manifest ?? expectation,
        commitment_key: MANIFEST_KEY,
      }),
  }
}

function authorityRegistryReceipt(
  registrationCommitment: string,
  overrides: Partial<TelemetryAuthorityRegistryReceipt> = {},
): TelemetryAuthorityRegistryReceipt {
  const { registry_commitment: suppliedCommitment, ...unsignedOverrides } = overrides
  const unsigned = {
    schema_version: TELEMETRY_AUTHORITY_REGISTRY_RECEIPT_SCHEMA_VERSION,
    receipt_id: '00000000-0000-4000-8000-000000000099',
    registered_at_utc: '2026-08-06T23:59:59Z',
    registration_commitment: registrationCommitment,
    registry_key_version: REGISTRY_KEY_VERSION,
    ...unsignedOverrides,
  }
  return {
    ...unsigned,
    registry_commitment:
      suppliedCommitment ??
      createTelemetryAuthorityRegistryReceiptCommitment({
        receipt: unsigned,
        commitment_key: REGISTRY_KEY,
      }),
  }
}

function ingestReceiptFor(
  event: TelemetryEnvelope,
  context: Pick<
    TelemetryIngestReceipt,
    | 'source'
    | 'query_version'
    | 'window_start_utc'
    | 'window_end_utc'
    | 'registration_commitment'
    | 'universe_commitment'
  >,
  overrides: Partial<TelemetryIngestReceipt> = {},
): TelemetryIngestReceipt {
  const { receipt_commitment: suppliedCommitment, ...unsignedOverrides } = overrides
  const unsigned = {
    schema_version: TELEMETRY_INGEST_RECEIPT_SCHEMA_VERSION,
    event_id: event.event_id,
    envelope_digest: createTelemetryEnvelopeDigest(event),
    received_at_utc: new Date(Date.parse(event.occurred_at_utc) + 20 * 60 * 1000)
      .toISOString()
      .replace('.000Z', 'Z'),
    receipt_key_version: INGEST_RECEIPT_KEY_VERSION,
    ...context,
    ...unsignedOverrides,
  }
  return {
    ...unsigned,
    receipt_commitment:
      suppliedCommitment ??
      createTelemetryIngestReceiptCommitment({
        receipt: unsigned,
        commitment_key: INGEST_RECEIPT_KEY,
      }),
  }
}

function withSignedReceivedAt(
  input: TelemetryCompletenessInput,
  eventId: string,
  receivedAtUtc: string,
): TelemetryCompletenessInput {
  const event = input.received.find((candidate) => candidate.event_id === eventId)!
  return {
    ...input,
    received_receipts: input.received_receipts.map((receipt) =>
      receipt.event_id === eventId
        ? ingestReceiptFor(
            event,
            {
              source: receipt.source,
              query_version: receipt.query_version,
              window_start_utc: receipt.window_start_utc,
              window_end_utc: receipt.window_end_utc,
              registration_commitment: receipt.registration_commitment,
              universe_commitment: receipt.universe_commitment,
            },
            { received_at_utc: receivedAtUtc },
          )
        : receipt,
    ),
  }
}

function withResignedEventUniverse(
  input: TelemetryCompletenessInput,
  overrides: Partial<Pick<TelemetryEventUniverse, 'cutoff_utc' | 'sealed_at_utc'>>,
): TelemetryCompletenessInput {
  const { universe_commitment: _universeCommitment, ...currentUnsignedUniverse } =
    input.event_universe
  const unsignedUniverse = { ...currentUnsignedUniverse, ...overrides }
  const eventUniverse = {
    ...unsignedUniverse,
    universe_commitment: createTelemetryEventUniverseCommitment({
      universe: unsignedUniverse,
      commitment_key: UNIVERSE_KEY,
    }),
  }
  const manifestValue = {
    ...input.manifest,
    universe_commitment: eventUniverse.universe_commitment,
    universe_cutoff_utc: eventUniverse.cutoff_utc,
  }
  const receivedReceipts = input.received_receipts.map((receipt) => {
    const { receipt_commitment: _receiptCommitment, ...unsignedReceipt } = receipt
    const reboundReceipt = {
      ...unsignedReceipt,
      universe_commitment: eventUniverse.universe_commitment,
    }
    return {
      ...reboundReceipt,
      receipt_commitment: createTelemetryIngestReceiptCommitment({
        receipt: reboundReceipt,
        commitment_key: INGEST_RECEIPT_KEY,
      }),
    }
  })
  const boundary = {
    ...input,
    manifest: manifestValue,
    event_universe: eventUniverse,
    received_receipts: receivedReceipts,
  }
  return {
    ...boundary,
    manifest_commitment: createTelemetryExpectationManifestCommitment({
      ...boundary,
      commitment_key: MANIFEST_KEY,
    }),
  }
}

function ingestReceiptForInput(
  input: TelemetryCompletenessInput,
  event: TelemetryEnvelope,
  overrides: Partial<TelemetryIngestReceipt> = {},
): TelemetryIngestReceipt {
  return ingestReceiptFor(
    event,
    {
      source: input.source,
      query_version: TELEMETRY_QUERY_VERSION,
      window_start_utc: input.window_start_utc,
      window_end_utc: input.window_end_utc,
      registration_commitment: input.manifest.authority_commitment,
      universe_commitment: input.manifest.universe_commitment,
    },
    overrides,
  )
}

function complete(source: TelemetrySource, eventId: string): TelemetryCompletenessResult {
  return evaluateTelemetryCompleteness(
    completenessInput(source, manifest([eventId], { source }), [sourceEnvelope(source, eventId)]),
  )
}

const FIXED_SAMPLING_EVENT_IDS = {
  web_vital: {
    sampled: '10000000-0000-4000-8000-000000000003',
    excluded: '10000000-0000-4000-8000-000000000001',
  },
  api: {
    sampled: '10000000-0000-4000-8000-000000000007',
    excluded: '10000000-0000-4000-8000-000000000001',
  },
} as const

function sampledEventId(source: 'web_vital' | 'api', sampled: boolean): string {
  return FIXED_SAMPLING_EVENT_IDS[source][sampled ? 'sampled' : 'excluded']
}

function funnelEvent(overrides: Partial<SyntheticFunnelEvent> = {}): SyntheticFunnelEvent {
  return {
    event_id: EVENT_B,
    flow_id: FLOW_ID,
    actor: ACTOR_A,
    event_name: 'photo_selected',
    occurred_minute_utc: '2026-08-07T00:00:00Z',
    received_at_utc: '2026-08-07T00:20:00Z',
    anchor_trust: 'verified',
    ...overrides,
  }
}

function memoryTruth(overrides: Partial<SyntheticMemoryTruth> = {}): SyntheticMemoryTruth {
  return {
    memory_id: '00000000-0000-4000-8000-000000000020',
    idempotency_key: FLOW_ID,
    actor: ACTOR_A,
    created_at_utc: '2026-08-07T00:20:00Z',
    ...overrides,
  }
}

function viewedEvent(overrides: Partial<SyntheticFunnelEvent> = {}): SyntheticFunnelEvent {
  return {
    event_id: EVENT_B,
    flow_id: FLOW_ID,
    actor: ACTOR_A,
    event_name: 'memory_viewed',
    occurred_minute_utc: '2026-08-07T00:00:00Z',
    received_at_utc: '2026-08-07T00:20:00Z',
    anchor_trust: 'verified',
    ...overrides,
  }
}

function profileMemory(
  overrides: Partial<SyntheticProfileMemoryTruth> = {},
): SyntheticProfileMemoryTruth {
  return {
    memory_id: '00000000-0000-4000-8000-000000000021',
    actor: ACTOR_A,
    created_at_utc: '2026-08-13T23:59:59Z',
    ...overrides,
  }
}

function memoryTruthReceiptFor(input: {
  metric_id: 'M2' | 'M3' | 'M9'
  expected_actor: SyntheticActorRef
  generated_at_utc: string
  completeness_input: TelemetryCompletenessInput
  memories: readonly (SyntheticMemoryTruth | SyntheticProfileMemoryTruth)[]
}): TelemetryMemoryTruthReceipt {
  const unsigned = {
    schema_version: TELEMETRY_MEMORY_TRUTH_RECEIPT_SCHEMA_VERSION,
    metric_id: input.metric_id,
    actor: input.expected_actor,
    generated_at_utc: input.generated_at_utc,
    window_start_utc: input.completeness_input.window_start_utc,
    window_end_utc: input.completeness_input.window_end_utc,
    registration_commitment: input.completeness_input.manifest.authority_commitment,
    universe_commitment: input.completeness_input.manifest.universe_commitment,
    memory_set_digest: createTelemetryMemorySetDigest(input.memories),
    record_count: input.memories.length,
    receipt_key_version: MEMORY_TRUTH_KEY_VERSION,
  }
  return {
    ...unsigned,
    receipt_commitment: createTelemetryMemoryTruthReceiptCommitment({
      receipt: unsigned,
      commitment_key: MEMORY_TRUTH_KEY,
    }),
  }
}

function evaluateSyntheticFunnelFlow(
  input: Omit<Parameters<typeof evaluateSyntheticFunnelFlowContract>[0], 'memory_truth_receipt'> & {
    memory_truth_receipt?: TelemetryMemoryTruthReceipt
  },
) {
  return evaluateSyntheticFunnelFlowContract({
    ...input,
    memory_truth_receipt:
      input.memory_truth_receipt ?? memoryTruthReceiptFor({ ...input, metric_id: input.metric_id }),
  })
}

function evaluateSyntheticM9ViewToMemory(
  input: Omit<
    Parameters<typeof evaluateSyntheticM9ViewToMemoryContract>[0],
    'memory_truth_receipt'
  > & {
    memory_truth_receipt?: TelemetryMemoryTruthReceipt
  },
) {
  return evaluateSyntheticM9ViewToMemoryContract({
    ...input,
    memory_truth_receipt:
      input.memory_truth_receipt ?? memoryTruthReceiptFor({ ...input, metric_id: 'M9' }),
  })
}

function fourSourceCompleteness(): TelemetryCompletenessResult[] {
  const ids: Record<TelemetrySource, string> = {
    funnel: EVENT_A,
    web_vital: sampledEventId('web_vital', true),
    api: sampledEventId('api', true),
    ai: EVENT_D,
  }
  return (['funnel', 'web_vital', 'api', 'ai'] as const).map((source) =>
    complete(source, ids[source]),
  )
}

function requiredMetricResults(): TelemetryMetricResult[] {
  return [
    { metric_id: 'M1', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M3', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M4', status: 'HOLD', reason: 'unsupported_metric_direction' },
    { metric_id: 'M5', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M6', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M7', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M8', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M9', status: 'PASS', reason: 'worst_case_passed' },
    { metric_id: 'M10', status: 'HOLD', reason: 'unsupported_metric_direction' },
    { metric_id: 'M11', status: 'HOLD', reason: 'unsupported_metric_direction' },
    { metric_id: 'M12', status: 'HOLD', reason: 'unsupported_metric_direction' },
  ]
}

function replaceMetric(
  metrics: readonly TelemetryMetricResult[],
  replacement: TelemetryMetricResult,
): TelemetryMetricResult[] {
  return metrics.some((metric) => metric.metric_id === replacement.metric_id)
    ? metrics.map((metric) => (metric.metric_id === replacement.metric_id ? replacement : metric))
    : [...metrics, replacement]
}

function evidenceInput() {
  const windowStart = '2026-08-01T00:00:00Z'
  const windowEnd = '2026-09-01T00:00:00Z'
  const censusMetrics = TELEMETRY_REQUIRED_METRIC_IDS.map((metricId) => ({
    metric_id: metricId,
    eligible: 23,
    distinct_profiles: ['M2', 'M3', 'M7'].includes(metricId) ? 20 : null,
    distinct_eligible_units: ['M2', 'M3', 'M7'].includes(metricId) ? 23 : null,
  }))
  return {
    source_sha: 'a'.repeat(40),
    window_start_utc: windowStart,
    window_end_utc: windowEnd,
    generated_at_utc: '2026-10-03T00:00:00Z',
    metric_window_manifest: {
      schema_version: TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION,
      query_version: TELEMETRY_QUERY_VERSION,
      contract_version: '2026-08-08.1' as const,
      metric_policy_version: 'immutable-metric-policy/v2' as const,
      actor_key_version: ACTOR_KEY_VERSION,
      cohort_role: 'evaluation' as const,
      window_start_utc: windowStart,
      window_end_utc: windowEnd,
      metric_ids: TELEMETRY_REQUIRED_METRIC_IDS,
      metric_windows: metricWindowEntries(),
      target_decisions: [protectedTargetDecision('M8'), protectedTargetDecision('M9')],
    },
    eligible_census: {
      schema_version: TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION,
      query_version: TELEMETRY_QUERY_VERSION,
      census_policy_version: 'distinct-profile-and-unit/v1' as const,
      window_start_utc: windowStart,
      window_end_utc: windowEnd,
      metrics: censusMetrics,
    },
    censoring_status: {
      schema_version: TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION,
      query_version: TELEMETRY_QUERY_VERSION,
      censoring_policy_version: 'right-censor-worst-case/v1' as const,
      window_start_utc: windowStart,
      window_end_utc: windowEnd,
      metrics: TELEMETRY_REQUIRED_METRIC_IDS.map((metricId) => ({
        metric_id: metricId,
        succeeded: 20,
        censored: 2,
      })),
    },
    completeness: fourSourceCompleteness(),
    metrics: requiredMetricResults(),
  }
}

function metricWindowEntries() {
  const common = {
    entry_window_start_utc: '2026-08-01T00:00:00Z',
    entry_window_end_utc: '2026-09-01T00:00:00Z',
  }
  return [
    {
      metric_id: 'M1',
      anchor: 'profile_created_at',
      entry_rule: 'anchor_in_half_open_window',
      maturity_rule: 'anchor_plus_24_hours',
      maturity_cutoff_utc: '2026-09-02T00:00:00Z',
      ...common,
    },
    {
      metric_id: 'M2',
      anchor: 'photo_selected_occurrence_minute',
      entry_rule: 'full_occurrence_minute_in_half_open_window',
      maturity_rule: 'occurrence_minute_end_plus_30_minutes',
      maturity_cutoff_utc: '2026-09-01T00:30:00Z',
      ...common,
    },
    {
      metric_id: 'M3',
      anchor: 'ai_draft_shown_occurrence_minute',
      entry_rule: 'full_occurrence_minute_in_half_open_window',
      maturity_rule: 'occurrence_minute_end_plus_30_minutes',
      maturity_cutoff_utc: '2026-09-01T00:30:00Z',
      ...common,
    },
    {
      metric_id: 'M4',
      anchor: 'pilot_first_attempt_interactive_screen_presented_at',
      entry_rule: 'first_attempt_anchor_in_half_open_window',
      maturity_rule: 'db_save_confirmed_or_terminal_outcome_classified',
      maturity_cutoff_utc: null,
      ...common,
    },
    {
      metric_id: 'M5',
      anchor: 'profile_created_at',
      entry_rule: 'anchor_in_half_open_window',
      maturity_rule: 'anchor_plus_8_days',
      maturity_cutoff_utc: '2026-09-09T00:00:00Z',
      ...common,
    },
    {
      metric_id: 'M6',
      anchor: 'profile_created_at',
      entry_rule: 'anchor_in_half_open_window',
      maturity_rule: 'anchor_plus_31_days',
      maturity_cutoff_utc: '2026-10-02T00:00:00Z',
      ...common,
    },
    {
      metric_id: 'M7',
      anchor: 'utc_week_start',
      entry_rule: 'whole_utc_week_in_half_open_window',
      entry_window_start_utc: '2026-08-03T00:00:00Z',
      entry_window_end_utc: '2026-08-31T00:00:00Z',
      maturity_rule: 'utc_week_end',
      maturity_cutoff_utc: '2026-08-31T00:00:00Z',
    },
    {
      metric_id: 'M8',
      anchor: 'utc_calendar_month_start',
      entry_rule: 'whole_utc_calendar_month_in_half_open_window',
      maturity_rule: 'next_utc_calendar_month_start',
      maturity_cutoff_utc: '2026-09-01T00:00:00Z',
      ...common,
    },
    {
      metric_id: 'M9',
      anchor: 'first_eligible_memory_viewed_occurrence_minute_per_profile',
      entry_rule: 'full_occurrence_minute_in_half_open_window',
      maturity_rule: 'occurrence_minute_end_plus_7_days',
      maturity_cutoff_utc: '2026-09-08T00:00:00Z',
      ...common,
    },
  ] as const
}

function baselineEvidenceReceipt(
  metricId: 'M8' | 'M9',
  overrides: Partial<TelemetryBaselineEvidenceReceipt> = {},
): TelemetryBaselineEvidenceReceipt {
  const { receipt_commitment: suppliedCommitment, ...unsignedOverrides } = overrides
  const unsigned = {
    schema_version: TELEMETRY_BASELINE_EVIDENCE_RECEIPT_SCHEMA_VERSION,
    evidence_schema_version: TELEMETRY_EVIDENCE_SCHEMA_VERSION,
    query_version: TELEMETRY_QUERY_VERSION,
    metric_id: metricId,
    cohort_role: 'baseline' as const,
    actor_key_version: ACTOR_KEY_VERSION,
    window_start_utc: '2026-06-01T00:00:00Z',
    window_end_utc: '2026-07-01T00:00:00Z',
    generated_at_utc: '2026-07-01T00:00:00Z',
    evidence_digest: 'd'.repeat(64),
    metric_status: 'HOLD' as const,
    metric_reason: 'baseline_only' as const,
    evidence_key_version: EVIDENCE_KEY_VERSION,
    ...unsignedOverrides,
  }
  return {
    ...unsigned,
    receipt_commitment:
      suppliedCommitment ??
      createTelemetryBaselineEvidenceReceiptCommitment({
        receipt: unsigned,
        commitment_key: EVIDENCE_KEY,
      }),
  }
}

function protectedTargetDecision(
  metricId: 'M8' | 'M9',
  overrides: Partial<TelemetryTargetDecision> = {},
): TelemetryTargetDecision {
  const { target_commitment: suppliedCommitment, ...unsignedOverrides } = overrides
  const unsigned = {
    schema_version: TELEMETRY_TARGET_DECISION_SCHEMA_VERSION,
    policy_version: 'protected-baseline-target/v2' as const,
    metric_id: metricId,
    target: 0.5,
    direction: 'at_or_above' as const,
    baseline_evidence_receipt: baselineEvidenceReceipt(metricId),
    target_fixed_at_utc: '2026-07-02T00:00:00Z',
    evaluation_window_start_utc: '2026-08-01T00:00:00Z',
    evaluation_window_end_utc: '2026-09-01T00:00:00Z',
    remeasurement_deadline_utc: '2026-10-03T00:00:00Z',
    cohort_role: 'evaluation' as const,
    target_key_version: TARGET_DECISION_KEY_VERSION,
    ...unsignedOverrides,
  }
  return {
    ...unsigned,
    target_commitment:
      suppliedCommitment ??
      createTelemetryTargetDecisionCommitment({
        decision: unsigned,
        commitment_key: TARGET_DECISION_KEY,
      }),
  }
}

describe('PII-safe telemetry schema v2', () => {
  it('accepts only the versioned envelope and five allowlisted dimensions', () => {
    expect(envelope(EVENT_A, 'api_request')).toEqual({
      schema_version: 'hana-telemetry-event/v2',
      event_id: EVENT_A,
      occurred_at_utc: '2026-08-07T00:00:00Z',
      dimensions: {
        operation: 'api_request',
        reason: 'validation_error',
        route_group: 'record',
        status: 'client_error',
        duration_bucket: 'from_100_to_500ms',
      },
    })
  })

  it.each(['email', 'request_body', 'storage_key', 'prompt', 'actor_hash'])(
    'rejects a forbidden or unknown %s field',
    (field) => {
      const valid = envelope(EVENT_A, 'api_request')
      expect(() => parseTelemetryEnvelope({ ...valid, [field]: 'blocked' })).toThrow(
        'unknown_field',
      )
      expect(() =>
        parseTelemetryEnvelope({
          ...valid,
          dimensions: { ...valid.dimensions, [field]: 'blocked' },
        }),
      ).toThrow('unknown_field')
    },
  )

  it('fixes retention, sampling and cardinality to code allowlists', () => {
    expect(TELEMETRY_QUERY_VERSION).toBe('issue-191-v1')
    expect(TELEMETRY_RETENTION_DAYS).toBe(90)
    expect(TELEMETRY_SAMPLING).toEqual({ funnel: 1, web_vital: 0.1, api: 0.1, ai: 1 })
    expect(() =>
      parseTelemetryEnvelope({
        ...envelope(EVENT_A, 'api_request'),
        dimensions: {
          ...envelope(EVENT_A, 'api_request').dimensions,
          route_group: '/memory/00000000-0000-4000-8000-000000000099',
        },
      }),
    ).toThrow('unknown_value')
    expect(shouldSampleTelemetry('funnel', EVENT_A, samplingFor('funnel'))).toBe(true)
    expect(
      shouldSampleTelemetry(
        'web_vital',
        sampledEventId('web_vital', true),
        samplingFor('web_vital'),
      ),
    ).toBe(true)
  })

  it('rejects an allowlisted value used in an invalid source combination', () => {
    expect(() =>
      parseTelemetryEnvelope({
        ...envelope(EVENT_A, 'api_request'),
        dimensions: {
          ...envelope(EVENT_A, 'api_request').dimensions,
          reason: 'stage_observed',
        },
      }),
    ).toThrow('unknown_value')
    expect(() =>
      parseTelemetryEnvelope({
        schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
        event_id: EVENT_A,
        occurred_at_utc: '2026-08-07T00:00:00Z',
        dimensions: {
          operation: 'web_vital_lcp',
          reason: 'not_applicable',
          route_group: 'record',
          status: 'poor',
          duration_bucket: 'from_1001_to_2500ms',
        },
      }),
    ).toThrow('unknown_value')
  })

  it.each(['metrics', 'account', 'ai'] as const)(
    'rejects the global route group %s for Web Vitals',
    (routeGroup) => {
      const valid = sourceEnvelope('web_vital', sampledEventId('web_vital', true))
      expect(() =>
        parseTelemetryEnvelope({
          ...valid,
          dimensions: { ...valid.dimensions, route_group: routeGroup },
        }),
      ).toThrow('unknown_value')
    },
  )

  it.each(['public', 'auth', 'home', 'record', 'memory', 'settings', 'other_private'] as const)(
    'accepts the Web Vitals route group %s',
    (routeGroup) => {
      const valid = sourceEnvelope('web_vital', sampledEventId('web_vital', true))
      expect(
        parseTelemetryEnvelope({
          ...valid,
          dimensions: { ...valid.dimensions, route_group: routeGroup },
        }).dimensions.route_group,
      ).toBe(routeGroup)
    },
  )

  it.each(['2026-02-30T00:00:00Z', '2026-08-07T24:00:00Z'])(
    'rejects a non-canonical calendar timestamp %s',
    (occurredAt) => {
      expect(() =>
        parseTelemetryEnvelope({
          ...envelope(EVENT_A, 'api_request'),
          occurred_at_utc: occurredAt,
        }),
      ).toThrow('invalid_input')
    },
  )

  it('separates ingest, retention and aggregate reader authorities', () => {
    expect(TELEMETRY_ACCESS_POLICY).toEqual({
      ingest: ['deduplicate', 'rate_limit', 'insert'],
      retention: ['delete_expired'],
      aggregate_reader: ['read_versioned_window'],
    })
    expect(TELEMETRY_ACCESS_POLICY.ingest).not.toContain('delete_expired')
    expect(TELEMETRY_ACCESS_POLICY.retention).not.toContain('read_versioned_window')
  })
})

describe('telemetry completeness manifest and sampling', () => {
  it('matches independently precomputed HMAC sampling vectors', () => {
    const vectors = [
      {
        source: 'web_vital' as const,
        eventId: FIXED_SAMPLING_EVENT_IDS.web_vital.sampled,
        digest: '18e2c20c5c0e29d52067f4cc9cf78ab0487158696d4a2835861819d1fe815506',
        sampled: true,
      },
      {
        source: 'web_vital' as const,
        eventId: FIXED_SAMPLING_EVENT_IDS.web_vital.excluded,
        digest: 'dfadcb7c628c8f2c06e262850a033bd67e60c32549b933afb27973c9e4c52750',
        sampled: false,
      },
      {
        source: 'api' as const,
        eventId: FIXED_SAMPLING_EVENT_IDS.api.sampled,
        digest: '0dfdd1671af1fc9ada85c04d60890540de2c1aed6b36ea8236bb1b4a51cc55f0',
        sampled: true,
      },
      {
        source: 'api' as const,
        eventId: FIXED_SAMPLING_EVENT_IDS.api.excluded,
        digest: '3e053a35fe371fe445be224e8e2f8dc9a28dd6a01dbf11a66084671630f72035',
        sampled: false,
      },
    ]

    for (const vector of vectors) {
      const message = Buffer.concat([
        Buffer.from('hana-telemetry-stable-sampling/v3\0'),
        Buffer.from(vector.source),
        Buffer.from('\0'),
        Buffer.from(SAMPLING_KEY_VERSION),
        Buffer.from('\0'),
        Buffer.from(vector.eventId),
      ])
      const digest = createHmac('sha256', SAMPLING_KEY).update(message).digest('hex')
      expect(digest).toBe(vector.digest)
      const first32Bits = Number.parseInt(digest.slice(0, 8), 16)
      const tenPercentThreshold = Math.floor(0.1 * 0x1_0000_0000)
      expect(first32Bits < tenPercentThreshold).toBe(vector.sampled)
      expect(shouldSampleTelemetry(vector.source, vector.eventId, samplingFor(vector.source))).toBe(
        vector.sampled,
      )
    }
  })

  it('canonicalizes UUID case before sampling and completeness comparison', () => {
    const lowercase = 'abcdefab-cdef-9999-7000-000000000004'
    const uppercase = lowercase.toUpperCase()
    expect(shouldSampleTelemetry('web_vital', lowercase, samplingFor('web_vital'))).toBe(true)
    expect(shouldSampleTelemetry('web_vital', uppercase, samplingFor('web_vital'))).toBe(
      shouldSampleTelemetry('web_vital', lowercase, samplingFor('web_vital')),
    )
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('web_vital', manifest([uppercase], { source: 'web_vital' }), [
          sourceEnvelope('web_vital', uppercase),
        ]),
      ),
    ).toMatchObject({ status: 'PASS', reason: 'complete' })
    expect(sourceEnvelope('web_vital', uppercase).event_id).toBe(lowercase)
  })

  it('rejects a manifest with UUIDs that collide after case canonicalization', () => {
    const lowercase = 'abcdefab-cdef-9999-7000-000000000004'
    expect(
      evaluateTelemetryCompleteness(
        completenessInput(
          'web_vital',
          manifest([lowercase, lowercase.toUpperCase()], { source: 'web_vital' }),
          [sourceEnvelope('web_vital', lowercase)],
        ),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('detects duplicate and reorder without turning a complete set into loss', () => {
    const input = completenessInput('funnel', manifest([EVENT_A, EVENT_B, EVENT_C]), [
      envelope(EVENT_B, 'photo_selected'),
      envelope(EVENT_A, 'record_started'),
      envelope(EVENT_B, 'photo_selected'),
      envelope(EVENT_C, 'memory_saved'),
    ])
    const signedOrder = withSignedReceivedAt(
      withSignedReceivedAt(
        withSignedReceivedAt(input, EVENT_B, '2026-08-07T00:20:00Z'),
        EVENT_A,
        '2026-08-07T00:21:00Z',
      ),
      EVENT_C,
      '2026-08-07T00:22:00Z',
    )
    expect(evaluateTelemetryCompleteness(signedOrder)).toEqual({
      source: 'funnel',
      status: 'PASS',
      reason: 'complete',
      duplicate: 'DETECTED',
      reorder: 'DETECTED',
    })
  })

  it('holds on silent loss or unexpected events', () => {
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A, EVENT_B]), [
          envelope(EVENT_A, 'record_started'),
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A]), [
          envelope(EVENT_A, 'record_started'),
          envelope(EVENT_C, 'memory_saved'),
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })
  })

  it('holds when the expectation manifest is missing, untrusted, degraded or version-skewed', () => {
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A]), [], { manifest: undefined as never }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_missing' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A], { status: 'HOLD' }), []),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness(completenessInput('api', manifest([EVENT_A]), [])),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A], { degradation: 'TTL_EXPIRED' }), []),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_degraded' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput(
          'funnel',
          {
            ...manifest([EVENT_A]),
            sampling_policy_version: 'stable-event-id/v1',
          } as never,
          [],
        ),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'sampling_policy_mismatch' })
    expect(
      evaluateTelemetryCompleteness(completenessInput('funnel', manifest([]), [])),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A]), [envelope(EVENT_A, 'record_started')], {
          manifest_commitment: '0'.repeat(64),
        }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', { ...manifest([EVENT_A]), unexpected: 'blocked' } as never, [
          envelope(EVENT_A, 'record_started'),
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('binds sampled expectations to the runtime sampling key version and secret', () => {
    const sampledIn = sampledEventId('web_vital', true)
    const expectation = manifest([sampledIn], { source: 'web_vital' })
    const received = [sourceEnvelope('web_vital', sampledIn)]

    expect(
      evaluateTelemetryCompleteness(
        completenessInput('web_vital', expectation, received, {
          sampling_key_version: 'rotated-v2',
        }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'sampling_policy_mismatch' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('web_vital', expectation, received, { sampling_key: null }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'sampling_policy_mismatch' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('web_vital', expectation, received, {
          sampling_key: 'different-sampling-key-with-32-bytes-minimum',
        }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'sampling_policy_mismatch' })
  })

  it('rejects malformed, out-of-window and conflicting duplicate receipts', () => {
    const expectation = manifest([EVENT_A])
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', expectation, [] as never, { received: {} as never }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', expectation, [
          { ...envelope(EVENT_A, 'record_started'), email: 'blocked@example.invalid' } as never,
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', expectation, [
          {
            ...envelope(EVENT_A, 'record_started'),
            occurred_at_utc: '2026-02-30T00:00:00Z',
          },
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', expectation, [
          { ...envelope(EVENT_A, 'record_started'), occurred_at_utc: '2026-08-08T00:00:00Z' },
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'received_event_outside_window' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', expectation, [
          envelope(EVENT_A, 'record_started'),
          envelope(EVENT_A, 'photo_selected'),
        ]),
      ),
    ).toMatchObject({
      status: 'HOLD',
      reason: 'duplicate_conflict',
      duplicate: 'DETECTED',
    })
  })

  it('applies stable sampling before comparing expected and received ids', () => {
    const sampledIn = sampledEventId('api', true)
    const sampledOut = sampledEventId('api', false)
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('api', manifest([sampledIn, sampledOut], { source: 'api' }), [
          sourceEnvelope('api', sampledIn),
        ]),
      ),
    ).toMatchObject({ status: 'PASS', reason: 'complete' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('api', manifest([sampledIn, sampledOut], { source: 'api' }), []),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('api', manifest([sampledIn, sampledOut], { source: 'api' }), [
          sourceEnvelope('api', sampledIn),
          sourceEnvelope('api', sampledOut),
        ]),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })
  })

  it('requires an independently signed actor, query, window and full eligible universe', () => {
    const fullRegistration = authorityRegistration('funnel', [EVENT_A, EVENT_B], {
      eligible_operations: ['record_started'],
    })
    const fullInput = completenessInput(
      'funnel',
      manifest([EVENT_A, EVENT_B]),
      [envelope(EVENT_A, 'record_started'), envelope(EVENT_B, 'record_started')],
      { authority_registration: fullRegistration },
    )
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_B]), [envelope(EVENT_B, 'record_started')], {
          authority_registration: fullRegistration,
          event_universe: fullInput.event_universe,
        }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })

    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    const tamperedActor = {
      ...valid,
      authority_registration: {
        ...valid.authority_registration,
        expected_actor: ACTOR_B,
      },
    }
    expect(evaluateTelemetryCompleteness(tamperedActor)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })

    const oldQueryRegistration = authorityRegistration('funnel', [EVENT_A], {
      query_version: 'issue-187-v1' as never,
    })
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A]), [envelope(EVENT_A, 'record_started')], {
          authority_registration: oldQueryRegistration,
        }),
      ),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('binds operation, occurrence, flow and actor scope to the protected authority tuple', () => {
    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    const changedOperation = envelope(EVENT_A, 'photo_selected')
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        received: [changedOperation],
        received_receipts: [ingestReceiptForInput(valid, changedOperation)],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })

    const changedOccurrence = envelope(EVENT_A, 'record_started', '2026-08-07T00:01:00Z')
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        received: [changedOccurrence],
        received_receipts: [ingestReceiptForInput(valid, changedOccurrence)],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })

    for (const invalidRegistration of [
      authorityRegistration('funnel', [EVENT_A], {
        eligible_operations: ['api_request'],
      }),
      authorityRegistration('funnel', [EVENT_A], {
        cohort_rule: 'all_actors',
      }),
      authorityRegistration('funnel', [EVENT_A], {
        exclusion_rule: 'caller_defined' as never,
      }),
      authorityRegistration('funnel', [EVENT_A], {
        exclusion_policy_version: 'INVALID',
      }),
      authorityRegistration('funnel', [EVENT_A], {
        exclusion_policy_commitment: 'not-a-commitment',
      }),
      authorityRegistration('funnel', [EVENT_A], {
        expected_actor: null,
      }),
    ]) {
      expect(
        evaluateTelemetryCompleteness(
          completenessInput('funnel', manifest([EVENT_A]), [envelope(EVENT_A, 'record_started')], {
            authority_registration: invalidRegistration,
          }),
        ),
      ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    }
  })

  it('requires an independently signed registry receipt created before the window', () => {
    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        authority_registry_receipt: authorityRegistryReceipt(valid.manifest.authority_commitment, {
          registered_at_utc: valid.window_start_utc,
        }),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        authority_registry_receipt: {
          ...valid.authority_registry_receipt,
          receipt_id: '00000000-0000-4000-8000-000000000098',
        },
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        authority_registry_receipt: {
          ...valid.authority_registry_receipt,
          registration_commitment: '0'.repeat(64),
        },
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('prevents a caller-signed manifest from substituting protected sampling configuration', () => {
    const sampledIn = sampledEventId('web_vital', true)
    const valid = completenessInput('web_vital', manifest([sampledIn], { source: 'web_vital' }), [
      sourceEnvelope('web_vital', sampledIn),
    ])
    const substitutedKey = 'caller-substituted-sampling-key-32-bytes'
    const substitutedManifest = {
      ...valid.manifest,
      sampling_key_version: 'caller-v2',
      sampling_key_commitment: createTelemetrySamplingKeyCommitment({
        source: 'web_vital',
        sampling_key_version: 'caller-v2',
        sampling_key: substitutedKey,
        commitment_key: SAMPLING_COMMITMENT_KEY,
      }),
    }
    const substituted = {
      ...valid,
      manifest: substitutedManifest,
      sampling_key_version: 'caller-v2',
      sampling_key: substitutedKey,
      manifest_commitment: createTelemetryExpectationManifestCommitment({
        ...valid,
        manifest: substitutedManifest,
        commitment_key: COMMITMENT_KEY,
      }),
    }
    expect(evaluateTelemetryCompleteness(substituted)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })

    vi.stubEnv('TELEMETRY_SAMPLING_COMMITMENT_KEY', COMMITMENT_KEY)
    expect(evaluateTelemetryCompleteness(valid)).toMatchObject({
      status: 'HOLD',
      reason: 'sampling_policy_mismatch',
    })
  })

  it('does not let a caller erase a signed degradation with an arbitrary manifest key', () => {
    const degraded = completenessInput(
      'funnel',
      manifest([EVENT_A], { degradation: 'STORAGE_UNAVAILABLE' }),
      [envelope(EVENT_A, 'record_started')],
    )
    expect(evaluateTelemetryCompleteness(degraded)).toMatchObject({
      status: 'HOLD',
      reason: 'telemetry_degraded',
    })
    const substitutedManifest = { ...degraded.manifest, degradation: 'NONE' as const }
    expect(
      evaluateTelemetryCompleteness({
        ...degraded,
        manifest: substitutedManifest,
        manifest_commitment: createTelemetryExpectationManifestCommitment({
          manifest: substitutedManifest,
          window_start_utc: degraded.window_start_utc,
          window_end_utc: degraded.window_end_utc,
          actor_key_version: degraded.actor_key_version,
          commitment_key: COMMITMENT_KEY,
        }),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('separates the pre-window policy from the post-window sealed event universe', () => {
    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    expect(evaluateTelemetryCompleteness(valid)).toMatchObject({
      status: 'PASS',
      reason: 'complete',
    })
    expect(valid.authority_registration).not.toHaveProperty('eligible_events')
    expect(Date.parse(valid.authority_registry_receipt.registered_at_utc)).toBeLessThan(
      Date.parse(valid.window_start_utc),
    )
    expect(Date.parse(valid.event_universe.sealed_at_utc)).toBeGreaterThanOrEqual(
      Date.parse(valid.event_universe.cutoff_utc),
    )
    const exactBoundary = withResignedEventUniverse(valid, {
      sealed_at_utc: valid.event_universe.cutoff_utc,
    })
    expect(evaluateTelemetryCompleteness(exactBoundary)).toMatchObject({
      status: 'PASS',
      reason: 'complete',
    })
    const cutoffMismatch = withResignedEventUniverse(valid, {
      cutoff_utc: valid.window_start_utc,
    })
    expect(evaluateTelemetryCompleteness(cutoffMismatch)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
    const sealedBeforeCutoff = withResignedEventUniverse(valid, {
      sealed_at_utc: '2026-08-07T23:59:59.999Z',
    })
    expect(evaluateTelemetryCompleteness(sealedBeforeCutoff)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
  })

  it('binds completeness to the protected actor key version', () => {
    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    expect(evaluateTelemetryCompleteness(valid)).toMatchObject({ status: 'PASS' })
    vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', 'v3')
    expect(evaluateTelemetryCompleteness(valid)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
    vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', ACTOR_KEY_VERSION)
    const callerVersion = { ...valid, actor_key_version: 'child_profile_123' }
    expect(
      evaluateTelemetryCompleteness({
        ...callerVersion,
        manifest_commitment: createTelemetryExpectationManifestCommitment({
          ...callerVersion,
          commitment_key: MANIFEST_KEY,
        }),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
  })

  it('uses signed receipt time for ordering and fails closed on ties', () => {
    const original = completenessInput('funnel', manifest([EVENT_A, EVENT_C]), [
      envelope(EVENT_A, 'record_started'),
      envelope(EVENT_C, 'memory_saved'),
    ])
    const signed = withSignedReceivedAt(
      withSignedReceivedAt(original, EVENT_A, '2026-08-07T00:20:00Z'),
      EVENT_C,
      '2026-08-07T00:21:00Z',
    )
    const reversedCallerArray = { ...signed, received: [...signed.received].reverse() }
    expect(evaluateTelemetryCompleteness(signed)).toMatchObject({
      status: 'PASS',
      reorder: 'NONE',
    })
    expect(evaluateTelemetryCompleteness(reversedCallerArray)).toEqual(
      evaluateTelemetryCompleteness(signed),
    )
    const tied = withSignedReceivedAt(signed, EVENT_C, '2026-08-07T00:20:00Z')
    expect(evaluateTelemetryCompleteness(tied)).toMatchObject({
      status: 'HOLD',
      reason: 'received_order_ambiguous',
    })
  })

  it('requires one protected ingest receipt per received event and rejects receipt tampering', () => {
    const valid = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    expect(evaluateTelemetryCompleteness({ ...valid, received_receipts: [] })).toMatchObject({
      status: 'HOLD',
      reason: 'received_envelope_invalid',
    })
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        received_receipts: [
          {
            ...valid.received_receipts[0]!,
            received_at_utc: '2026-08-07T00:21:00Z',
          },
        ],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        received_receipts: [
          {
            ...valid.received_receipts[0]!,
            receipt_key_version: 'other-v1',
          },
        ],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
    const mutatedEnvelope = envelope(EVENT_A, 'photo_selected')
    expect(evaluateTelemetryCompleteness({ ...valid, received: [mutatedEnvelope] })).toMatchObject({
      status: 'HOLD',
      reason: 'received_envelope_invalid',
    })
    const otherContext = completenessInput('funnel', manifest([EVENT_A]), [mutatedEnvelope])
    expect(
      evaluateTelemetryCompleteness({
        ...valid,
        received_receipts: otherContext.received_receipts,
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'received_envelope_invalid' })
  })

  it('fails closed when the protected authority key is missing, mismatched or reused', () => {
    const input = completenessInput('funnel', manifest([EVENT_A]), [
      envelope(EVENT_A, 'record_started'),
    ])
    vi.stubEnv('TELEMETRY_AUTHORITY_COMMITMENT_KEY', '')
    expect(evaluateTelemetryCompleteness(input)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
    vi.stubEnv('TELEMETRY_AUTHORITY_COMMITMENT_KEY', AUTHORITY_KEY)
    vi.stubEnv('TELEMETRY_AUTHORITY_KEY_VERSION', 'unknown-v1')
    expect(evaluateTelemetryCompleteness(input)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
    vi.stubEnv('TELEMETRY_AUTHORITY_KEY_VERSION', AUTHORITY_KEY_VERSION)
    vi.stubEnv('TELEMETRY_AUTHORITY_COMMITMENT_KEY', COMMITMENT_KEY)
    expect(evaluateTelemetryCompleteness(input)).toMatchObject({
      status: 'HOLD',
      reason: 'expected_manifest_untrusted',
    })
  })
})

describe('actor-scoped funnel DB truth correlation', () => {
  const completeFunnel = completenessInput('funnel', manifest([EVENT_B]), [
    envelope(EVENT_B, 'photo_selected'),
  ])

  it('uses actor, key version and flow while keeping actor data out of the result', () => {
    const result = evaluateSyntheticFunnelFlow({
      metric_id: 'M2',
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness_input: completeFunnel,
      events: [funnelEvent()],
      memories: [memoryTruth()],
    })
    expect(result).toEqual({
      metric_id: 'M2',
      status: 'PASS',
      reason: 'memory_saved_within_window',
    })
    expect(JSON.stringify(result)).not.toContain(ACTOR_A.actor_token)
    expect(result).not.toHaveProperty('actor')
  })

  it('rejects completeness registered for another actor with the same key version', () => {
    const actorBRegistration = authorityRegistration('funnel', [EVENT_B], {
      expected_actor: ACTOR_B,
      eligible_operations: ['photo_selected'],
    })
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completenessInput(
          'funnel',
          manifest([EVENT_B]),
          [envelope(EVENT_B, 'photo_selected')],
          { authority_registration: actorBRegistration },
        ),
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'actor_reference_invalid' })
  })

  it('rejects a caller flow rebind that is absent from the protected authority tuple', () => {
    const reboundFlow = '00000000-0000-4000-8000-000000000011'
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: reboundFlow,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeFunnel,
        events: [funnelEvent({ flow_id: reboundFlow })],
        memories: [memoryTruth({ idempotency_key: reboundFlow })],
      }),
    ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('uses the same generic bare UUID contract and canonical comparison as ingestion', () => {
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID.toUpperCase(),
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeFunnel,
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'PASS', reason: 'memory_saved_within_window' })
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: `urn:uuid:${FLOW_ID}`,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeFunnel,
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'actor_reference_invalid' })
  })

  it('does not attribute another actor or key version memory with the same flow', () => {
    for (const actor of [ACTOR_B, ACTOR_A_OLD_KEY]) {
      expect(
        evaluateSyntheticFunnelFlow({
          metric_id: 'M2',
          flow_id: FLOW_ID,
          expected_actor: ACTOR_A,
          generated_at_utc: '2026-08-07T01:00:00Z',
          completeness_input: completeFunnel,
          events: [funnelEvent()],
          memories: [memoryTruth({ actor })],
        }),
      ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'telemetry_incomplete' })
    }
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completenessInput(
          'funnel',
          manifest([EVENT_B]),
          [envelope(EVENT_B, 'photo_selected')],
          { actor_key_version: 'v3' },
        ),
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'actor_reference_invalid' })
  })

  it.each(['M2', 'M3'] as const)(
    'requires every signed %s Memory row to belong to the expected actor',
    (metricId) => {
      const eventName = metricId === 'M2' ? 'photo_selected' : 'ai_draft_shown'
      const completeInput = completenessInput('funnel', manifest([EVENT_B]), [
        envelope(EVENT_B, eventName),
      ])
      const expectedMemory = memoryTruth()
      const unrelatedSameActor = memoryTruth({
        memory_id: '00000000-0000-4000-8000-000000000022',
        idempotency_key: '00000000-0000-4000-8000-000000000011',
      })
      const base = {
        metric_id: metricId,
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeInput,
        events: [funnelEvent({ event_name: eventName })],
      }
      expect(
        evaluateSyntheticFunnelFlow({
          ...base,
          memories: [expectedMemory, unrelatedSameActor],
        }),
      ).toMatchObject({ status: 'PASS' })
      expect(
        evaluateSyntheticFunnelFlow({
          ...base,
          memories: [expectedMemory, { ...unrelatedSameActor, actor: ACTOR_B }],
        }),
      ).toEqual({ metric_id: metricId, status: 'HOLD', reason: 'telemetry_incomplete' })
    },
  )

  it('holds actor conflicts and stages that were not verified by the same completeness input', () => {
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeFunnel,
        events: [funnelEvent(), funnelEvent({ event_id: EVENT_C, actor: ACTOR_B })],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'actor_reference_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completenessInput('funnel', manifest([EVENT_A]), [
          envelope(EVENT_A, 'record_started'),
        ]),
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('uses the occurrence minute interval instead of delayed receipt time', () => {
    const base = {
      metric_id: 'M2' as const,
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness_input: completeFunnel,
      events: [
        funnelEvent({
          occurred_minute_utc: '2026-08-07T00:00:00Z',
          received_at_utc: '2026-08-07T00:20:00Z',
        }),
      ],
    }
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        memories: [memoryTruth({ created_at_utc: '2026-08-07T00:29:59Z' })],
      }),
    ).toMatchObject({ status: 'PASS', reason: 'memory_saved_within_window' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        memories: [memoryTruth({ created_at_utc: '2026-08-07T00:30:30Z' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_anchor_boundary' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        memories: [memoryTruth({ created_at_utc: '2026-08-07T00:40:00Z' })],
      }),
    ).toMatchObject({ status: 'FAIL', reason: 'memory_saved_after_window' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        generated_at_utc: '2026-08-08T00:00:00Z',
        completeness_input: withSignedReceivedAt(completeFunnel, EVENT_B, '2026-08-07T23:00:00Z'),
        events: [funnelEvent({ received_at_utc: '2026-08-07T23:00:00Z' })],
        memories: [memoryTruth({ created_at_utc: '2026-08-07T00:29:59Z' })],
      }),
    ).toMatchObject({ status: 'PASS', reason: 'memory_saved_within_window' })
  })

  it('holds unverified, invalid, immature or telemetry-incomplete anchors', () => {
    const base = {
      metric_id: 'M2' as const,
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness_input: completeFunnel,
      memories: [memoryTruth()],
    }
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        events: [funnelEvent({ anchor_trust: 'unverified' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_anchor_unverified' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        events: [funnelEvent({ received_at_utc: '2026-08-06T23:59:59Z' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        completeness_input: completenessInput('funnel', manifest([EVENT_C]), [
          envelope(EVENT_C, 'photo_selected'),
        ]),
        events: [funnelEvent({ event_id: EVENT_C })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        events: [funnelEvent({ occurred_minute_utc: '2026-08-07T00:01:00Z' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        generated_at_utc: '2026-08-07T00:10:00Z',
        events: [funnelEvent({ received_at_utc: '2026-08-07T00:20:00Z' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        generated_at_utc: '2026-08-07T00:30:59Z',
        events: [funnelEvent()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'window_not_mature' })
    const partialMinuteCompleteness = completenessInput(
      'funnel',
      manifest([EVENT_B]),
      [envelope(EVENT_B, 'photo_selected')],
      { window_end_utc: '2026-08-07T00:00:30Z' },
    )
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        completeness_input: partialMinuteCompleteness,
        events: [funnelEvent()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        completeness_input: completenessInput('funnel', manifest([EVENT_A, EVENT_B]), [
          envelope(EVENT_A, 'record_started'),
        ]),
        events: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('does not treat missing memory_saved as missing DB save truth', () => {
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        expected_actor: ACTOR_A,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness_input: completeFunnel,
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'PASS' })
  })

  it('requires a protected exact-set DB Memory receipt for M2 and M3', () => {
    const memories = [memoryTruth()]
    const evaluation = {
      metric_id: 'M2' as const,
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness_input: completeFunnel,
      events: [funnelEvent()],
      memories,
    }
    const receipt = memoryTruthReceiptFor(evaluation)
    expect(
      evaluateSyntheticFunnelFlowContract({ ...evaluation, memory_truth_receipt: receipt }),
    ).toMatchObject({ status: 'PASS' })
    expect(
      evaluateSyntheticFunnelFlowContract({
        ...evaluation,
        memories: [],
        memory_truth_receipt: receipt,
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticFunnelFlowContract({
        ...evaluation,
        memories: [...memories, memoryTruth({ memory_id: '00000000-0000-4000-8000-000000000022' })],
        memory_truth_receipt: receipt,
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    vi.stubEnv('TELEMETRY_MEMORY_TRUTH_COMMITMENT_KEY', MANIFEST_KEY)
    expect(
      evaluateSyntheticFunnelFlowContract({ ...evaluation, memory_truth_receipt: receipt }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })
})

describe('M9 occurrence-minute view-to-memory correlation', () => {
  const completeView = completenessInput('funnel', manifest([EVENT_B]), [
    envelope(EVENT_B, 'memory_viewed'),
  ])
  const base = {
    expected_actor: ACTOR_A,
    generated_at_utc: '2026-08-14T00:01:00Z',
    completeness_input: completeView,
    events: [viewedEvent()],
    memories: [profileMemory()],
  }

  it('uses the occurrence-minute interval and not delayed receipt as the seven-day anchor', () => {
    expect(evaluateSyntheticM9ViewToMemory(base)).toEqual({
      metric_id: 'M9',
      status: 'PASS',
      reason: 'memory_saved_within_window',
    })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: withSignedReceivedAt(completeView, EVENT_B, '2026-08-13T12:00:00Z'),
        events: [viewedEvent({ received_at_utc: '2026-08-13T12:00:00Z' })],
      }),
    ).toMatchObject({ status: 'PASS', reason: 'memory_saved_within_window' })
  })

  it('holds until the full occurrence interval plus seven days is mature', () => {
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        generated_at_utc: '2026-08-14T00:00:59Z',
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'window_not_mature' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        memories: [],
      }),
    ).toMatchObject({ status: 'FAIL', reason: 'memory_not_saved' })
  })

  it.each([
    ['2026-08-07T00:00:30Z', 'HOLD', 'event_reordered_after_truth'],
    ['2026-08-13T23:59:59Z', 'PASS', 'memory_saved_within_window'],
    ['2026-08-14T00:00:00Z', 'HOLD', 'stage_anchor_boundary'],
    ['2026-08-14T00:00:59Z', 'HOLD', 'stage_anchor_boundary'],
    ['2026-08-14T00:01:00Z', 'FAIL', 'memory_saved_after_window'],
  ] as const)(
    'evaluates memory at %s with the minute-interval worst case',
    (createdAtUtc, status, reason) => {
      expect(
        evaluateSyntheticM9ViewToMemory({
          ...base,
          memories: [profileMemory({ created_at_utc: createdAtUtc })],
        }),
      ).toMatchObject({ status, reason })
    },
  )

  it('uses the first eligible view for the profile', () => {
    const laterMinute = '2026-08-07T12:00:00Z'
    const laterEventId = uuidV7ForMinute(laterMinute, '000000000011')
    const completeness = completenessInput('funnel', manifest([EVENT_B, laterEventId]), [
      envelope(EVENT_B, 'memory_viewed'),
      envelope(laterEventId, 'memory_viewed', laterMinute),
    ])
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completeness,
        events: [
          viewedEvent({
            event_id: laterEventId,
            occurred_minute_utc: laterMinute,
            received_at_utc: '2026-08-07T12:20:00Z',
          }),
          viewedEvent(),
        ],
        memories: [profileMemory({ created_at_utc: '2026-08-14T00:01:00Z' })],
      }),
    ).toMatchObject({ status: 'FAIL', reason: 'memory_saved_after_window' })
  })

  it('holds when the caller omits the first received eligible view', () => {
    const laterMinute = '2026-08-07T12:00:00Z'
    const laterEventId = uuidV7ForMinute(laterMinute, '000000000011')
    const completeness = completenessInput('funnel', manifest([EVENT_B, laterEventId]), [
      envelope(EVENT_B, 'memory_viewed'),
      envelope(laterEventId, 'memory_viewed', laterMinute),
    ])
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completeness,
        events: [
          viewedEvent({
            event_id: laterEventId,
            occurred_minute_utc: laterMinute,
            received_at_utc: '2026-08-07T12:20:00Z',
          }),
        ],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('holds when the manifest, received data and caller all omit an authoritative early view', () => {
    const laterMinute = '2026-08-07T12:00:00Z'
    const laterEventId = uuidV7ForMinute(laterMinute, '000000000011')
    const fullRegistration = authorityRegistration('funnel', [EVENT_B, laterEventId])
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completenessInput(
          'funnel',
          manifest([laterEventId]),
          [envelope(laterEventId, 'memory_viewed', laterMinute)],
          { authority_registration: fullRegistration },
        ),
        events: [
          viewedEvent({
            event_id: laterEventId,
            occurred_minute_utc: laterMinute,
            received_at_utc: '2026-08-07T12:20:00Z',
          }),
        ],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('holds when an authoritative early view is relabelled before M9 evaluation', () => {
    const laterMinute = '2026-08-07T12:00:00Z'
    const laterEventId = uuidV7ForMinute(laterMinute, '000000000011')
    const authoritative = completenessInput('funnel', manifest([EVENT_B, laterEventId]), [
      envelope(EVENT_B, 'memory_viewed'),
      envelope(laterEventId, 'memory_viewed', laterMinute),
    ])
    const changedFirst = envelope(EVENT_B, 'record_started')
    const relabelled = {
      ...authoritative,
      received: [changedFirst, envelope(laterEventId, 'memory_viewed', laterMinute)],
      received_receipts: authoritative.received_receipts.map((receipt) =>
        receipt.event_id === EVENT_B
          ? ingestReceiptForInput(authoritative, changedFirst, {
              received_at_utc: receipt.received_at_utc,
            })
          : receipt,
      ),
    }

    expect(evaluateTelemetryCompleteness(relabelled)).toMatchObject({
      status: 'HOLD',
      reason: 'unexpected_event',
    })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: relabelled,
        events: [
          viewedEvent(),
          viewedEvent({
            event_id: laterEventId,
            occurred_minute_utc: laterMinute,
            received_at_utc: '2026-08-07T12:20:00Z',
          }),
        ],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('holds on excess or duplicate supplied and received view IDs', () => {
    const laterMinute = '2026-08-07T12:00:00Z'
    const laterEventId = uuidV7ForMinute(laterMinute, '000000000011')
    const laterView = viewedEvent({
      event_id: laterEventId,
      occurred_minute_utc: laterMinute,
      received_at_utc: '2026-08-07T12:20:00Z',
    })
    expect(
      evaluateSyntheticM9ViewToMemory({ ...base, events: [viewedEvent(), laterView] }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticM9ViewToMemory({ ...base, events: [viewedEvent(), viewedEvent()] }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completenessInput('funnel', manifest([EVENT_B]), [
          envelope(EVENT_B, 'memory_viewed'),
          envelope(EVENT_B, 'memory_viewed'),
        ]),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })

  it('holds unverified, actor-mismatched, incomplete and invalid occurrence anchors', () => {
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        events: [viewedEvent({ anchor_trust: 'unverified' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_anchor_unverified' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        events: [viewedEvent({ actor: ACTOR_B })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'actor_reference_invalid' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        memories: [profileMemory({ actor: ACTOR_B })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        expected_actor: ACTOR_A_OLD_KEY,
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'actor_reference_invalid' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completenessInput('funnel', manifest([EVENT_B]), []),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        events: [viewedEvent({ occurred_minute_utc: '2026-08-07T00:01:00Z' })],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
  })

  it('requires the complete occurrence minute to be inside the entry window', () => {
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completenessInput(
          'funnel',
          manifest([EVENT_B]),
          [envelope(EVENT_B, 'memory_viewed')],
          { window_start_utc: '2026-08-07T00:00:01Z' },
        ),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticM9ViewToMemory({
        ...base,
        completeness_input: completenessInput(
          'funnel',
          manifest([EVENT_B]),
          [envelope(EVENT_B, 'memory_viewed')],
          { window_end_utc: '2026-08-07T00:00:30Z' },
        ),
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'stage_time_invalid' })
  })

  it('requires the signed M9 DB Memory set to match exactly', () => {
    const receipt = memoryTruthReceiptFor({ ...base, metric_id: 'M9' })
    expect(
      evaluateSyntheticM9ViewToMemoryContract({ ...base, memory_truth_receipt: receipt }),
    ).toMatchObject({ status: 'PASS' })
    expect(
      evaluateSyntheticM9ViewToMemoryContract({
        ...base,
        memories: [],
        memory_truth_receipt: receipt,
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
  })
})

describe('privacy aggregation', () => {
  function rateInput(
    metricId: TelemetryMetricResult['metric_id'],
    overrides: Record<string, unknown> = {},
  ) {
    const requiresDistinct = ['M2', 'M3', 'M7'].includes(metricId)
    const requiresTarget = metricId === 'M8' || metricId === 'M9'
    return {
      metric_id: metricId,
      eligible: 20,
      succeeded: 20,
      censored: 0,
      distinct_profiles: requiresDistinct ? 20 : null,
      distinct_eligible_units: requiresDistinct ? 20 : null,
      evaluation_window_start_utc: requiresTarget ? '2026-08-01T00:00:00Z' : null,
      evaluation_window_end_utc: requiresTarget ? '2026-09-01T00:00:00Z' : null,
      generated_at_utc: '2026-10-03T00:00:00Z',
      target_decision: requiresTarget ? protectedTargetDecision(metricId) : null,
      ...overrides,
    }
  }

  it('uses worst-case right-censor intervals without returning counts', () => {
    expect(
      evaluateCensoredRate({
        ...rateInput('M2'),
        succeeded: 17,
        censored: 0,
      } as never),
    ).toEqual({ metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' })
    expect(
      evaluateCensoredRate({
        ...rateInput('M2'),
        succeeded: 10,
        censored: 2,
      } as never),
    ).toEqual({ metric_id: 'M2', status: 'FAIL', reason: 'best_case_failed' })
    expect(
      evaluateCensoredRate({
        ...rateInput('M2'),
        succeeded: 16,
        censored: 2,
      } as never),
    ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'censoring_changes_decision' })
  })

  it.each([
    ['M1', 14],
    ['M2', 17],
    ['M3', 15],
    ['M5', 8],
    ['M6', 5],
    ['M7', 8],
  ] as const)('uses the immutable threshold for %s', (metricId, succeeded) => {
    expect(evaluateCensoredRate({ ...rateInput(metricId), succeeded } as never)).toMatchObject({
      status: 'PASS',
      reason: 'worst_case_passed',
    })
    expect(
      evaluateCensoredRate({ ...rateInput(metricId), succeeded, target: 0 } as never),
    ).toMatchObject({ status: 'HOLD', reason: 'invalid_census' })
  })

  it('requires 20 distinct profiles and distinct eligible units for M2, M3 and M7', () => {
    for (const metricId of ['M2', 'M3', 'M7'] as const) {
      expect(
        evaluateCensoredRate({ ...rateInput(metricId), distinct_profiles: 19 } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'minimum_not_met' })
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
          distinct_eligible_units: 19,
        } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'invalid_census' })
    }
  })

  it('requires a protected M8/M9 target fixed after baseline and before evaluation', () => {
    for (const metricId of ['M8', 'M9'] as const) {
      expect(evaluateCensoredRate(rateInput(metricId) as never)).toMatchObject({ status: 'PASS' })
      expect(
        evaluateCensoredRate({ ...rateInput(metricId), target_decision: null } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'target_not_configured' })
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
          target_decision: protectedTargetDecision(metricId, {
            baseline_evidence_receipt: baselineEvidenceReceipt(metricId, {
              generated_at_utc: '2026-07-03T00:00:00Z',
            }),
            target_fixed_at_utc: '2026-07-02T00:00:00Z',
          }),
        } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'target_not_configured' })
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
          target_decision: protectedTargetDecision(metricId, {
            target_fixed_at_utc: '2026-08-01T00:00:00Z',
          }),
        } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'target_not_configured' })
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
          target_decision: protectedTargetDecision(metricId, {
            direction: 'at_or_below' as never,
          }),
        } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'target_not_configured' })
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
          target_decision: protectedTargetDecision(metricId, {
            remeasurement_deadline_utc: '2026-10-02T23:59:59.999Z',
          }),
        } as never),
      ).toMatchObject({ status: 'HOLD', reason: 'target_not_configured' })
    }
  })

  it.each(['M4', 'M10', 'M11', 'M12', 'north_star_monthly_memories_per_active_profile'] as const)(
    'holds right-censor evaluation for unsupported metric direction %s',
    (metricId) => {
      expect(
        evaluateCensoredRate({
          ...rateInput(metricId),
        } as never),
      ).toEqual({
        metric_id: metricId,
        status: 'HOLD',
        reason: 'unsupported_metric_direction',
      })
    },
  )

  it('adds secondary suppression when one hidden cell could be reconstructed', () => {
    expect(
      applyTelemetrySuppression({
        schema_version: TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION,
        cells: [
          { id: 'success', value: 12 },
          { id: 'failure', value: 3 },
          { id: 'total', value: 15 },
        ],
      }),
    ).toEqual([
      { id: 'success', value: 'suppressed', reason: 'secondary' },
      { id: 'failure', value: 'suppressed', reason: 'primary' },
      { id: 'total', value: 15, reason: 'visible' },
    ])
  })

  it('rejects omitted topology, raw IDs, duplicate/missing cells and inconsistent totals', () => {
    const valid = {
      schema_version: TELEMETRY_BINARY_OUTCOME_TABLE_SCHEMA_VERSION,
      cells: [
        { id: 'success' as const, value: 12 },
        { id: 'failure' as const, value: 3 },
        { id: 'total' as const, value: 15 },
      ],
    }
    expect(() =>
      applyTelemetrySuppression({ ...valid, reconstruction_groups: [] } as never),
    ).toThrow('invalid_input')
    expect(() =>
      applyTelemetrySuppression({
        ...valid,
        cells: [{ id: 'flow_00000000-0000-4000-8000-000000000010', value: 15 }],
      } as never),
    ).toThrow('invalid_input')
    expect(() => applyTelemetrySuppression({ ...valid, cells: valid.cells.slice(0, 2) })).toThrow(
      'invalid_input',
    )
    expect(() =>
      applyTelemetrySuppression({
        ...valid,
        cells: [valid.cells[0]!, valid.cells[0]!, valid.cells[2]!],
      }),
    ).toThrow('invalid_input')
    expect(() =>
      applyTelemetrySuppression({
        ...valid,
        cells: valid.cells.map((cell) => (cell.id === 'total' ? { ...cell, value: 14 } : cell)),
      }),
    ).toThrow('invalid_input')
    expect(() =>
      applyTelemetrySuppression({
        ...valid,
        cells: valid.cells.map((cell) =>
          cell.id === 'success' ? { ...cell, value: Number.MAX_SAFE_INTEGER + 1 } : cell,
        ),
      }),
    ).toThrow('invalid_input')
  })
})

describe('status-only evidence v2', () => {
  it('uses domain-separated keyed commitments and ordinary hashing only for evidence integrity', () => {
    const evidence = buildTelemetryEvidence(evidenceInput())
    expect(evidence.schema_version).toBe(TELEMETRY_EVIDENCE_SCHEMA_VERSION)
    expect(evidence.query_version).toBe(TELEMETRY_QUERY_VERSION)
    expect(evidence.commitment_scheme).toBe(TELEMETRY_COMMITMENT_SCHEME)
    expect(evidence.evidence_key_version).toBe(EVIDENCE_KEY_VERSION)
    expect(evidence.metric_window_manifest_commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(evidence.eligible_census_commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(evidence.censoring_status_commitment).toMatch(/^[0-9a-f]{64}$/)
    expect(
      new Set([
        evidence.metric_window_manifest_commitment,
        evidence.eligible_census_commitment,
        evidence.censoring_status_commitment,
      ]).size,
    ).toBe(3)
    expect(evidence.evidence_digest).toMatch(/^[0-9a-f]{64}$/)

    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain(EVENT_A)
    expect(serialized).not.toContain(ACTOR_A.actor_token)
    expect(serialized).not.toContain(COMMITMENT_KEY)
    expect(serialized).not.toContain(EVIDENCE_KEY)
    expect(evidence).not.toHaveProperty('metric_window_manifest')
    expect(evidence).not.toHaveProperty('eligible_census')
    expect(evidence).not.toHaveProperty('censoring_status')
    expect(evidence).not.toHaveProperty('counts')
  })

  it('accepts only strict private evidence dictionaries and never exposes them', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          private_event_id: EVENT_A,
        },
      } as never),
    ).toThrow('invalid_input')
    const { metric_ids: _metricIds, ...missingMetricSet } = valid.metric_window_manifest
    expect(() =>
      buildTelemetryEvidence({ ...valid, metric_window_manifest: missingMetricSet } as never),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({ ...valid, commitment_key: COMMITMENT_KEY } as never),
    ).toThrow('invalid_input')

    const evidence = buildTelemetryEvidence(valid)
    const serialized = JSON.stringify(evidence)
    expect(serialized).not.toContain(TELEMETRY_METRIC_WINDOW_MANIFEST_SCHEMA_VERSION)
    expect(serialized).not.toContain(TELEMETRY_ELIGIBLE_CENSUS_SCHEMA_VERSION)
    expect(serialized).not.toContain(TELEMETRY_CENSORING_STATUS_SCHEMA_VERSION)
    expect(Object.keys(evidence).sort()).toEqual(
      [
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
      ].sort(),
    )
  })

  it('requires a distinct protected versioned evidence key', () => {
    const valid = evidenceInput()
    vi.stubEnv('TELEMETRY_EVIDENCE_COMMITMENT_KEY', '')
    expect(() => buildTelemetryEvidence(valid)).toThrow('invalid_input')
    vi.stubEnv('TELEMETRY_EVIDENCE_COMMITMENT_KEY', MANIFEST_KEY)
    expect(() => buildTelemetryEvidence(valid)).toThrow('invalid_input')
  })

  it('derives the evidence actor key version only from protected configuration', () => {
    const valid = evidenceInput()
    expect(buildTelemetryEvidence(valid).actor_key_version).toBe(ACTOR_KEY_VERSION)
    expect(() =>
      buildTelemetryEvidence({ ...valid, actor_key_version: 'child_profile_123' } as never),
    ).toThrow('invalid_input')
    vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', 'v3')
    expect(() => buildTelemetryEvidence(valid)).toThrow('invalid_input')
    vi.stubEnv('TELEMETRY_ACTOR_KEY_VERSION', 'child_profile_123')
    expect(() => buildTelemetryEvidence(valid)).toThrow('invalid_input')
  })

  it('binds every M1 through M9 anchor, entry window and maturity cutoff', () => {
    const valid = evidenceInput()
    expect(buildTelemetryEvidence(valid).status).toBe('HOLD')
    for (const entry of valid.metric_window_manifest.metric_windows) {
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metric_window_manifest: {
            ...valid.metric_window_manifest,
            metric_windows: valid.metric_window_manifest.metric_windows.map((candidate) =>
              candidate.metric_id === entry.metric_id
                ? { ...candidate, anchor: 'caller_selected_anchor' }
                : candidate,
            ),
          },
        } as never),
      ).toThrow('invalid_input')
    }
    for (const [metricId, mutation] of [
      ['M2', { entry_window_start_utc: '2026-08-01T00:00:01Z' }],
      ['M7', { entry_window_start_utc: '2026-08-04T00:00:00Z' }],
      ['M8', { entry_window_end_utc: '2026-08-31T00:00:00Z' }],
    ] as const) {
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metric_window_manifest: {
            ...valid.metric_window_manifest,
            metric_windows: valid.metric_window_manifest.metric_windows.map((entry) =>
              entry.metric_id === metricId ? { ...entry, ...mutation } : entry,
            ),
          },
        } as never),
      ).toThrow('invalid_input')
    }
  })

  it('emits window_not_mature only when the fixed cutoff is still open', () => {
    const valid = evidenceInput()
    const early = {
      ...valid,
      generated_at_utc: '2026-10-01T00:00:00Z',
    }
    expect(() => buildTelemetryEvidence(early)).toThrow('invalid_input')
    const held = buildTelemetryEvidence({
      ...early,
      metrics: replaceMetric(early.metrics, {
        metric_id: 'M6',
        status: 'HOLD',
        reason: 'window_not_mature',
      }),
    })
    expect(held.metrics).toContainEqual({
      metric_id: 'M6',
      status: 'HOLD',
      reason: 'window_not_mature',
    })
    expect(
      buildTelemetryEvidence({
        ...valid,
        generated_at_utc: '2026-10-02T00:00:00Z',
      }).metrics,
    ).toContainEqual({ metric_id: 'M6', status: 'PASS', reason: 'worst_case_passed' })
  })

  it('binds exactly signed M8/M9 targets to baseline evidence and valid chronology', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          target_decisions: valid.metric_window_manifest.target_decisions.slice(0, 1),
        },
      }),
    ).toThrow('invalid_input')
    const m8 = valid.metric_window_manifest.target_decisions[0]!
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          target_decisions: [
            protectedTargetDecision('M8', {
              baseline_evidence_receipt: {
                ...m8.baseline_evidence_receipt,
                evidence_digest: 'e'.repeat(64),
              },
            }),
            valid.metric_window_manifest.target_decisions[1]!,
          ],
        },
      }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          target_decisions: [
            protectedTargetDecision('M8', {
              baseline_evidence_receipt: baselineEvidenceReceipt('M8', {
                evidence_digest: 'not-a-digest',
              }),
            }),
            protectedTargetDecision('M9'),
          ],
        },
      }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          target_decisions: [
            protectedTargetDecision('M8', {
              baseline_evidence_receipt: baselineEvidenceReceipt('M8', {
                generated_at_utc: '2026-07-03T00:00:00Z',
              }),
              target_fixed_at_utc: '2026-07-02T00:00:00Z',
            }),
            protectedTargetDecision('M9'),
          ],
        },
      }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metric_window_manifest: {
          ...valid.metric_window_manifest,
          target_decisions: [
            protectedTargetDecision('M8', {
              baseline_evidence_receipt: baselineEvidenceReceipt('M8', {
                cohort_role: 'evaluation' as never,
              }),
            }),
            protectedTargetDecision('M9'),
          ],
        },
      }),
    ).toThrow('invalid_input')
  })

  it('binds commitment domain, window and actor key version', () => {
    const common = {
      window_start_utc: '2026-08-01T00:00:00Z',
      window_end_utc: '2026-09-01T00:00:00Z',
      actor_key_version: 'v2',
      value: { synthetic: 'same-private-value' },
      commitment_key: COMMITMENT_KEY,
    }
    const manifestCommitment = createTelemetryCommitment({
      ...common,
      domain: 'metric_window_manifest',
    })
    expect(createTelemetryCommitment({ ...common, domain: 'eligible_census' })).not.toBe(
      manifestCommitment,
    )
    expect(
      createTelemetryCommitment({
        ...common,
        domain: 'metric_window_manifest',
        actor_key_version: 'v3',
      }),
    ).not.toBe(manifestCommitment)
    expect(
      createTelemetryCommitment({
        ...common,
        domain: 'metric_window_manifest',
        window_end_utc: '2026-10-01T00:00:00Z',
      }),
    ).not.toBe(manifestCommitment)
  })

  it('requires the exact four-source completeness set', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({ ...valid, completeness: valid.completeness.slice(0, 3) }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        completeness: [
          ...valid.completeness,
          { ...valid.completeness[0]!, source: 'unknown' as never },
        ],
      }),
    ).toThrow('invalid_input')
  })

  it('requires the versioned M1 through M12 metric set without duplicates', () => {
    expect(TELEMETRY_REQUIRED_METRIC_IDS).toEqual([
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
    ])
    const valid = evidenceInput()
    for (const missingMetricId of TELEMETRY_REQUIRED_METRIC_IDS) {
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metrics: valid.metrics.filter((metric) => metric.metric_id !== missingMetricId),
        }),
      ).toThrow('invalid_input')
    }
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: [...valid.metrics, valid.metrics[0]!],
      }),
    ).toThrow('invalid_input')
  })

  it('rejects metric and completeness status/reason contradictions', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: replaceMetric(valid.metrics, {
          metric_id: 'M2',
          status: 'PASS',
          reason: 'telemetry_incomplete',
        }),
      }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        completeness: valid.completeness.map((item, index) =>
          index === 0 ? { ...item, status: 'PASS', reason: 'loss_detected' } : item,
        ) as TelemetryCompletenessResult[],
      }),
    ).toThrow('invalid_input')
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        completeness: valid.completeness.map((item, index) =>
          index === 0 ? { ...item, status: 'HOLD', reason: 'caller_claimed_safe' } : item,
        ) as never,
      }),
    ).toThrow('invalid_input')
  })

  it.each([
    ['worst_case_passed', 'PASS'],
    ['best_case_failed', 'FAIL'],
    ['censoring_changes_decision', 'HOLD'],
  ] as const)('rejects M12 with the right-censor reason %s', (reason, status) => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: replaceMetric(valid.metrics, { metric_id: 'M12', status, reason }),
      }),
    ).toThrow('invalid_input')
  })

  it.each(['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8', 'M9'] as const)(
    'rejects a caller rate result that differs from recomputed private evidence for %s',
    (metricId) => {
      const valid = evidenceInput()
      for (const metric of [
        { metric_id: metricId, status: 'FAIL', reason: 'best_case_failed' },
        { metric_id: metricId, status: 'HOLD', reason: 'censoring_changes_decision' },
      ] as const) {
        expect(() =>
          buildTelemetryEvidence({
            ...valid,
            metrics: replaceMetric(valid.metrics, metric),
          }),
        ).toThrow('invalid_input')
      }
    },
  )

  it('accepts exact PASS, FAIL and censoring HOLD results recomputed from private evidence', () => {
    const valid = evidenceInput()
    expect(buildTelemetryEvidence(valid).metrics).toContainEqual({
      metric_id: 'M1',
      status: 'PASS',
      reason: 'worst_case_passed',
    })
    const withM1Censoring = (
      succeeded: number,
      censored: number,
      result: TelemetryMetricResult,
    ) => ({
      ...valid,
      censoring_status: {
        ...valid.censoring_status,
        metrics: valid.censoring_status.metrics.map((metric) =>
          metric.metric_id === 'M1' ? { ...metric, succeeded, censored } : metric,
        ),
      },
      metrics: replaceMetric(valid.metrics, result),
    })
    expect(
      buildTelemetryEvidence(
        withM1Censoring(10, 0, {
          metric_id: 'M1',
          status: 'FAIL',
          reason: 'best_case_failed',
        }),
      ).metrics,
    ).toContainEqual({ metric_id: 'M1', status: 'FAIL', reason: 'best_case_failed' })
    expect(
      buildTelemetryEvidence(
        withM1Censoring(15, 2, {
          metric_id: 'M1',
          status: 'HOLD',
          reason: 'censoring_changes_decision',
        }),
      ).metrics,
    ).toContainEqual({
      metric_id: 'M1',
      status: 'HOLD',
      reason: 'censoring_changes_decision',
    })
  })

  it('derives telemetry_incomplete only from funnel completeness', () => {
    const valid = evidenceInput()
    const dependentMetricIds = ['M2', 'M3', 'M8', 'M9'] as const
    for (const metricId of dependentMetricIds) {
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metrics: replaceMetric(valid.metrics, {
            metric_id: metricId,
            status: 'HOLD',
            reason: 'telemetry_incomplete',
          }),
        }),
      ).toThrow('invalid_input')
    }

    const heldCompleteness = valid.completeness.map((item) =>
      item.source === 'funnel'
        ? { ...item, status: 'HOLD' as const, reason: 'loss_detected' as const }
        : item,
    )
    const heldMetrics = dependentMetricIds.reduce(
      (metrics, metricId) =>
        replaceMetric(metrics, {
          metric_id: metricId,
          status: 'HOLD',
          reason: 'telemetry_incomplete',
        }),
      valid.metrics,
    )
    const evidence = buildTelemetryEvidence({
      ...valid,
      completeness: heldCompleteness,
      metrics: heldMetrics,
    })
    for (const metricId of dependentMetricIds) {
      expect(evidence.metrics).toContainEqual({
        metric_id: metricId,
        status: 'HOLD',
        reason: 'telemetry_incomplete',
      })
    }
    expect(evidence.metrics).toContainEqual({
      metric_id: 'M1',
      status: 'PASS',
      reason: 'worst_case_passed',
    })
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        completeness: heldCompleteness,
        metrics: replaceMetric(heldMetrics, {
          metric_id: 'M9',
          status: 'PASS',
          reason: 'worst_case_passed',
        }),
      }),
    ).toThrow('invalid_input')
  })

  it.each(['M4', 'M10', 'M11', 'north_star_monthly_memories_per_active_profile'] as const)(
    'rejects a right-censor result for unsupported metric %s',
    (metricId) => {
      const valid = evidenceInput()
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metrics: replaceMetric(valid.metrics, {
            metric_id: metricId,
            status: 'PASS',
            reason: 'worst_case_passed',
          }),
        }),
      ).toThrow('invalid_input')
    },
  )

  it('rejects a funnel-correlation reason for an unrelated metric', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: replaceMetric(valid.metrics, {
          metric_id: 'M1',
          status: 'PASS',
          reason: 'memory_saved_within_window',
        }),
      }),
    ).toThrow('invalid_input')
  })

  it('sanitizes extra caller fields from status-only output', () => {
    const valid = evidenceInput()
    const evidence = buildTelemetryEvidence({
      ...valid,
      completeness: valid.completeness.map((item) => ({
        ...item,
        email: 'synthetic@example.invalid',
      })),
      metrics: valid.metrics.map((metric) => ({ ...metric, exact_count: 23 })),
    })
    expect(JSON.stringify(evidence)).not.toContain('synthetic@example.invalid')
    expect(JSON.stringify(evidence)).not.toContain('exact_count')
  })

  it('fixes the North Star to DB truth and UTC monthly active units', () => {
    expect(NORTH_STAR_CONTRACT).toEqual({
      metric_id: 'north_star_monthly_memories_per_active_profile',
      active_unit: 'profile_with_non_deleted_memory_created_in_utc_calendar_month',
      numerator: 'distinct_non_deleted_memory_created_in_same_utc_calendar_month',
      window: 'utc_calendar_month_half_open',
      deduplication: 'memory_id',
      completeness: 'database_memory_truth',
      status: 'diagnostic',
    })
  })
})
