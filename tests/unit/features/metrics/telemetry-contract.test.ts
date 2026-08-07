import { describe, expect, it } from 'vitest'
import {
  applyTelemetrySuppression,
  buildTelemetryEvidence,
  createTelemetryCommitment,
  evaluateCensoredRate,
  evaluateSyntheticFunnelFlow,
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
  type TelemetryCompletenessResult,
  type TelemetryEnvelope,
  type TelemetryExpectationManifest,
  type TelemetrySource,
} from '@/features/metrics/server/telemetry-contract'

const EVENT_A = '00000000-0000-4000-8000-000000000001'
const EVENT_B = '00000000-0000-4000-8000-000000000002'
const EVENT_C = '00000000-0000-4000-8000-000000000003'
const EVENT_D = '00000000-0000-4000-8000-000000000004'
const FLOW_ID = '00000000-0000-4000-8000-000000000010'
const COMMITMENT_KEY = 'synthetic-commitment-key-32-bytes-minimum'
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

function envelope(eventId: string, operation: TelemetryEnvelope['dimensions']['operation']) {
  const noDuration = operation === 'record_started' || operation === 'memory_viewed'
  return parseTelemetryEnvelope({
    schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
    event_id: eventId,
    occurred_at_utc: '2026-08-07T00:00:00Z',
    dimensions: {
      operation,
      reason: operation === 'api_request' ? 'validation_error' : 'stage_observed',
      route_group: 'record',
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

function manifest(
  expectedEventIds: readonly string[],
  overrides: Partial<TelemetryExpectationManifest> = {},
): TelemetryExpectationManifest {
  return {
    schema_version: TELEMETRY_EXPECTATION_MANIFEST_SCHEMA_VERSION,
    source: 'funnel',
    status: 'PASS',
    degradation: 'NONE',
    sampling_policy_version: TELEMETRY_SAMPLING_POLICY_VERSION,
    expected_event_ids: expectedEventIds,
    ...overrides,
  }
}

function complete(source: TelemetrySource, eventId: string): TelemetryCompletenessResult {
  return evaluateTelemetryCompleteness({
    source,
    manifest: manifest([eventId], { source }),
    received: [sourceEnvelope(source, eventId)],
  })
}

function sampledEventId(source: 'web_vital' | 'api', sampled: boolean): string {
  for (let index = 1; index <= 10_000; index += 1) {
    const candidate = `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
    if (shouldSampleTelemetry(source, candidate) === sampled) return candidate
  }
  throw new Error('synthetic_sample_id_not_found')
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
    expect(shouldSampleTelemetry('funnel', EVENT_A)).toBe(true)
    expect(shouldSampleTelemetry('web_vital', EVENT_A)).toBe(
      shouldSampleTelemetry('web_vital', EVENT_A),
    )
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
  })

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
  it('detects duplicate and reorder without turning a complete set into loss', () => {
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: manifest([EVENT_A, EVENT_B, EVENT_C]),
        received: [
          envelope(EVENT_B, 'photo_selected'),
          envelope(EVENT_A, 'record_started'),
          envelope(EVENT_B, 'photo_selected'),
          envelope(EVENT_C, 'memory_saved'),
        ],
      }),
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
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: manifest([EVENT_A, EVENT_B]),
        received: [envelope(EVENT_A, 'record_started')],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: manifest([EVENT_A]),
        received: [envelope(EVENT_A, 'record_started'), envelope(EVENT_C, 'memory_saved')],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })
  })

  it('holds when the expectation manifest is missing, untrusted, degraded or version-skewed', () => {
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: undefined as never,
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_missing' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: manifest([EVENT_A], { status: 'HOLD' }),
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'api',
        manifest: manifest([EVENT_A]),
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'expected_manifest_untrusted' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: manifest([EVENT_A], { degradation: 'TTL_EXPIRED' }),
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_degraded' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        manifest: {
          ...manifest([EVENT_A]),
          sampling_policy_version: 'stable-event-id/v1',
        } as never,
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'sampling_policy_mismatch' })
  })

  it('applies stable sampling before comparing expected and received ids', () => {
    const sampledIn = sampledEventId('api', true)
    const sampledOut = sampledEventId('api', false)
    expect(
      evaluateTelemetryCompleteness({
        source: 'api',
        manifest: manifest([sampledIn, sampledOut], { source: 'api' }),
        received: [sourceEnvelope('api', sampledIn)],
      }),
    ).toMatchObject({ status: 'PASS', reason: 'complete' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'api',
        manifest: manifest([sampledIn, sampledOut], { source: 'api' }),
        received: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'api',
        manifest: manifest([sampledIn, sampledOut], { source: 'api' }),
        received: [sourceEnvelope('api', sampledIn), sourceEnvelope('api', sampledOut)],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })
  })
})

describe('actor-scoped funnel DB truth correlation', () => {
  const completeFunnel = complete('funnel', EVENT_A)

  it('uses actor, key version and flow while keeping actor data out of the result', () => {
    const result = evaluateSyntheticFunnelFlow({
      metric_id: 'M2',
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness: completeFunnel,
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

  it('does not attribute another actor or key version memory with the same flow', () => {
    for (const actor of [ACTOR_B, ACTOR_A_OLD_KEY]) {
      expect(
        evaluateSyntheticFunnelFlow({
          metric_id: 'M2',
          flow_id: FLOW_ID,
          expected_actor: ACTOR_A,
          generated_at_utc: '2026-08-07T01:00:00Z',
          completeness: completeFunnel,
          events: [funnelEvent()],
          memories: [memoryTruth({ actor })],
        }),
      ).toEqual({ metric_id: 'M2', status: 'FAIL', reason: 'memory_not_saved' })
    }
  })

  it('uses the occurrence minute interval instead of delayed receipt time', () => {
    const base = {
      metric_id: 'M2' as const,
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness: completeFunnel,
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
  })

  it('holds unverified, invalid, immature or telemetry-incomplete anchors', () => {
    const base = {
      metric_id: 'M2' as const,
      flow_id: FLOW_ID,
      expected_actor: ACTOR_A,
      generated_at_utc: '2026-08-07T01:00:00Z',
      completeness: completeFunnel,
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
        generated_at_utc: '2026-08-07T00:30:59Z',
        events: [funnelEvent()],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'window_not_mature' })
    expect(
      evaluateSyntheticFunnelFlow({
        ...base,
        completeness: evaluateTelemetryCompleteness({
          source: 'funnel',
          manifest: manifest([EVENT_A, EVENT_B]),
          received: [envelope(EVENT_A, 'record_started')],
        }),
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
        completeness: completeFunnel,
        events: [funnelEvent()],
        memories: [memoryTruth()],
      }),
    ).toMatchObject({ status: 'PASS' })
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
