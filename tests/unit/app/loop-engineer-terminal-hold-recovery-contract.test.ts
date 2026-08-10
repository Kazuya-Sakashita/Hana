import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'

const adrSource = readFileSync(
  new URL('../../../docs/adr/0017-loop-engineer-approval-boundary.md', import.meta.url),
  'utf8',
)
const runbookSource = readFileSync(
  new URL('../../../docs/api-driven-development/codex-automation-runbook.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-177-terminal-hold-recovery-policy.md', import.meta.url),
  'utf8',
)
const agentsSource = readFileSync(new URL('../../../AGENTS.md', import.meta.url), 'utf8')
const schemaPath = 'docs/api-driven-development/recovery-evidence-v1.schema.json'
const schema = JSON.parse(readFileSync(new URL(`../../../${schemaPath}`, import.meta.url), 'utf8'))
const invariants = schema['x-hana-invariants']

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validateEvidence = ajv.compile(schema)

const sha = (character: string) => character.repeat(64)
const gitSha = (character: string) => character.repeat(40)
const typedId = (prefix: string, character: string) => `${prefix}_${character.repeat(32)}`
const principal = (character: string) => `principal_${sha(character)}`

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function digest(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex')
}

function getPath(record: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (value === null || typeof value !== 'object') return undefined
    return (value as Record<string, unknown>)[segment]
  }, record)
}

function fixtureAt<T>(records: readonly T[], index: number): T {
  const record = records[index]
  if (record === undefined) throw new Error(`missing fixture at index ${index}`)
  return record
}

function eventEnvelope(sequence: number) {
  return {
    event_id: `event_${sequence.toString(16).padStart(32, '0')}`,
    event_sequence: sequence,
    event_at: '2026-08-09T00:00:00Z',
  }
}

const recordReference = {
  schema_version: 'recovery_evidence_v1',
  repository: 'Kazuya-Sakashita/Hana',
  lineage_id: typedId('lineage', 'a'),
  lineage_anchor_digest_sha256: sha('a'),
}

const target = {
  target_issue: 364,
  target_pr: 400,
  main_sha: gitSha('a'),
  target_head_sha: gitSha('b'),
}

const successionId = typedId('succession', 'b')
const authorityId = typedId('authority', 'c')
const progressionId = typedId('progression', 'd')
const attemptId = typedId('attempt', 'e')
const barrierId = typedId('barrier', 'f')

const lineageAnchor = {
  schema_version: 'recovery_evidence_v1',
  record_type: 'lineage_anchor',
  repository: 'Kazuya-Sakashita/Hana',
  lineage_id: recordReference.lineage_id,
  root_source_issue: 354,
  root_source_pr: 355,
  root_source_base_sha: 'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
  root_source_head_sha: '1239936947aed0f198216a2c8bf4be3177eb2223',
  terminal_source_issue: 358,
  terminal_source_pr: 361,
  terminal_source_base_sha: 'fbd5250251ce42d2d1505c685e3f01459d979c0e',
  terminal_source_head_sha: '514d8c64d252b22fb84f7b7834ae690025896882',
  target_issue: target.target_issue,
  target_pr: target.target_pr,
  succession_id: successionId,
  finding_ids: schema.$defs.lineageAnchor.properties.finding_ids.const,
  finding_count: 9,
  finding_digest: '52450c49b3852ceedd838c975f6854ec43009ba70f645630ecd00f826da787a1',
}

function makeApprovalReceipt(
  role: string,
  actorCharacter: string,
  approvalCharacter: string,
  nonceCharacter: string,
) {
  const approvalPayload = {
    ...target,
    succession_id: successionId,
    finding_digest: lineageAnchor.finding_digest,
    role,
    actor_principal_id: principal(actorCharacter),
    requester_principal_id: principal('b'),
    issuer_principal_id: principal('c'),
    approval_id: typedId('approval', approvalCharacter),
    approval_run_id: typedId('approvalrun', 'a'),
    issued_at: '2026-08-09T00:00:00Z',
    expires_at: '2026-08-09T01:00:00Z',
    nonce_sha256: sha(nonceCharacter),
  }
  const signatureInput = { ...recordReference, approval_payload: approvalPayload }

  return {
    ...recordReference,
    record_type: 'approval_receipt',
    approval_payload: approvalPayload,
    verification_receipt: {
      signature_payload_digest_sha256: digest(signatureInput),
      verifier_id: typedId('verifier', 'a'),
      verification_receipt_digest_sha256: sha('d'),
      verification_status: 'verified',
    },
  }
}

const approvalSet = [
  makeApprovalReceipt('security', 'd', 'd', 'd'),
  makeApprovalReceipt('operations', 'e', 'e', 'e'),
  makeApprovalReceipt('repository_owner', 'f', 'f', 'f'),
]
const approvalReceipt = fixtureAt(approvalSet, 0)

function approvalSetDigest(records: Array<Record<string, unknown>>): string {
  const roleOrder = invariants.approval_set_digest.role_order as string[]
  const ordered = [...records].sort(
    (left, right) =>
      roleOrder.indexOf(String(getPath(left, 'approval_payload.role'))) -
      roleOrder.indexOf(String(getPath(right, 'approval_payload.role'))),
  )
  return digest(ordered)
}

const validApprovalSetDigest = approvalSetDigest(approvalSet)

function makeLineageEvent(eventType: string, sequence: number) {
  return {
    ...recordReference,
    ...eventEnvelope(sequence),
    record_type: 'lineage_event',
    event_type: eventType,
    authority_id: authorityId,
    succession_id: successionId,
    ...target,
    approval_set_digest_sha256: validApprovalSetDigest,
  }
}

const lineageSequence = [
  makeLineageEvent('recovery_authority_issued', 1),
  makeLineageEvent('succession_issued', 2),
  makeLineageEvent('succession_consumed', 3),
]
const lineageEvent = lineageSequence[0]

function makeProgressionEvent(
  eventType: string,
  sequence: number,
  extension: Record<string, unknown> = {},
) {
  return {
    ...recordReference,
    ...eventEnvelope(sequence),
    record_type: 'progression_event',
    event_type: eventType,
    progression_id: progressionId,
    authority_id: authorityId,
    succession_id: successionId,
    target_issue: target.target_issue,
    target_pr: target.target_pr,
    target_head_sha: target.target_head_sha,
    round: 1,
    approval_set_digest_sha256: validApprovalSetDigest,
    ...extension,
  }
}

const progressionSequence = [
  makeProgressionEvent('progression_authority_issued', 10),
  makeProgressionEvent('round_state_recorded', 11, { round_state: 'evaluation_completed' }),
  makeProgressionEvent('round_state_recorded', 12, { round_state: 'finding_free' }),
  makeProgressionEvent('fencing_generation_issued', 13, { writer_generation: 2 }),
  makeProgressionEvent('fencing_generation_revoked', 14, { writer_generation: 2 }),
  makeProgressionEvent('progression_authority_revoked', 15),
]
const progressionEvent = progressionSequence[0]
const activeProgressionSequence = progressionSequence.slice(0, 3)

const attemptEvent = {
  ...recordReference,
  ...eventEnvelope(20),
  record_type: 'attempt_event',
  event_type: 'attempt_started',
  progression_id: progressionId,
  authority_id: authorityId,
  succession_id: successionId,
  target_issue: target.target_issue,
  target_pr: target.target_pr,
  target_head_sha: target.target_head_sha,
  main_sha: target.main_sha,
  round: 1,
  approval_set_digest_sha256: validApprovalSetDigest,
  attempt_id: attemptId,
  run_id: 100,
  run_attempt: 1,
  oidc_jti_sha256: sha('c'),
}

const writerIdentity = {
  ...recordReference,
  record_type: 'writer_fence_event',
  barrier_id: barrierId,
  target_pr: target.target_pr,
  target_head_sha: target.target_head_sha,
  main_sha: target.main_sha,
  progression_id: progressionId,
  attempt_id: attemptId,
  writer_generation: 2,
  fencing_token_sha256: sha('c'),
  credential_owner_id: typedId('credential', 'd'),
  github_app_id: 4483496,
  check_name: 'merge-eligibility',
  check_run_id: 1000,
}

function barrierDigest(records: Array<Record<string, unknown>>): string {
  const fields = invariants.writer_barrier_digest.fields
  const canonicalRecords = records.map((record) =>
    Object.fromEntries(fields.map((field: string) => [field, record[field]])),
  )
  return digest(canonicalRecords)
}

function makeWriterSequence() {
  const eventTypes = invariants.unknown_success_writer_sequence as string[]
  const records = eventTypes.map((eventType, index) => ({
    ...writerIdentity,
    ...eventEnvelope(index + 30),
    event_type: eventType,
  }))
  const completedDigest = barrierDigest(records.slice(0, 4))

  return records.map((record, index) => ({
    ...record,
    ...(index >= 3 ? { completed_barrier_digest_sha256: completedDigest } : {}),
    ...(record.event_type === 'success_read_back' ? { observed_check_status: 'success' } : {}),
    ...(record.event_type === 'failure_projected' ? { projected_check_status: 'failure' } : {}),
    ...(['failure_read_back', 'final_failure_read_back'].includes(record.event_type)
      ? { observed_check_status: 'failure' }
      : {}),
  }))
}

const writerSequence = makeWriterSequence()
const writerFenceEvent = writerSequence[0]
const completedBarrierDigest = writerSequence[3]?.completed_barrier_digest_sha256

const projectionEvent = {
  ...recordReference,
  ...eventEnvelope(50),
  record_type: 'projection_event',
  event_type: 'check_projection_recorded',
  barrier_id: barrierId,
  target_pr: target.target_pr,
  target_head_sha: target.target_head_sha,
  main_sha: target.main_sha,
  progression_id: progressionId,
  attempt_id: attemptId,
  github_app_id: writerIdentity.github_app_id,
  check_name: 'merge-eligibility',
  check_run_id: writerIdentity.check_run_id,
  check_status: 'failure',
  check_reason: 'activation_blocked',
  writer_generation: writerIdentity.writer_generation,
  fencing_token_sha256: writerIdentity.fencing_token_sha256,
  completed_barrier_digest_sha256: completedBarrierDigest,
}

function validateApprovalSet(
  records: Array<Record<string, unknown>>,
  evaluationAt: string,
): string[] {
  const errors: string[] = []
  const rule = invariants.approval_set

  if (records.length !== rule.required_roles.length) errors.push('approval count')
  for (const role of rule.required_roles) {
    if (!records.some((record) => getPath(record, 'approval_payload.role') === role)) {
      errors.push('missing role')
    }
  }
  for (const field of rule.same_fields) {
    if (new Set(records.map((record) => getPath(record, field))).size !== 1) {
      errors.push(`mismatched ${field}`)
    }
  }
  for (const field of rule.unique_fields) {
    if (new Set(records.map((record) => getPath(record, field))).size !== records.length) {
      errors.push(`replayed ${field}`)
    }
  }

  const actors = new Set(
    records.map((record) => getPath(record, 'approval_payload.actor_principal_id')),
  )
  const disallowed = new Set(
    records.flatMap((record) =>
      rule.actor_disjoint_from.map((field: string) => getPath(record, field)),
    ),
  )
  if ([...actors].some((actor) => disallowed.has(actor))) errors.push('cross-record self approval')

  for (const record of records) {
    if (!validateEvidence(record)) errors.push('invalid receipt schema')
    if (
      Date.parse(String(getPath(record, 'approval_payload.expires_at'))) <= Date.parse(evaluationAt)
    ) {
      errors.push('expired approval')
    }
    const signatureInput = {
      schema_version: record.schema_version,
      repository: record.repository,
      lineage_id: record.lineage_id,
      lineage_anchor_digest_sha256: record.lineage_anchor_digest_sha256,
      approval_payload: record.approval_payload,
    }
    if (
      digest(signatureInput) !==
      getPath(record, 'verification_receipt.signature_payload_digest_sha256')
    ) {
      errors.push('signature payload mismatch')
    }
  }

  return errors
}

function validateLifecycle(records: Array<Record<string, unknown>>): string[] {
  const errors: string[] = []
  const eventRecords = records.filter((record) => record.event_id !== undefined)
  const ordered = [...eventRecords].sort(
    (left, right) => Number(left.event_sequence) - Number(right.event_sequence),
  )
  const approvalGroups = new Map<string, Array<Record<string, unknown>>>()
  for (const record of records.filter(
    (candidate) => candidate.record_type === 'approval_receipt',
  )) {
    const key = String(getPath(record, 'approval_payload.approval_run_id'))
    approvalGroups.set(key, [...(approvalGroups.get(key) ?? []), record])
  }
  const approvalSets = new Map<string, Array<Record<string, unknown>>>()
  const evaluationAt = String(ordered.at(-1)?.event_at ?? '2026-08-09T00:30:00Z')
  for (const group of approvalGroups.values()) {
    if (validateApprovalSet(group, evaluationAt).length === 0) {
      approvalSets.set(approvalSetDigest(group), group)
    }
  }
  const eventIds = new Set<unknown>()
  const eventSequences = new Set<unknown>()
  const attemptStates = new Map<
    string,
    {
      bindings?: Record<string, unknown>
      tuple?: string
      starts: number
      terminals: number
      progressionId?: unknown
    }
  >()
  const tupleOwners = new Map<string, unknown>()
  const lineageStates = new Map<
    string,
    {
      bindings?: Record<string, unknown>
      recoveryAuthority: 'absent' | 'active' | 'revoked'
      succession: 'absent' | 'issued' | 'consumed' | 'revoked'
    }
  >()
  const progressionStates = new Map<
    string,
    {
      bindings?: Record<string, unknown>
      authority: 'absent' | 'active' | 'revoked'
      fencing: 'absent' | 'active' | 'revoked'
      fencingGeneration?: unknown
      roundState: 'absent' | 'evaluation_completed' | 'completed_with_findings' | 'finding_free'
    }
  >()
  const activeProgressions = new Map<string, string>()

  function compareBindings(
    record: Record<string, unknown>,
    bindings: Record<string, unknown> | undefined,
    fields: string[],
    label: string,
  ): Record<string, unknown> {
    const current = Object.fromEntries(fields.map((field) => [field, record[field]]))
    if (bindings) {
      for (const field of fields) {
        if (bindings[field] !== current[field]) errors.push(`${label} binding changed: ${field}`)
      }
      return bindings
    }
    return current
  }

  function validateApprovalBinding(record: Record<string, unknown>) {
    const digestValue = String(record.approval_set_digest_sha256)
    const set = approvalSets.get(digestValue)
    if (!set) {
      errors.push('unknown approval set digest')
      return
    }
    const receipt = fixtureAt(set, 0)
    const mappings = invariants.approval_set_digest.binding_fields[
      String(record.record_type)
    ] as Record<string, string>
    for (const [eventField, receiptField] of Object.entries(mappings)) {
      if (record[eventField] !== getPath(receipt, receiptField)) {
        errors.push(`approval set binding mismatch: ${eventField}`)
      }
    }
  }

  for (const record of ordered) {
    if (eventIds.has(record.event_id)) errors.push('duplicate event_id')
    if (eventSequences.has(record.event_sequence)) errors.push('duplicate event_sequence')
    eventIds.add(record.event_id)
    eventSequences.add(record.event_sequence)

    if (record.record_type === 'lineage_event') {
      validateApprovalBinding(record)
      const key = `${record.lineage_id}:${record.succession_id}`
      const state = lineageStates.get(key) ?? {
        recoveryAuthority: 'absent' as const,
        succession: 'absent' as const,
      }
      state.bindings = compareBindings(
        record,
        state.bindings,
        invariants.lineage_lifecycle.binding_fields,
        'lineage',
      )
      switch (record.event_type) {
        case 'recovery_authority_issued':
          if (state.recoveryAuthority !== 'absent') {
            errors.push('duplicate recovery authority issue')
          }
          state.recoveryAuthority = 'active'
          break
        case 'recovery_authority_revoked':
          if (state.recoveryAuthority !== 'active') errors.push('orphan recovery authority revoke')
          state.recoveryAuthority = 'revoked'
          break
        case 'succession_issued':
          if (state.recoveryAuthority !== 'active' || state.succession !== 'absent') {
            errors.push('invalid succession issue')
          }
          state.succession = 'issued'
          break
        case 'succession_consumed':
          if (state.recoveryAuthority !== 'active' || state.succession !== 'issued') {
            errors.push('invalid succession consumption')
          }
          state.succession = 'consumed'
          break
        case 'succession_revoked':
          if (!['issued', 'consumed'].includes(state.succession)) {
            errors.push('invalid succession revoke')
          }
          state.succession = 'revoked'
          break
      }
      lineageStates.set(key, state)
    }

    if (record.record_type === 'progression_event') {
      validateApprovalBinding(record)
      const lineageKey = String(record.lineage_id)
      const key = `${lineageKey}:${record.progression_id}`
      const state = progressionStates.get(key) ?? {
        authority: 'absent' as const,
        fencing: 'absent' as const,
        roundState: 'absent' as const,
      }
      state.bindings = compareBindings(
        record,
        state.bindings,
        invariants.progression_lifecycle.binding_fields,
        'progression',
      )

      switch (record.event_type) {
        case 'progression_authority_issued': {
          const successionKey = `${lineageKey}:${record.succession_id}`
          const lineageState = lineageStates.get(successionKey)
          if (!lineageState || lineageState.succession !== 'consumed') {
            errors.push('progression without consumed succession')
          } else {
            for (const field of invariants.progression_lifecycle
              .issuance_requires_consumed_succession.same_fields as string[]) {
              if (lineageState.bindings?.[field] !== record[field]) {
                errors.push(`consumed succession binding mismatch: ${field}`)
              }
            }
          }
          if (activeProgressions.has(lineageKey)) errors.push('active progression exists')
          if (state.authority !== 'absent') errors.push('duplicate progression authority issue')
          state.authority = 'active'
          activeProgressions.set(lineageKey, key)
          break
        }
        case 'round_state_recorded': {
          if (state.authority !== 'active') errors.push('orphan round state')
          const allowed = invariants.progression_lifecycle.round_state_transitions[
            state.roundState
          ] as string[]
          if (!allowed.includes(String(record.round_state))) errors.push('invalid round transition')
          state.roundState = record.round_state as typeof state.roundState
          break
        }
        case 'fencing_generation_issued':
          if (
            state.authority !== 'active' ||
            state.roundState !== 'finding_free' ||
            state.fencing !== 'absent'
          ) {
            errors.push('invalid fencing issue')
          }
          state.fencing = 'active'
          state.fencingGeneration = record.writer_generation
          break
        case 'fencing_generation_revoked':
          if (
            state.authority !== 'active' ||
            state.fencing !== 'active' ||
            state.fencingGeneration !== record.writer_generation
          ) {
            errors.push('invalid fencing revoke')
          }
          state.fencing = 'revoked'
          state.fencingGeneration = undefined
          break
        case 'progression_authority_revoked':
          if (state.authority !== 'active' || state.fencing === 'active') {
            errors.push('invalid progression authority revoke')
          }
          state.authority = 'revoked'
          if (activeProgressions.get(lineageKey) === key) activeProgressions.delete(lineageKey)
          break
      }
      progressionStates.set(key, state)
    }

    if (record.record_type === 'attempt_event') {
      validateApprovalBinding(record)
      const attemptKey = `${record.lineage_id}:${record.attempt_id}`
      const state = attemptStates.get(attemptKey) ?? { starts: 0, terminals: 0 }
      state.bindings = compareBindings(
        record,
        state.bindings,
        invariants.attempt_lifecycle.binding_fields,
        'attempt',
      )
      const progressionKey = `${record.lineage_id}:${record.progression_id}`
      const progressionState = progressionStates.get(progressionKey)
      if (
        !progressionState ||
        progressionState.authority !== 'active' ||
        progressionState.roundState !== 'finding_free'
      ) {
        errors.push('attempt without active finding-free progression')
      } else {
        for (const field of invariants.attempt_lifecycle.start_requires_active_progression
          .same_fields as string[]) {
          if (progressionState.bindings?.[field] !== record[field]) {
            errors.push(`attempt progression binding mismatch: ${field}`)
          }
        }
      }
      const tuple = [record.run_id, record.run_attempt, record.oidc_jti_sha256].join(':')
      const lineageTuple = `${record.lineage_id}:${tuple}`
      const owner = tupleOwners.get(lineageTuple)
      if (owner !== undefined && owner !== record.attempt_id) errors.push('attempt tuple reused')
      tupleOwners.set(lineageTuple, record.attempt_id)
      if (state.tuple && state.tuple !== tuple) errors.push('attempt tuple changed')
      if (state.progressionId && state.progressionId !== record.progression_id) {
        errors.push('attempt progression changed')
      }
      state.tuple = tuple
      state.progressionId = record.progression_id
      if (record.event_type === 'attempt_started') state.starts += 1
      if (
        ['attempt_succeeded', 'attempt_failed', 'attempt_cancelled', 'attempt_timed_out'].includes(
          String(record.event_type),
        )
      ) {
        if (state.starts !== 1) errors.push('terminal without one start')
        state.terminals += 1
      }
      if (state.starts > 1) errors.push('duplicate attempt start')
      if (state.terminals > 1) errors.push('multiple attempt terminals')
      attemptStates.set(attemptKey, state)
    }
  }

  return errors
}

function validateUnknownSuccessSequence(records: Array<Record<string, unknown>>): string[] {
  const errors: string[] = []
  const ordered = [...records].sort(
    (left, right) => Number(left.event_sequence) - Number(right.event_sequence),
  )
  if (
    JSON.stringify(ordered.map((record) => record.event_type)) !==
    JSON.stringify(invariants.unknown_success_writer_sequence)
  ) {
    errors.push('writer event sequence mismatch')
  }
  for (let index = 1; index < ordered.length; index += 1) {
    if (Number(ordered[index]?.event_sequence) !== Number(ordered[index - 1]?.event_sequence) + 1) {
      errors.push('writer event sequence gap')
    }
  }
  for (const field of invariants.writer_barrier_identity_fields) {
    if (new Set(ordered.map((record) => record[field])).size !== 1) {
      errors.push(`writer identity mismatch: ${field}`)
    }
  }
  const expectedDigest = barrierDigest(ordered.slice(0, 4))
  for (const record of ordered.slice(3)) {
    if (record.completed_barrier_digest_sha256 !== expectedDigest) {
      errors.push('writer barrier digest mismatch')
    }
  }
  if (ordered.some((record) => !validateEvidence(record)))
    errors.push('invalid writer event schema')
  return errors
}

function expectConceptsInOrder(source: string, concepts: string[], label: string): void {
  let cursor = 0
  for (const concept of concepts) {
    const index = source.indexOf(concept, cursor)
    expect(index, `${label}: missing ordered concept ${concept}`).toBeGreaterThanOrEqual(0)
    cursor = index + concept.length
  }
}

describe('ISSUE-177 Terminal HOLD recovery contract', () => {
  it('validates all seven evidence record types against the machine-readable SSOT', () => {
    for (const fixture of [
      lineageAnchor,
      approvalReceipt,
      lineageEvent,
      progressionEvent,
      attemptEvent,
      writerFenceEvent,
      projectionEvent,
    ]) {
      expect(validateEvidence(fixture), JSON.stringify(validateEvidence.errors)).toBe(true)
    }
    expect(schema.oneOf).toHaveLength(7)
  })

  it('separates signed approval payload from derived verification receipt', () => {
    expect(invariants.approval_signature.included).toContain('approval_payload')
    expect(invariants.approval_signature.excluded).toEqual(['verification_receipt'])
    expect(validateApprovalSet(approvalSet, '2026-08-09T00:30:00Z')).toEqual([])

    const invalidSchemaFixtures = [
      { ...approvalReceipt, unexpected: true },
      {
        ...approvalReceipt,
        approval_payload: {
          ...approvalReceipt.approval_payload,
          actor_principal_id: 'person@example.com',
        },
      },
      {
        ...approvalReceipt,
        verification_receipt: { verification_status: 'verified' },
      },
      {
        ...approvalReceipt,
        verification_receipt: {
          ...approvalReceipt.verification_receipt,
          verifier_id: 'verifier_alice_smith',
        },
      },
      { ...writerFenceEvent, credential_owner_id: 'credential_alice_smith' },
    ]
    for (const fixture of invalidSchemaFixtures) expect(validateEvidence(fixture)).toBe(false)

    const mismatchedMain = structuredClone(approvalSet)
    fixtureAt(mismatchedMain, 1).approval_payload.main_sha = gitSha('c')
    expect(validateApprovalSet(mismatchedMain, '2026-08-09T00:30:00Z')).toContain(
      'mismatched approval_payload.main_sha',
    )

    const crossRecordSelfApproval = structuredClone(approvalSet)
    fixtureAt(crossRecordSelfApproval, 1).approval_payload.actor_principal_id = principal('b')
    expect(validateApprovalSet(crossRecordSelfApproval, '2026-08-09T00:30:00Z')).toContain(
      'cross-record self approval',
    )

    const replayedNonce = structuredClone(approvalSet)
    fixtureAt(replayedNonce, 1).approval_payload.nonce_sha256 = fixtureAt(
      replayedNonce,
      0,
    ).approval_payload.nonce_sha256
    expect(validateApprovalSet(replayedNonce, '2026-08-09T00:30:00Z')).toContain(
      'replayed approval_payload.nonce_sha256',
    )

    const badSignature = structuredClone(approvalSet)
    fixtureAt(badSignature, 1).verification_receipt.signature_payload_digest_sha256 = sha('f')
    expect(validateApprovalSet(badSignature, '2026-08-09T00:30:00Z')).toContain(
      'signature payload mismatch',
    )
    expect(validateApprovalSet(approvalSet, '2026-08-09T02:00:00Z')).toContain('expired approval')

    expect(approvalSetDigest([...approvalSet].reverse())).toBe(validApprovalSetDigest)
    const tamperedSet = structuredClone(approvalSet)
    fixtureAt(tamperedSet, 0).verification_receipt.verification_receipt_digest_sha256 = sha('f')
    expect(approvalSetDigest(tamperedSet)).not.toBe(validApprovalSetDigest)
    expect(invariants.approval_set_digest).toMatchObject({
      canonicalization: 'RFC8785',
      digest: 'sha256',
      included: 'entire_approval_receipt_record',
    })
  })

  it('enforces authority, succession, and progression lifecycle order', () => {
    expect(lineageSequence.every((record) => validateEvidence(record))).toBe(true)
    expect(progressionSequence.every((record) => validateEvidence(record))).toBe(true)
    expect(validateLifecycle([...approvalSet, ...lineageSequence, ...progressionSequence])).toEqual(
      [],
    )

    expect(
      validateLifecycle([...approvalSet, makeLineageEvent('succession_consumed', 1)]),
    ).toContain('invalid succession consumption')
    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeLineageEvent('succession_consumed', 4),
      ]),
    ).toContain('invalid succession consumption')
    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeProgressionEvent('round_state_recorded', 1, { round_state: 'finding_free' }),
      ]),
    ).toContain('orphan round state')

    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10),
        makeProgressionEvent('round_state_recorded', 11, { round_state: 'finding_free' }),
      ]),
    ).toContain('invalid round transition')

    const secondProgression = makeProgressionEvent('progression_authority_issued', 13, {
      progression_id: typedId('progression', 'f'),
      target_head_sha: gitSha('c'),
      round: 2,
    })
    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10),
        makeProgressionEvent('round_state_recorded', 11, {
          round_state: 'evaluation_completed',
        }),
        makeProgressionEvent('round_state_recorded', 12, {
          round_state: 'completed_with_findings',
        }),
        secondProgression,
      ]),
    ).toContain('active progression exists')

    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10, {
          succession_id: typedId('succession', 'f'),
        }),
      ]),
    ).toContain('progression without consumed succession')

    expect(
      validateLifecycle([
        ...approvalSet,
        { ...makeLineageEvent('succession_issued', 2), target_pr: 401 },
      ]),
    ).toContain('approval set binding mismatch: target_pr')

    expect(
      validateEvidence(
        makeProgressionEvent('progression_authority_issued', 1, {
          round_state: 'evaluation_completed',
        }),
      ),
    ).toBe(false)
    expect(
      validateEvidence(makeProgressionEvent('round_state_recorded', 1, { writer_generation: 2 })),
    ).toBe(false)
    expect(invariants.lineage_lifecycle.consumption_atomicity).toBe(
      'compare_and_set_unconsumed_to_consumed',
    )
  })

  it('keeps an attempt tuple stable and unique across attempt IDs', () => {
    const lifecycleContext = [...approvalSet, ...lineageSequence, ...activeProgressionSequence]
    const terminalAttempt = {
      ...attemptEvent,
      ...eventEnvelope(21),
      event_type: 'attempt_succeeded',
    }
    expect(validateLifecycle([...lifecycleContext, attemptEvent, terminalAttempt])).toEqual([])

    const reusedTuple = {
      ...attemptEvent,
      ...eventEnvelope(22),
      attempt_id: typedId('attempt', 'f'),
    }
    expect(validateLifecycle([...lifecycleContext, attemptEvent, reusedTuple])).toContain(
      'attempt tuple reused',
    )

    const changedTuple = { ...terminalAttempt, ...eventEnvelope(23), run_attempt: 2 }
    expect(validateLifecycle([...lifecycleContext, attemptEvent, changedTuple])).toContain(
      'attempt tuple changed',
    )

    expect(
      validateLifecycle([
        ...approvalSet,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10),
        attemptEvent,
      ]),
    ).toContain('attempt without active finding-free progression')

    expect(validateLifecycle([...lifecycleContext, { ...attemptEvent, target_pr: 401 }])).toContain(
      'attempt progression binding mismatch: target_pr',
    )
    expect(invariants.attempt_tuple_uniqueness.maps_to_exactly_one).toBe('attempt_id')
    expect(invariants.max_attempts_per_round).toBe(3)
    expect(invariants.max_attempts_per_lineage).toBe(15)
  })

  it('binds the unknown-success barrier to one exact writer and Check identity', () => {
    expect(writerSequence.every((record) => validateEvidence(record))).toBe(true)
    expect(validateUnknownSuccessSequence(writerSequence)).toEqual([])

    const withoutQuiescence = writerSequence.filter(
      (record) => record.event_type !== 'quiescence_confirmed',
    )
    expect(validateUnknownSuccessSequence(withoutQuiescence)).toContain(
      'writer event sequence mismatch',
    )

    const mixedCheck = structuredClone(writerSequence)
    fixtureAt(mixedCheck, 5).check_run_id = 1001
    expect(validateUnknownSuccessSequence(mixedCheck)).toContain(
      'writer identity mismatch: check_run_id',
    )

    const wrongDigest = structuredClone(writerSequence)
    fixtureAt(wrongDigest, 6).completed_barrier_digest_sha256 = sha('f')
    expect(validateUnknownSuccessSequence(wrongDigest)).toContain('writer barrier digest mismatch')

    const wrongObservedStatus = {
      ...writerSequence[4],
      observed_check_status: 'failure',
    }
    expect(validateEvidence(wrongObservedStatus)).toBe(false)
    expect(
      validateEvidence({
        ...writerSequence[0],
        completed_barrier_digest_sha256: completedBarrierDigest,
      }),
    ).toBe(false)
    expect(validateEvidence({ ...writerSequence[0], observed_check_status: 'success' })).toBe(false)
    expect(invariants.unknown_success_without_valid_barrier).toBe('hold_activation_blocked')
  })

  it('couples projection status and reason and binds the completed barrier', () => {
    expect(validateEvidence(projectionEvent)).toBe(true)
    expect(
      validateEvidence({
        ...projectionEvent,
        check_status: 'success',
        check_reason: 'finding_free',
      }),
    ).toBe(true)
    for (const checkReason of [
      'activation_blocked',
      'rollback',
      'stale_inventory',
      'unknown_success_recovery',
    ]) {
      expect(
        validateEvidence({
          ...projectionEvent,
          check_status: 'success',
          check_reason: checkReason,
        }),
        checkReason,
      ).toBe(false)
    }
    expect(
      validateEvidence({
        ...projectionEvent,
        check_status: 'failure',
        check_reason: 'finding_free',
      }),
    ).toBe(false)
    for (const field of invariants.projection_required_bindings) {
      const fixture = Object.fromEntries(
        Object.entries(projectionEvent).filter(([key]) => key !== field),
      )
      expect(validateEvidence(fixture), field).toBe(false)
    }
  })

  it('fixes stage order and scopes HOLD without reopening policy review', () => {
    expect(invariants.stage_order).toEqual([
      'issue_177_policy',
      'issue_178_entry_gate',
      'issue_178_non_privileged_implementation',
      'issue_179_non_privileged_bootstrap',
      'runtime_activation_gate',
      'privileged_recovery',
    ])
    expect(invariants.hold_scopes.issue_178_entry_gate).toContain(
      'issue_363_human_readback_missing',
    )
    expect(invariants.hold_scopes.runtime_activation_gate).toEqual(
      expect.arrayContaining([
        'self_review_prevention_missing',
        'approval_receipt_invalid',
        'writer_barrier_missing',
      ]),
    )
    for (const [label, source] of [
      ['ADR', adrSource],
      ['Runbook', runbookSource],
      ['Issue', issueSource],
    ] as const) {
      expectConceptsInOrder(source, invariants.stage_order, `${label} stage order`)
      expect(source).toMatch(/#363[\s\S]{0,200}(?:同期|sync)[\s\S]{0,120}readback/)
    }
  })

  it('uses one schema SSOT and freezes both terminal source PRs', () => {
    for (const source of [adrSource, runbookSource, issueSource]) {
      expect(source).toContain(schemaPath)
      expect(source).not.toMatch(/```yaml\nrecovery_evidence_v1:/)
      expect(source).not.toContain('canonical_finding_ids:')
    }
    const ids = lineageAnchor.finding_ids
    expect(ids).toHaveLength(9)
    expect(new Set(ids).size).toBe(9)
    expect(createHash('sha256').update(ids.join('\n')).digest('hex')).toBe(
      lineageAnchor.finding_digest,
    )
    for (const value of [
      'e6c891ecde1ba3f51b739361d3cd3de4433835a3',
      '1239936947aed0f198216a2c8bf4be3177eb2223',
      'fbd5250251ce42d2d1505c685e3f01459d979c0e',
      '514d8c64d252b22fb84f7b7834ae690025896882',
    ]) {
      expect(adrSource).toContain(value)
      expect(runbookSource).toContain(value)
    }
    for (const source of [adrSource, runbookSource, agentsSource]) {
      expect(source).toContain('PR #355')
      expect(source).toContain('PR #361')
      expect(source).toContain('第6巡')
      expect(source).toContain('cherry-pick')
      expect(source).toMatch(/workflow\s+dispatch/)
    }
  })

  it('documents exact Check readback and the rollback barrier before controller stop', () => {
    const concepts = [
      '上位writer generationを取得',
      '新規outbound success書込みを遮断',
      'drainを開始',
      'quiescenceを確認',
      '同一Check Run IDのsuccessをreadback',
      'required Checkを`failure`へ投影',
      'failureをreadback',
      'controllerを停止またはrevert',
      '最終failure',
    ]
    for (const [label, source] of [
      ['ADR', adrSource],
      ['Runbook', runbookSource],
      ['Issue', issueSource],
    ] as const) {
      expectConceptsInOrder(source, concepts, `${label} rollback barrier`)
    }
  })

  it('keeps policy review separate from runtime proof and human approval incomplete', () => {
    expect(issueSource).toContain('github_issue: 362')
    expect(issueSource).toContain(
      '- [ ] Security、Operations、Repository Ownerによる方針文書の独立確認を得る',
    )
    expect(adrSource).toContain('ISSUE-177 policy acceptance pending')
    expect(adrSource).not.toContain('ISSUE-177 accepted policy')
    expect(adrSource).toContain('ISSUE-177は完了できる')
    expect(runbookSource).toContain('ISSUE-177を再び修正loopへ戻さない')
    expect(issueSource).toContain('ISSUE-177は完了できる')
    expect(agentsSource).toContain('回復は文書だけで証明しない')
  })
})
