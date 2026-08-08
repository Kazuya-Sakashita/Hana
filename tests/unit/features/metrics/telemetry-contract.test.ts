import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  applyTelemetrySuppression,
  buildTelemetryEvidence,
  createTelemetryCommitment,
  createTelemetryExpectationManifestCommitment,
  createTelemetrySamplingKeyCommitment,
  evaluateCensoredRate,
  evaluateSyntheticFunnelFlow,
  evaluateSyntheticM9ViewToMemory,
  evaluateTelemetryCompleteness,
  NORTH_STAR_CONTRACT,
  parseTelemetryEnvelope,
  shouldSampleTelemetry,
  TELEMETRY_ACCESS_POLICY,
  TELEMETRY_COMMITMENT_SCHEME,
  TELEMETRY_EVENT_SCHEMA_VERSION,
  TELEMETRY_EVIDENCE_SCHEMA_VERSION,
  TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
  TELEMETRY_QUERY_VERSION,
  TELEMETRY_RETENTION_DAYS,
  TELEMETRY_SAMPLING,
  TELEMETRY_SAMPLING_POLICY_VERSION,
  type SyntheticActorRef,
  type SyntheticFunnelEvent,
  type SyntheticMemoryTruth,
  type SyntheticProfileMemoryTruth,
  type TelemetryCompletenessResult,
  type TelemetryCompletenessInput,
  type TelemetryEnvelope,
  type TelemetryExpectationManifest,
  type TelemetrySource,
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
const SAMPLING_KEY = 'synthetic-sampling-key-with-32-bytes-minimum'
const SAMPLING_KEY_VERSION = 'synthetic-v1'
const ACTOR_A: SyntheticActorRef = {
  actor_key_version: 'v2',
  actor_token: 'a'.repeat(64),
}
const ACTOR_B: SyntheticActorRef = {
  actor_key_version: 'v2',
  actor_token: 'b'.repeat(64),
}
const ACTOR_A_OLD_KEY: SyntheticActorRef = {
  actor_key_version: 'v1',
  actor_token: 'c'.repeat(64),
}

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

function manifest(
  expectedEventIds: readonly string[],
  overrides: Partial<TelemetryExpectationManifest> = {},
): TelemetryExpectationManifest {
  const source = overrides.source ?? 'funnel'
  const sampling = samplingFor(source)
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
      commitment_key: COMMITMENT_KEY,
    }),
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
  const { manifest_commitment: suppliedCommitment, ...boundaryOverrides } = overrides
  const sampling = samplingFor(source)
  const boundary = {
    source,
    manifest: expectation,
    received,
    window_start_utc: '2026-08-07T00:00:00Z',
    window_end_utc: '2026-08-08T00:00:00Z',
    actor_key_version: 'v2',
    sampling_key_version: sampling.key_version,
    sampling_key: sampling.key,
    commitment_key: COMMITMENT_KEY,
    ...boundaryOverrides,
  }
  return {
    ...boundary,
    manifest_commitment:
      suppliedCommitment ??
      createTelemetryExpectationManifestCommitment({
        ...boundary,
        manifest: boundary.manifest ?? expectation,
      }),
  }
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
    actor: ACTOR_A,
    created_at_utc: '2026-08-13T23:59:59Z',
    ...overrides,
  }
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

function evidenceInput() {
  return {
    source_sha: 'a'.repeat(40),
    window_start_utc: '2026-08-01T00:00:00Z',
    window_end_utc: '2026-09-01T00:00:00Z',
    actor_key_version: 'v2',
    generated_at_utc: '2026-09-01T01:00:00Z',
    commitment_key: COMMITMENT_KEY,
    metric_window_manifest: { metric: 'M2', private_event_id: EVENT_A },
    eligible_census: { exact_count: 23, private_actor: ACTOR_A.actor_token },
    censoring_status: { exact_censored: 2 },
    completeness: fourSourceCompleteness(),
    metrics: [{ metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' }] as const,
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
    expect(TELEMETRY_QUERY_VERSION).toBe('issue-188-v1')
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

  it('detects duplicate and reorder without turning a complete set into loss', () => {
    expect(
      evaluateTelemetryCompleteness(
        completenessInput('funnel', manifest([EVENT_A, EVENT_B, EVENT_C]), [
          envelope(EVENT_B, 'photo_selected'),
          envelope(EVENT_A, 'record_started'),
          envelope(EVENT_B, 'photo_selected'),
          envelope(EVENT_C, 'memory_saved'),
        ]),
      ),
    ).toEqual({
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
      ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'actor_reference_invalid' })
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
})

describe('privacy aggregation', () => {
  it('uses worst-case right-censor intervals without returning counts', () => {
    expect(
      evaluateCensoredRate({
        metric_id: 'M2',
        eligible: 20,
        succeeded: 17,
        censored: 0,
        minimum: 20,
        target: 0.85,
      }),
    ).toEqual({ metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' })
    expect(
      evaluateCensoredRate({
        metric_id: 'M2',
        eligible: 20,
        succeeded: 10,
        censored: 2,
        minimum: 20,
        target: 0.85,
      }),
    ).toEqual({ metric_id: 'M2', status: 'FAIL', reason: 'best_case_failed' })
    expect(
      evaluateCensoredRate({
        metric_id: 'M2',
        eligible: 20,
        succeeded: 16,
        censored: 2,
        minimum: 20,
        target: 0.85,
      }),
    ).toEqual({ metric_id: 'M2', status: 'HOLD', reason: 'censoring_changes_decision' })
  })

  it.each(['M4', 'M10', 'M11', 'M12', 'north_star_monthly_memories_per_active_profile'] as const)(
    'holds right-censor evaluation for unsupported metric direction %s',
    (metricId) => {
      expect(
        evaluateCensoredRate({
          metric_id: metricId,
          eligible: 20,
          succeeded: 20,
          censored: 0,
          minimum: 20,
          target: metricId === 'M12' ? 0 : 0.5,
        }),
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
        cells: [
          { id: 'success', value: 12 },
          { id: 'failure', value: 3 },
          { id: 'total', value: 15 },
        ],
        reconstruction_groups: [['success', 'failure', 'total']],
      }),
    ).toEqual([
      { id: 'success', value: 'suppressed', reason: 'secondary' },
      { id: 'failure', value: 'suppressed', reason: 'primary' },
      { id: 'total', value: 15, reason: 'visible' },
    ])
  })
})

describe('status-only evidence v2', () => {
  it('uses domain-separated keyed commitments and ordinary hashing only for evidence integrity', () => {
    const evidence = buildTelemetryEvidence(evidenceInput())
    expect(evidence.schema_version).toBe(TELEMETRY_EVIDENCE_SCHEMA_VERSION)
    expect(evidence.query_version).toBe(TELEMETRY_QUERY_VERSION)
    expect(evidence.commitment_scheme).toBe(TELEMETRY_COMMITMENT_SCHEME)
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
    expect(evidence).not.toHaveProperty('metric_window_manifest')
    expect(evidence).not.toHaveProperty('eligible_census')
    expect(evidence).not.toHaveProperty('censoring_status')
    expect(evidence).not.toHaveProperty('counts')
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

  it('rejects metric and completeness status/reason contradictions', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: [{ metric_id: 'M2', status: 'PASS', reason: 'telemetry_incomplete' }],
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
        metrics: [{ metric_id: 'M12', status, reason }],
      }),
    ).toThrow('invalid_input')
  })

  it.each(['M1', 'M2', 'M3', 'M5', 'M6', 'M7', 'M8', 'M9'] as const)(
    'accepts right-censor results only for the supported production rate metric %s',
    (metricId) => {
      const valid = evidenceInput()
      for (const metric of [
        { metric_id: metricId, status: 'PASS', reason: 'worst_case_passed' },
        { metric_id: metricId, status: 'FAIL', reason: 'best_case_failed' },
        { metric_id: metricId, status: 'HOLD', reason: 'censoring_changes_decision' },
      ] as const) {
        expect(buildTelemetryEvidence({ ...valid, metrics: [metric] }).metrics).toEqual([metric])
      }
    },
  )

  it.each(['M4', 'M10', 'M11', 'north_star_monthly_memories_per_active_profile'] as const)(
    'rejects a right-censor result for unsupported metric %s',
    (metricId) => {
      const valid = evidenceInput()
      expect(() =>
        buildTelemetryEvidence({
          ...valid,
          metrics: [{ metric_id: metricId, status: 'PASS', reason: 'worst_case_passed' }],
        }),
      ).toThrow('invalid_input')
    },
  )

  it('rejects a funnel-correlation reason for an unrelated metric', () => {
    const valid = evidenceInput()
    expect(() =>
      buildTelemetryEvidence({
        ...valid,
        metrics: [{ metric_id: 'M1', status: 'PASS', reason: 'memory_saved_within_window' }],
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
