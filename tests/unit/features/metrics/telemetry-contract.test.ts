import { describe, expect, it } from 'vitest'
import {
  applyTelemetrySuppression,
  buildTelemetryEvidence,
  evaluateCensoredRate,
  evaluateSyntheticFunnelFlow,
  evaluateTelemetryCompleteness,
  NORTH_STAR_CONTRACT,
  parseTelemetryEnvelope,
  shouldSampleTelemetry,
  TELEMETRY_ACCESS_POLICY,
  TELEMETRY_EVENT_SCHEMA_VERSION,
  TELEMETRY_RETENTION_DAYS,
  TELEMETRY_SAMPLING,
  telemetryDigest,
  type TelemetryEnvelope,
} from '@/features/metrics/server/telemetry-contract'

const EVENT_A = '00000000-0000-4000-8000-000000000001'
const EVENT_B = '00000000-0000-4000-8000-000000000002'
const EVENT_C = '00000000-0000-4000-8000-000000000003'
const EVENT_D = '00000000-0000-4000-8000-000000000004'
const FLOW_ID = '00000000-0000-4000-8000-000000000010'

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

describe('PII-safe telemetry schema', () => {
  it('accepts only the versioned envelope and five allowlisted dimensions', () => {
    expect(envelope(EVENT_A, 'api_request')).toEqual({
      schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
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

describe('telemetry completeness', () => {
  it('detects duplicate and reorder without turning a complete set into loss', () => {
    const result = evaluateTelemetryCompleteness({
      source: 'funnel',
      expected_event_ids: [EVENT_A, EVENT_B, EVENT_C],
      received: [
        envelope(EVENT_B, 'photo_selected'),
        envelope(EVENT_A, 'record_started'),
        envelope(EVENT_B, 'photo_selected'),
        envelope(EVENT_C, 'memory_saved'),
      ],
    })
    expect(result).toEqual({
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
        expected_event_ids: [EVENT_A, EVENT_B],
        received: [envelope(EVENT_A, 'record_started')],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'loss_detected' })
    expect(
      evaluateTelemetryCompleteness({
        source: 'funnel',
        expected_event_ids: [EVENT_A],
        received: [envelope(EVENT_A, 'record_started'), envelope(EVENT_C, 'memory_saved')],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'unexpected_event' })
  })
})

describe('funnel DB truth correlation', () => {
  const complete = evaluateTelemetryCompleteness({
    source: 'funnel',
    expected_event_ids: [EVENT_A, EVENT_B],
    received: [envelope(EVENT_B, 'photo_selected'), envelope(EVENT_A, 'record_started')],
  })

  it('uses the Memory idempotency key as save truth even if memory_saved is missing', () => {
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness: complete,
        events: [
          {
            event_id: EVENT_B,
            flow_id: FLOW_ID,
            event_name: 'photo_selected',
            received_at_utc: '2026-08-07T00:05:00Z',
          },
          {
            event_id: EVENT_B,
            flow_id: FLOW_ID,
            event_name: 'photo_selected',
            received_at_utc: '2026-08-07T00:06:00Z',
          },
        ],
        memories: [{ idempotency_key: FLOW_ID, created_at_utc: '2026-08-07T00:20:00Z' }],
      }),
    ).toEqual({ metric_id: 'M2', status: 'PASS', reason: 'memory_saved_within_window' })
  })

  it('holds instead of classifying missing or reordered telemetry as drop-off', () => {
    const incomplete = evaluateTelemetryCompleteness({
      source: 'funnel',
      expected_event_ids: [EVENT_A, EVENT_B],
      received: [envelope(EVENT_A, 'record_started')],
    })
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness: incomplete,
        events: [],
        memories: [],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'telemetry_incomplete' })
    expect(
      evaluateSyntheticFunnelFlow({
        metric_id: 'M2',
        flow_id: FLOW_ID,
        generated_at_utc: '2026-08-07T01:00:00Z',
        completeness: complete,
        events: [
          {
            event_id: EVENT_B,
            flow_id: FLOW_ID,
            event_name: 'photo_selected',
            received_at_utc: '2026-08-07T00:20:00Z',
          },
        ],
        memories: [{ idempotency_key: FLOW_ID, created_at_utc: '2026-08-07T00:15:00Z' }],
      }),
    ).toMatchObject({ status: 'HOLD', reason: 'event_reordered_after_truth' })
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

describe('status-only evidence', () => {
  it('binds versions and digests without event ids or exact counts', () => {
    const completeness = evaluateTelemetryCompleteness({
      source: 'funnel',
      expected_event_ids: [EVENT_A],
      received: [envelope(EVENT_A, 'record_started')],
    })
    const evidence = buildTelemetryEvidence({
      source_sha: 'a'.repeat(40),
      window_start_utc: '2026-08-01T00:00:00Z',
      window_end_utc: '2026-09-01T00:00:00Z',
      actor_key_version: 'v1',
      generated_at_utc: '2026-09-01T01:00:00Z',
      metric_window_manifest_digest: telemetryDigest({ synthetic: 'window-manifest' }),
      eligible_census_digest: telemetryDigest({ synthetic: 'census' }),
      censoring_status_digest: telemetryDigest({ synthetic: 'censor' }),
      completeness: [completeness],
      metrics: [{ metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' }],
    })
    expect(evidence.status).toBe('PASS')
    expect(evidence.evidence_digest).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(evidence)).not.toContain(EVENT_A)
    expect(evidence).not.toHaveProperty('counts')
    expect(evidence).not.toHaveProperty('eligible')
    expect(evidence).not.toHaveProperty('succeeded')
    expect(evidence).not.toHaveProperty('censored')
  })

  it('proves completeness for funnel, Web Vitals, API and AI in one versioned artifact', () => {
    const sourceEvents = [
      envelope(EVENT_A, 'record_started'),
      parseTelemetryEnvelope({
        schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
        event_id: EVENT_B,
        occurred_at_utc: '2026-08-07T00:00:00Z',
        dimensions: {
          operation: 'web_vital_lcp',
          reason: 'not_applicable',
          route_group: 'record',
          status: 'good',
          duration_bucket: 'from_1001_to_2500ms',
        },
      }),
      envelope(EVENT_C, 'api_request'),
      parseTelemetryEnvelope({
        schema_version: TELEMETRY_EVENT_SCHEMA_VERSION,
        event_id: EVENT_D,
        occurred_at_utc: '2026-08-07T00:00:00Z',
        dimensions: {
          operation: 'ai_generation',
          reason: 'none',
          route_group: 'ai',
          status: 'success',
          duration_bucket: 'under_10s',
        },
      }),
    ]
    const completeness = (
      [
        ['funnel', EVENT_A],
        ['web_vital', EVENT_B],
        ['api', EVENT_C],
        ['ai', EVENT_D],
      ] as const
    ).map(([source, eventId], index) =>
      evaluateTelemetryCompleteness({
        source,
        expected_event_ids: [eventId],
        received: [sourceEvents[index]!],
      }),
    )
    const evidence = buildTelemetryEvidence({
      source_sha: 'b'.repeat(40),
      window_start_utc: '2026-08-01T00:00:00Z',
      window_end_utc: '2026-09-01T00:00:00Z',
      actor_key_version: 'v1',
      generated_at_utc: '2026-09-01T01:00:00Z',
      metric_window_manifest_digest: telemetryDigest({ synthetic: 'four-source-window' }),
      eligible_census_digest: telemetryDigest({ synthetic: 'four-source-census' }),
      censoring_status_digest: telemetryDigest({ synthetic: 'four-source-censor' }),
      completeness,
      metrics: [{ metric_id: 'M2', status: 'PASS', reason: 'worst_case_passed' }],
    })
    expect(evidence.status).toBe('PASS')
    expect(evidence.completeness.map(({ source }) => source)).toEqual([
      'funnel',
      'web_vital',
      'api',
      'ai',
    ])
    for (const eventId of [EVENT_A, EVENT_B, EVENT_C, EVENT_D]) {
      expect(JSON.stringify(evidence)).not.toContain(eventId)
    }
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
