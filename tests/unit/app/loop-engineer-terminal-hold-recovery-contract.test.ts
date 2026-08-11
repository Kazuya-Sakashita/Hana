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
    const entries = Object.entries(value).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0,
    )
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

const target = {
  target_issue: 364,
  target_pr: 400,
  main_sha: gitSha('a'),
  target_head_sha: gitSha('b'),
}

const lineageId = typedId('lineage', 'a')
const successionId = typedId('succession', 'b')
const authorityId = typedId('authority', 'c')
const progressionId = typedId('progression', 'd')
const attemptId = typedId('attempt', 'e')
const barrierId = typedId('barrier', 'f')

const lineageAnchor = {
  schema_version: 'recovery_evidence_v1',
  record_type: 'lineage_anchor',
  repository: 'Kazuya-Sakashita/Hana',
  lineage_id: lineageId,
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

const recordReference = {
  schema_version: 'recovery_evidence_v1',
  repository: 'Kazuya-Sakashita/Hana',
  lineage_id: lineageId,
  lineage_anchor_digest_sha256: digest(lineageAnchor),
}

type EvaluationDecision = 'go' | 'hold'

interface ApprovalOptions {
  binding?: typeof target
  decision?: EvaluationDecision
  p0Count?: number
  p1Count?: number
  approvalRunCharacter?: string
  evaluationCharacter?: string
}

function makeApprovalReceipt(
  role: string,
  actorCharacter: string,
  approvalCharacter: string,
  nonceCharacter: string,
  options: ApprovalOptions = {},
) {
  const binding = options.binding ?? target
  const decision = options.decision ?? 'go'
  const approvalPayload = {
    ...binding,
    succession_id: successionId,
    finding_digest: lineageAnchor.finding_digest,
    decision,
    p0_count: options.p0Count ?? 0,
    p1_count: options.p1Count ?? (decision === 'hold' ? 1 : 0),
    evaluation_digest_sha256: sha(options.evaluationCharacter ?? approvalCharacter),
    role,
    actor_principal_kind: 'agent',
    actor_principal_id: principal(actorCharacter),
    requester_principal_id: principal('b'),
    issuer_principal_id: principal('c'),
    approval_id: typedId('approval', approvalCharacter),
    approval_run_id: typedId('approvalrun', options.approvalRunCharacter ?? 'a'),
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

function makeOwnerAuthorizationReceipt(binding = target, authorizationCharacter = 'a') {
  const authorizationPayload = {
    ...binding,
    max_round: 5,
    decision: 'authorize',
    owner_principal_kind: 'human',
    owner_principal_id: principal('a'),
    environment: 'hana-merge-human-approval',
    authorization_id: typedId('authorization', authorizationCharacter),
    workflow_run_id: 200,
    check_run_id: 300,
    check_name: 'review-round-exception',
    issued_at: '2026-08-09T00:00:00Z',
    expires_at: '2026-08-09T01:00:00Z',
    nonce_sha256: sha(authorizationCharacter),
  }
  const signatureInput = { ...recordReference, authorization_payload: authorizationPayload }

  return {
    ...recordReference,
    record_type: 'owner_authorization_receipt',
    authorization_payload: authorizationPayload,
    verification_receipt: {
      signature_payload_digest_sha256: digest(signatureInput),
      verifier_id: typedId('verifier', 'b'),
      verification_receipt_digest_sha256: sha('e'),
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
const ownerAuthorizationReceipt = makeOwnerAuthorizationReceipt()
const ownerAuthorizationDigest = digest(ownerAuthorizationReceipt)
const baseEvidenceContext: Array<Record<string, unknown>> = [
  lineageAnchor,
  ownerAuthorizationReceipt,
  ...approvalSet,
]

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

function makeLineageEvent(
  eventType: string,
  sequence: number,
  extension: Record<string, unknown> = {},
) {
  return {
    ...recordReference,
    ...eventEnvelope(sequence),
    record_type: 'lineage_event',
    event_type: eventType,
    authority_id: authorityId,
    succession_id: successionId,
    ...target,
    approval_set_digest_sha256: validApprovalSetDigest,
    owner_authorization_digest_sha256: ownerAuthorizationDigest,
    ...extension,
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
    owner_authorization_digest_sha256: ownerAuthorizationDigest,
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
  owner_authorization_digest_sha256: ownerAuthorizationDigest,
  attempt_id: attemptId,
  run_id: 100,
  run_attempt: 1,
  oidc_jti_sha256: sha('c'),
}

const writerIdentity = {
  ...recordReference,
  record_type: 'writer_fence_event',
  barrier_id: barrierId,
  authority_id: authorityId,
  succession_id: successionId,
  target_pr: target.target_pr,
  target_head_sha: target.target_head_sha,
  main_sha: target.main_sha,
  progression_id: progressionId,
  attempt_id: attemptId,
  round: 1,
  approval_set_digest_sha256: validApprovalSetDigest,
  owner_authorization_digest_sha256: ownerAuthorizationDigest,
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
  authority_id: authorityId,
  succession_id: successionId,
  target_pr: target.target_pr,
  target_head_sha: target.target_head_sha,
  main_sha: target.main_sha,
  progression_id: progressionId,
  attempt_id: attemptId,
  round: 1,
  approval_set_digest_sha256: validApprovalSetDigest,
  owner_authorization_digest_sha256: ownerAuthorizationDigest,
  github_app_id: writerIdentity.github_app_id,
  check_name: 'merge-eligibility',
  check_run_id: writerIdentity.check_run_id,
  check_status: 'failure',
  check_reason: 'activation_blocked',
  writer_generation: writerIdentity.writer_generation,
  fencing_token_sha256: writerIdentity.fencing_token_sha256,
  completed_barrier_digest_sha256: completedBarrierDigest,
}

function buildSuccessfulTwoRoundTrace() {
  const roundOneApprovalSet = [
    makeApprovalReceipt('security', 'd', '1', '1', {
      decision: 'hold',
      p1Count: 1,
      approvalRunCharacter: '1',
    }),
    makeApprovalReceipt('operations', 'e', '2', '2', {
      decision: 'hold',
      p1Count: 1,
      approvalRunCharacter: '1',
    }),
    makeApprovalReceipt('repository_owner', 'f', '3', '3', {
      decision: 'hold',
      p1Count: 1,
      approvalRunCharacter: '1',
    }),
  ]
  const roundOneApprovalDigest = approvalSetDigest(roundOneApprovalSet)
  const roundTwoTarget = { ...target, target_head_sha: gitSha('c') }
  const roundTwoApprovalSet = [
    makeApprovalReceipt('security', '1', '4', '4', {
      binding: roundTwoTarget,
      approvalRunCharacter: '2',
    }),
    makeApprovalReceipt('operations', '2', '5', '5', {
      binding: roundTwoTarget,
      approvalRunCharacter: '2',
    }),
    makeApprovalReceipt('repository_owner', '3', '6', '6', {
      binding: roundTwoTarget,
      approvalRunCharacter: '2',
    }),
  ]
  const roundTwoApprovalDigest = approvalSetDigest(roundTwoApprovalSet)
  const roundTwoAuthorization = makeOwnerAuthorizationReceipt(roundTwoTarget, 'b')
  const roundTwoAuthorizationDigest = digest(roundTwoAuthorization)
  const roundTwoProgressionId = typedId('progression', '1')
  const roundTwoAttemptId = typedId('attempt', '2')
  const roundTwoBarrierId = typedId('barrier', '3')

  const lineageEvents = [
    makeLineageEvent('recovery_authority_issued', 1, {
      approval_set_digest_sha256: roundOneApprovalDigest,
    }),
    makeLineageEvent('succession_issued', 2, {
      approval_set_digest_sha256: roundOneApprovalDigest,
    }),
    makeLineageEvent('succession_consumed', 3, {
      approval_set_digest_sha256: roundOneApprovalDigest,
    }),
  ]
  const roundOneProgression = [
    makeProgressionEvent('progression_authority_issued', 10, {
      approval_set_digest_sha256: roundOneApprovalDigest,
    }),
    makeProgressionEvent('round_state_recorded', 11, {
      approval_set_digest_sha256: roundOneApprovalDigest,
      round_state: 'evaluation_completed',
    }),
    makeProgressionEvent('round_state_recorded', 12, {
      approval_set_digest_sha256: roundOneApprovalDigest,
      round_state: 'completed_with_findings',
    }),
    makeProgressionEvent('progression_authority_revoked', 13, {
      approval_set_digest_sha256: roundOneApprovalDigest,
    }),
  ]
  const roundTwoBinding = {
    progression_id: roundTwoProgressionId,
    predecessor_progression_id: progressionId,
    target_head_sha: roundTwoTarget.target_head_sha,
    round: 2,
    approval_set_digest_sha256: roundTwoApprovalDigest,
    owner_authorization_digest_sha256: roundTwoAuthorizationDigest,
  }
  const roundTwoProgression = [
    makeProgressionEvent('progression_authority_issued', 20, roundTwoBinding),
    makeProgressionEvent('round_state_recorded', 21, {
      ...roundTwoBinding,
      round_state: 'evaluation_completed',
    }),
    makeProgressionEvent('round_state_recorded', 22, {
      ...roundTwoBinding,
      round_state: 'finding_free',
    }),
    makeProgressionEvent('fencing_generation_issued', 23, {
      ...roundTwoBinding,
      writer_generation: 2,
    }),
  ]
  const roundTwoAttemptBase = {
    ...attemptEvent,
    progression_id: roundTwoProgressionId,
    target_head_sha: roundTwoTarget.target_head_sha,
    main_sha: roundTwoTarget.main_sha,
    round: 2,
    approval_set_digest_sha256: roundTwoApprovalDigest,
    owner_authorization_digest_sha256: roundTwoAuthorizationDigest,
    attempt_id: roundTwoAttemptId,
    run_id: 200,
    oidc_jti_sha256: sha('4'),
  }
  const roundTwoAttempts = [
    { ...roundTwoAttemptBase, ...eventEnvelope(24), event_type: 'attempt_started' },
    { ...roundTwoAttemptBase, ...eventEnvelope(25), event_type: 'attempt_succeeded' },
  ]
  const successWriterIdentity = {
    ...writerIdentity,
    barrier_id: roundTwoBarrierId,
    target_head_sha: roundTwoTarget.target_head_sha,
    main_sha: roundTwoTarget.main_sha,
    progression_id: roundTwoProgressionId,
    attempt_id: roundTwoAttemptId,
    round: 2,
    approval_set_digest_sha256: roundTwoApprovalDigest,
    owner_authorization_digest_sha256: roundTwoAuthorizationDigest,
    fencing_token_sha256: sha('5'),
    credential_owner_id: typedId('credential', '6'),
    check_run_id: 2000,
  }
  const barrierEvents: Array<Record<string, unknown>> = [
    'generation_acquired',
    'lower_generation_blocked',
    'drain_started',
    'quiescence_confirmed',
  ].map((eventType, index) => ({
    ...successWriterIdentity,
    ...eventEnvelope(30 + index),
    event_type: eventType,
  }))
  const successBarrierDigest = barrierDigest(barrierEvents)
  barrierEvents[3] = {
    ...fixtureAt(barrierEvents, 3),
    completed_barrier_digest_sha256: successBarrierDigest,
  }
  const successProjection = {
    ...projectionEvent,
    ...eventEnvelope(40),
    barrier_id: roundTwoBarrierId,
    target_head_sha: roundTwoTarget.target_head_sha,
    main_sha: roundTwoTarget.main_sha,
    progression_id: roundTwoProgressionId,
    attempt_id: roundTwoAttemptId,
    round: 2,
    approval_set_digest_sha256: roundTwoApprovalDigest,
    owner_authorization_digest_sha256: roundTwoAuthorizationDigest,
    check_run_id: 2000,
    check_status: 'success',
    check_reason: 'finding_free',
    fencing_token_sha256: sha('5'),
    completed_barrier_digest_sha256: successBarrierDigest,
  }

  return {
    records: [
      lineageAnchor,
      ownerAuthorizationReceipt,
      roundTwoAuthorization,
      ...roundOneApprovalSet,
      ...roundTwoApprovalSet,
      ...lineageEvents,
      ...roundOneProgression,
      ...roundTwoProgression,
      ...roundTwoAttempts,
      ...barrierEvents,
      successProjection,
    ] as Array<Record<string, unknown>>,
    roundTwoProgressionId,
    successProjection,
  }
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
      Date.parse(String(getPath(record, 'approval_payload.issued_at'))) > Date.parse(evaluationAt)
    ) {
      errors.push('approval issued after evaluation')
    }
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

function validateOwnerAuthorization(
  record: Record<string, unknown>,
  evaluationAt: string,
): string[] {
  const errors: string[] = []
  if (!validateEvidence(record)) errors.push('invalid owner authorization schema')
  const issuedAt = Date.parse(String(getPath(record, 'authorization_payload.issued_at')))
  const expiresAt = Date.parse(String(getPath(record, 'authorization_payload.expires_at')))
  const evaluatedAt = Date.parse(evaluationAt)
  if (issuedAt > evaluatedAt) errors.push('owner authorization issued after evaluation')
  if (expiresAt <= evaluatedAt) errors.push('expired owner authorization')
  const signatureInput = {
    schema_version: record.schema_version,
    repository: record.repository,
    lineage_id: record.lineage_id,
    lineage_anchor_digest_sha256: record.lineage_anchor_digest_sha256,
    authorization_payload: record.authorization_payload,
  }
  if (
    digest(signatureInput) !==
    getPath(record, 'verification_receipt.signature_payload_digest_sha256')
  ) {
    errors.push('owner authorization signature mismatch')
  }
  return errors
}

function validateLifecycle(records: Array<Record<string, unknown>>): string[] {
  const errors: string[] = []
  const eventRecords = records.filter((record) => record.event_id !== undefined)
  const ordered = [...eventRecords].sort(
    (left, right) => Number(left.event_sequence) - Number(right.event_sequence),
  )
  const evaluationAt = String(ordered.at(-1)?.event_at ?? '2026-08-09T00:30:00Z')
  const anchorsByLineage = new Map<string, Array<Record<string, unknown>>>()
  for (const record of records.filter((candidate) => candidate.record_type === 'lineage_anchor')) {
    const key = String(record.lineage_id)
    anchorsByLineage.set(key, [...(anchorsByLineage.get(key) ?? []), record])
  }
  const anchors = new Map<string, Record<string, unknown>>()
  for (const [lineage, candidates] of anchorsByLineage) {
    if (candidates.length !== 1) errors.push('lineage must have exactly one anchor')
    const anchor = candidates[0]
    if (anchor) anchors.set(lineage, anchor)
  }
  for (const record of records.filter((candidate) => candidate.record_type !== 'lineage_anchor')) {
    const anchor = anchors.get(String(record.lineage_id))
    if (!anchor) {
      errors.push('missing lineage anchor')
      continue
    }
    if (record.lineage_anchor_digest_sha256 !== digest(anchor)) {
      errors.push('lineage anchor digest mismatch')
    }
    for (const field of invariants.lineage_anchor_binding.event_fields_equal_anchor as string[]) {
      if (record[field] !== undefined && record[field] !== anchor[field]) {
        errors.push(`lineage anchor field mismatch: ${field}`)
      }
    }
    const payloadPrefix =
      record.record_type === 'approval_receipt'
        ? 'approval_payload'
        : record.record_type === 'owner_authorization_receipt'
          ? 'authorization_payload'
          : undefined
    if (payloadPrefix) {
      for (const field of ['target_issue', 'target_pr']) {
        if (getPath(record, `${payloadPrefix}.${field}`) !== anchor[field]) {
          errors.push(`lineage anchor payload mismatch: ${field}`)
        }
      }
      if (
        payloadPrefix === 'approval_payload' &&
        getPath(record, 'approval_payload.succession_id') !== anchor.succession_id
      ) {
        errors.push('lineage anchor payload mismatch: succession_id')
      }
    }
  }

  const ownerAuthorizations = new Map<string, Record<string, unknown>>()
  for (const record of records.filter(
    (candidate) => candidate.record_type === 'owner_authorization_receipt',
  )) {
    if (validateOwnerAuthorization(record, evaluationAt).length === 0) {
      const authorizationDigest = digest(record)
      if (ownerAuthorizations.has(authorizationDigest)) {
        errors.push('duplicate owner authorization receipt')
      }
      ownerAuthorizations.set(authorizationDigest, record)
    }
  }

  const approvalGroups = new Map<string, Array<Record<string, unknown>>>()
  for (const record of records.filter(
    (candidate) => candidate.record_type === 'approval_receipt',
  )) {
    const key = String(getPath(record, 'approval_payload.approval_run_id'))
    approvalGroups.set(key, [...(approvalGroups.get(key) ?? []), record])
  }
  const approvalSets = new Map<string, Array<Record<string, unknown>>>()
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
      successionIds: Set<unknown>
      consumptions: number
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
      progressionId: unknown
      predecessorProgressionId?: unknown
      round: number
      targetHeadSha: unknown
    }
  >()
  const activeProgressions = new Map<string, string>()
  const latestProgressions = new Map<string, string>()

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

  function validateOwnerBinding(record: Record<string, unknown>) {
    const authorization = ownerAuthorizations.get(String(record.owner_authorization_digest_sha256))
    if (!authorization) {
      errors.push('unknown owner authorization digest')
      return
    }
    for (const field of ['target_issue', 'target_pr', 'main_sha', 'target_head_sha']) {
      if (
        record[field] !== undefined &&
        record[field] !== getPath(authorization, `authorization_payload.${field}`)
      ) {
        errors.push(`owner authorization binding mismatch: ${field}`)
      }
    }
    if (
      record.round !== undefined &&
      Number(record.round) > Number(getPath(authorization, 'authorization_payload.max_round'))
    ) {
      errors.push('owner authorization round exceeded')
    }
  }

  function approvalSetIsFindingFree(record: Record<string, unknown>): boolean {
    const set = approvalSets.get(String(record.approval_set_digest_sha256))
    return Boolean(
      set?.every(
        (receipt) =>
          getPath(receipt, 'approval_payload.decision') === 'go' &&
          getPath(receipt, 'approval_payload.p0_count') === 0 &&
          getPath(receipt, 'approval_payload.p1_count') === 0,
      ),
    )
  }

  for (const record of ordered) {
    if (eventIds.has(record.event_id)) errors.push('duplicate event_id')
    if (eventSequences.has(record.event_sequence)) errors.push('duplicate event_sequence')
    eventIds.add(record.event_id)
    eventSequences.add(record.event_sequence)

    if (record.record_type === 'lineage_event') {
      validateApprovalBinding(record)
      validateOwnerBinding(record)
      const key = String(record.lineage_id)
      const state = lineageStates.get(key) ?? {
        recoveryAuthority: 'absent' as const,
        succession: 'absent' as const,
        successionIds: new Set<unknown>(),
        consumptions: 0,
      }
      state.successionIds.add(record.succession_id)
      if (
        state.successionIds.size > invariants.lineage_anchor_binding.max_successions_per_lineage
      ) {
        errors.push('multiple successions for lineage')
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
          state.consumptions += 1
          if (state.consumptions > invariants.lineage_lifecycle.max_consumptions_per_lineage) {
            errors.push('multiple succession consumptions for lineage')
          }
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
      validateOwnerBinding(record)
      const lineageKey = String(record.lineage_id)
      const key = `${lineageKey}:${record.progression_id}`
      const state = progressionStates.get(key) ?? {
        authority: 'absent' as const,
        fencing: 'absent' as const,
        roundState: 'absent' as const,
        progressionId: record.progression_id,
        predecessorProgressionId: record.predecessor_progression_id,
        round: Number(record.round),
        targetHeadSha: record.target_head_sha,
      }
      state.bindings = compareBindings(
        record,
        state.bindings,
        invariants.progression_lifecycle.binding_fields,
        'progression',
      )

      switch (record.event_type) {
        case 'progression_authority_issued': {
          const lineageState = lineageStates.get(lineageKey)
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
          const predecessorKey = latestProgressions.get(lineageKey)
          if (!predecessorKey) {
            if (record.round !== 1 || record.predecessor_progression_id !== undefined) {
              errors.push('first progression must start at round 1 without predecessor')
            }
          } else {
            const predecessor = progressionStates.get(predecessorKey)
            if (record.predecessor_progression_id !== predecessor?.progressionId) {
              errors.push('successor predecessor mismatch')
            }
            if (predecessor?.roundState !== 'completed_with_findings') {
              errors.push('successor requires completed-with-findings predecessor')
            }
            if (predecessor?.authority !== 'revoked') {
              errors.push('successor requires revoked predecessor authority')
            }
            if (predecessor?.fencing === 'active') {
              errors.push('successor requires inactive predecessor fencing')
            }
            if (record.target_head_sha === predecessor?.targetHeadSha) {
              errors.push('successor must use a different head')
            }
            if (Number(record.round) !== Number(predecessor?.round) + 1) {
              errors.push('successor round must increment by one')
            }
          }
          if (activeProgressions.has(lineageKey)) errors.push('active progression exists')
          if (state.authority !== 'absent') errors.push('duplicate progression authority issue')
          state.authority = 'active'
          activeProgressions.set(lineageKey, key)
          latestProgressions.set(lineageKey, key)
          break
        }
        case 'round_state_recorded': {
          if (state.authority !== 'active') errors.push('orphan round state')
          const allowed = invariants.progression_lifecycle.round_state_transitions[
            state.roundState
          ] as string[]
          if (!allowed.includes(String(record.round_state))) errors.push('invalid round transition')
          if (record.round_state === 'finding_free' && !approvalSetIsFindingFree(record)) {
            errors.push('finding-free state requires three GO receipts with no P0/P1')
          }
          if (
            record.round_state === 'completed_with_findings' &&
            approvalSetIsFindingFree(record)
          ) {
            errors.push('completed-with-findings state requires a HOLD or P0/P1 finding')
          }
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
      validateOwnerBinding(record)
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

function validateSuccessfulTrace(records: Array<Record<string, unknown>>): string[] {
  const errors = validateLifecycle(records)
  for (const record of records) {
    const recordType = String(record.record_type)
    if (!validateEvidence(record)) {
      errors.push(`invalid schema in complete trace: ${recordType}`)
    }
  }
  const successProjections = records.filter(
    (record) => record.record_type === 'projection_event' && record.check_status === 'success',
  )
  if (successProjections.length !== 1) errors.push('trace requires exactly one success projection')

  for (const projection of successProjections) {
    const projectionSequence = Number(projection.event_sequence)
    const approvals = records.filter(
      (record) =>
        record.record_type === 'approval_receipt' &&
        approvalSetDigest(
          records.filter(
            (candidate) =>
              candidate.record_type === 'approval_receipt' &&
              getPath(candidate, 'approval_payload.approval_run_id') ===
                getPath(record, 'approval_payload.approval_run_id'),
          ),
        ) === projection.approval_set_digest_sha256,
    )
    const approvalRunIds = new Set(
      approvals.map((record) => getPath(record, 'approval_payload.approval_run_id')),
    )
    const selectedApprovals =
      approvalRunIds.size === 1
        ? records.filter(
            (record) =>
              record.record_type === 'approval_receipt' &&
              getPath(record, 'approval_payload.approval_run_id') === [...approvalRunIds][0],
          )
        : []
    if (
      validateApprovalSet(selectedApprovals, String(projection.event_at)).length > 0 ||
      !selectedApprovals.every(
        (record) =>
          getPath(record, 'approval_payload.decision') === 'go' &&
          getPath(record, 'approval_payload.p0_count') === 0 &&
          getPath(record, 'approval_payload.p1_count') === 0,
      )
    ) {
      errors.push('success projection requires three exact-bound GO receipts with no P0/P1')
    }

    const ownerAuthorization = records.find(
      (record) =>
        record.record_type === 'owner_authorization_receipt' &&
        digest(record) === projection.owner_authorization_digest_sha256,
    )
    if (
      !ownerAuthorization ||
      validateOwnerAuthorization(ownerAuthorization, String(projection.event_at)).length > 0
    ) {
      errors.push('success projection requires a valid owner authorization')
    } else {
      for (const field of ['target_pr', 'main_sha', 'target_head_sha']) {
        if (projection[field] !== getPath(ownerAuthorization, `authorization_payload.${field}`)) {
          errors.push(`success owner authorization mismatch: ${field}`)
        }
      }
      if (Number(projection.round) > 5) errors.push('success exceeds owner maximum round')
    }

    const progressionEvents = records.filter(
      (record) =>
        record.record_type === 'progression_event' &&
        record.progression_id === projection.progression_id,
    )
    const findingFree = progressionEvents.find(
      (record) =>
        record.event_type === 'round_state_recorded' && record.round_state === 'finding_free',
    )
    const fencingIssued = progressionEvents.find(
      (record) => record.event_type === 'fencing_generation_issued',
    )
    if (!findingFree || !fencingIssued) {
      errors.push('success requires active finding-free progression with fencing')
    }

    const attemptEvents = records
      .filter(
        (record) =>
          record.record_type === 'attempt_event' && record.attempt_id === projection.attempt_id,
      )
      .sort((left, right) => Number(left.event_sequence) - Number(right.event_sequence))
    const attemptStarted = attemptEvents.find((record) => record.event_type === 'attempt_started')
    const attemptSucceeded = attemptEvents.find(
      (record) => record.event_type === 'attempt_succeeded',
    )
    if (!attemptStarted || !attemptSucceeded) {
      errors.push('success projection requires one succeeded attempt')
    }

    const barrierEvents = records
      .filter(
        (record) =>
          record.record_type === 'writer_fence_event' &&
          record.barrier_id === projection.barrier_id,
      )
      .sort((left, right) => Number(left.event_sequence) - Number(right.event_sequence))
    const expectedBarrierTypes = [
      'generation_acquired',
      'lower_generation_blocked',
      'drain_started',
      'quiescence_confirmed',
    ]
    if (
      JSON.stringify(barrierEvents.map((record) => record.event_type)) !==
      JSON.stringify(expectedBarrierTypes)
    ) {
      errors.push('success barrier sequence mismatch')
      continue
    }
    for (const field of invariants.writer_barrier_identity_fields as string[]) {
      if (new Set(barrierEvents.map((record) => record[field])).size !== 1) {
        errors.push(`success writer identity mismatch: ${field}`)
      }
    }
    const expectedBarrierDigest = barrierDigest(barrierEvents)
    const quiescence = fixtureAt(barrierEvents, 3)
    if (
      quiescence.completed_barrier_digest_sha256 !== expectedBarrierDigest ||
      projection.completed_barrier_digest_sha256 !== expectedBarrierDigest
    ) {
      errors.push('success barrier digest mismatch')
    }
    for (const field of invariants.projection_required_bindings as string[]) {
      if (field !== 'completed_barrier_digest_sha256' && projection[field] !== quiescence[field]) {
        errors.push(`success projection binding mismatch: ${field}`)
      }
    }
    if (
      !attemptStarted ||
      Number(attemptStarted.event_sequence) >= Number(fixtureAt(barrierEvents, 0).event_sequence)
    ) {
      errors.push('pre-success barrier is not reachable after attempt creation')
    }
    if (
      !attemptSucceeded ||
      Number(attemptSucceeded.event_sequence) >= projectionSequence ||
      Number(quiescence.event_sequence) >= projectionSequence
    ) {
      errors.push('success projected before attempt and quiescence completed')
    }
  }

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
  it('validates all eight evidence record types against the machine-readable SSOT', () => {
    for (const fixture of [
      lineageAnchor,
      ownerAuthorizationReceipt,
      approvalReceipt,
      lineageEvent,
      progressionEvent,
      attemptEvent,
      writerFenceEvent,
      projectionEvent,
    ]) {
      expect(validateEvidence(fixture), JSON.stringify(validateEvidence.errors)).toBe(true)
    }
    expect(schema.oneOf).toHaveLength(8)
  })

  it('separates signed approval payload from derived verification receipt', () => {
    expect(invariants.approval_signature.included).toContain('approval_payload')
    expect(invariants.approval_signature.excluded).toEqual(['verification_receipt'])
    expect(validateApprovalSet(approvalSet, '2026-08-09T00:30:00Z')).toEqual([])
    expect(validateOwnerAuthorization(ownerAuthorizationReceipt, '2026-08-09T00:30:00Z')).toEqual(
      [],
    )

    const invalidSchemaFixtures = [
      { ...approvalReceipt, unexpected: true },
      {
        ...approvalReceipt,
        approval_payload: {
          ...approvalReceipt.approval_payload,
          actor_principal_kind: 'human',
        },
      },
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

    const badOwnerSignature = structuredClone(ownerAuthorizationReceipt)
    badOwnerSignature.verification_receipt.signature_payload_digest_sha256 = sha('f')
    expect(validateOwnerAuthorization(badOwnerSignature, '2026-08-09T00:30:00Z')).toContain(
      'owner authorization signature mismatch',
    )
    expect(validateOwnerAuthorization(ownerAuthorizationReceipt, '2026-08-09T02:00:00Z')).toContain(
      'expired owner authorization',
    )

    expect(approvalSetDigest([...approvalSet].reverse())).toBe(validApprovalSetDigest)
    const tamperedSet = structuredClone(approvalSet)
    fixtureAt(tamperedSet, 0).verification_receipt.verification_receipt_digest_sha256 = sha('f')
    expect(approvalSetDigest(tamperedSet)).not.toBe(validApprovalSetDigest)
    expect(invariants.approval_set_digest).toMatchObject({
      canonicalization: 'RFC8785',
      digest: 'sha256',
      included: 'entire_approval_receipt_record',
    })
    expect(canonicalize({ '\ue000': 1, '😀': 2 })).toBe('{"😀":2,"":1}')
  })

  it('enforces authority, succession, and progression lifecycle order', () => {
    expect(lineageSequence.every((record) => validateEvidence(record))).toBe(true)
    expect(progressionSequence.every((record) => validateEvidence(record))).toBe(true)
    expect(
      validateLifecycle([...baseEvidenceContext, ...lineageSequence, ...progressionSequence]),
    ).toEqual([])

    expect(
      validateLifecycle([...baseEvidenceContext, makeLineageEvent('succession_consumed', 1)]),
    ).toContain('invalid succession consumption')
    expect(
      validateLifecycle([
        ...baseEvidenceContext,
        ...lineageSequence,
        makeLineageEvent('succession_consumed', 4),
      ]),
    ).toContain('invalid succession consumption')
    expect(
      validateLifecycle([
        ...baseEvidenceContext,
        ...lineageSequence,
        makeProgressionEvent('round_state_recorded', 1, { round_state: 'finding_free' }),
      ]),
    ).toContain('orphan round state')

    expect(
      validateLifecycle([
        ...baseEvidenceContext,
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
        ...baseEvidenceContext,
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
        ...baseEvidenceContext,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10, {
          succession_id: typedId('succession', 'f'),
        }),
      ]),
    ).toContain('consumed succession binding mismatch: succession_id')

    expect(
      validateLifecycle([
        ...baseEvidenceContext,
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

  it('accepts one consumed succession followed by a fresh-head successor and rejects all five P1 regressions', () => {
    const trace = buildSuccessfulTwoRoundTrace()
    expect(validateSuccessfulTrace(trace.records)).toEqual([])

    const progressionAuthorities = trace.records.filter(
      (record) =>
        record.record_type === 'progression_event' &&
        record.event_type === 'progression_authority_issued',
    )
    expect(progressionAuthorities.map((record) => record.round)).toEqual([1, 2])
    expect(new Set(progressionAuthorities.map((record) => record.target_head_sha)).size).toBe(2)
    expect(
      trace.records.filter(
        (record) =>
          record.record_type === 'lineage_event' && record.event_type === 'succession_consumed',
      ),
    ).toHaveLength(1)

    const duplicateSuccession = structuredClone(trace.records)
    duplicateSuccession.push(
      makeLineageEvent('succession_issued', 4, {
        succession_id: typedId('succession', 'f'),
      }),
    )
    expect(validateLifecycle(duplicateSuccession)).toContain('multiple successions for lineage')

    const tamperedAnchor = structuredClone(trace.records)
    const anchor = tamperedAnchor.find((record) => record.record_type === 'lineage_anchor')
    if (!anchor) throw new Error('missing tamper fixture anchor')
    anchor.finding_count = 8
    expect(validateLifecycle(tamperedAnchor)).toContain('lineage anchor digest mismatch')

    const holdApprovalSet = [
      makeApprovalReceipt('security', 'd', '7', '7', {
        decision: 'hold',
        p1Count: 1,
        approvalRunCharacter: '3',
      }),
      makeApprovalReceipt('operations', 'e', '8', '8', {
        decision: 'hold',
        p1Count: 1,
        approvalRunCharacter: '3',
      }),
      makeApprovalReceipt('repository_owner', 'f', '9', '9', {
        decision: 'hold',
        p1Count: 1,
        approvalRunCharacter: '3',
      }),
    ]
    const holdDigest = approvalSetDigest(holdApprovalSet)
    expect(
      validateLifecycle([
        lineageAnchor,
        ownerAuthorizationReceipt,
        ...approvalSet,
        ...holdApprovalSet,
        ...lineageSequence,
        makeProgressionEvent('progression_authority_issued', 10, {
          approval_set_digest_sha256: holdDigest,
        }),
        makeProgressionEvent('round_state_recorded', 11, {
          approval_set_digest_sha256: holdDigest,
          round_state: 'evaluation_completed',
        }),
        makeProgressionEvent('round_state_recorded', 12, {
          approval_set_digest_sha256: holdDigest,
          round_state: 'finding_free',
        }),
      ]),
    ).toContain('finding-free state requires three GO receipts with no P0/P1')

    const wrongOwner = structuredClone(trace.records)
    const successProjection = wrongOwner.find(
      (record) => record.record_type === 'projection_event' && record.check_status === 'success',
    )
    if (!successProjection) throw new Error('missing success projection fixture')
    successProjection.owner_authorization_digest_sha256 = ownerAuthorizationDigest
    expect(validateSuccessfulTrace(wrongOwner)).toContain(
      'success owner authorization mismatch: target_head_sha',
    )

    const resetRound = structuredClone(trace.records)
    for (const record of resetRound.filter(
      (candidate) =>
        candidate.record_type === 'progression_event' &&
        candidate.progression_id === trace.roundTwoProgressionId,
    )) {
      record.round = 1
      delete record.predecessor_progression_id
    }
    expect(validateLifecycle(resetRound)).toContain('successor round must increment by one')

    const circularActivation = structuredClone(trace.records)
    const roundTwoAttempts = circularActivation.filter(
      (record) =>
        record.record_type === 'attempt_event' &&
        record.progression_id === trace.roundTwoProgressionId,
    )
    Object.assign(fixtureAt(roundTwoAttempts, 0), eventEnvelope(35))
    Object.assign(fixtureAt(roundTwoAttempts, 1), eventEnvelope(36))
    expect(validateSuccessfulTrace(circularActivation)).toContain(
      'pre-success barrier is not reachable after attempt creation',
    )
  })

  it('keeps an attempt tuple stable and unique across attempt IDs', () => {
    const lifecycleContext = [
      ...baseEvidenceContext,
      ...lineageSequence,
      ...activeProgressionSequence,
    ]
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
        ...baseEvidenceContext,
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
      'runtime_pre_activation_gate',
      'privileged_authority_activation',
      'pre_success_gate',
      'success_projection',
    ])
    expect(invariants.hold_scopes.issue_178_entry_gate).toContain(
      'issue_363_human_readback_missing',
    )
    expect(invariants.hold_scopes.runtime_pre_activation_gate).toEqual(
      expect.arrayContaining([
        'solo_owner_authorization_missing',
        'specialist_evaluation_receipt_invalid',
      ]),
    )
    expect(invariants.hold_scopes.pre_success_gate).toContain('writer_barrier_missing')
    expect(invariants.stage_capabilities).toMatchObject({
      runtime_pre_activation_gate: {
        mode: 'verify_only',
        requires_preexisting_progression_or_attempt: false,
      },
      privileged_authority_activation: {
        allows: ['succession_consumption', 'progression_creation', 'attempt_creation'],
      },
      pre_success_gate: {
        requires: ['active_progression', 'started_attempt'],
      },
      success_projection: {
        requires: expect.arrayContaining(['succeeded_attempt', 'completed_writer_barrier']),
      },
    })
    expect(invariants.governance).toMatchObject({
      mode: 'solo_maintainer',
      human_owner_count: 1,
      human_owner_authorization: {
        prevent_self_review: false,
        can_admins_bypass: false,
      },
      specialist_evaluations: {
        required_roles: ['security', 'operations', 'repository_owner'],
        actor_principal_kind: 'agent',
        fresh_context_per_role: true,
        same_head_required: true,
      },
      round_4_remediation_policy: {
        round_4_result: 'hold',
        round_4_result_preserved: true,
        max_remediation_batches: 1,
        intermediate_heads_are_review_candidates: false,
        round_5: {
          requires_exact_bound_exception: true,
          max_reviews: 1,
          fresh_context_per_role: true,
          same_head_required: true,
          p0_or_p1_result: 'terminal_hold_no_round_6',
        },
      },
    })
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

  it('separates solo owner authorization from agent evaluation and runtime proof', () => {
    expect(issueSource).toContain('github_issue: 362')
    expect(issueSource).toContain(
      '- [ ] Repository Ownerの明示GOと、Security、Operations、Repository Owner観点のfreshな独立agent評価を同じheadで得る',
    )
    expect(adrSource).toContain('ISSUE-177 policy acceptance pending')
    expect(adrSource).not.toContain('ISSUE-177 accepted policy')
    expect(adrSource).toContain('solo_maintainer')
    expect(adrSource).toContain('悪意あるOwner')
    expect(runbookSource).toContain('人間のseparation of duties')
    for (const source of [agentsSource, adrSource, runbookSource, issueSource]) {
      expect(source).toContain('Round 4結果')
      expect(source).toMatch(/bounded\s+remediation batch/)
      expect(source).toContain('Round 5')
      expect(source).toContain('Round 6')
    }
    expect(adrSource).toContain('ISSUE-177は完了できる')
    expect(runbookSource).toContain('ISSUE-177を再び修正loopへ戻さない')
    expect(issueSource).toContain('ISSUE-177は完了できる')
    expect(agentsSource).toContain('回復は文書だけで証明しない')
    expect(agentsSource).toContain('solo-maintainer境界を偽装しない')
  })
})
