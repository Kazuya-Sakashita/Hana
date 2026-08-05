import type { SpecialistReviewGateReason } from './specialist-review-gate'
import {
  verifyReviewRoundException,
  type ReviewRoundExceptionAdapter,
  type ReviewRoundExceptionProof,
} from './github-review-round-exception'
import {
  isTerminalReviewHold,
  parseReviewLineageSupersessionProof,
  reviewLineageRequiresSupersession,
  sameReviewLineageSupersession,
  verifyReviewLineageSupersession,
  type ReviewLineageSupersessionAdapter,
  type ReviewLineageSupersessionProof,
} from './github-review-lineage-supersession'
import {
  classifyMergeEligibility,
  type MergeClassificationInput,
  type MergeDecision,
} from './merge-classifier'

type ReviewGate = MergeClassificationInput['review_gate']

type SpecialistReviewAttestationBase = {
  issue_id: string
  pr_number: number
  merge_base_sha: string
  head_sha: string
  round: number
  change_areas: string[]
  status: 'pass' | 'pending' | 'fail'
  reason: SpecialistReviewGateReason
  required_roles: string[]
  review_gate: ReviewGate
}

export type SpecialistReviewAttestation = SpecialistReviewAttestationBase &
  (
    | { schema_version: 'loop-engineer-review-attestation/v1' }
    | {
        schema_version: 'loop-engineer-review-attestation/v2'
        review_round_exception: ReviewRoundExceptionProof
      }
  )

type GitHubMergeGateInputBase = {
  review_attestation: SpecialistReviewAttestation
  merge_input: MergeClassificationInput
}

export type GitHubMergeGateInput = GitHubMergeGateInputBase &
  (
    | { schema_version: 'loop-engineer-github-gate-input/v2' }
    | {
        schema_version: 'loop-engineer-github-gate-input/v3'
        review_lineage_supersession: ReviewLineageSupersessionProof
      }
  )

export type GitHubMergeGateEvaluation = {
  schema_version: 'loop-engineer-github-gate-evaluation/v2'
  issue_id: string | null
  pr_number: number | null
  head_sha: string | null
  specialist_review_gate: {
    status: 'success' | 'failure'
    reason: string
  }
  merge_eligibility: {
    status: 'success' | 'failure' | 'human_approval_required'
    decision: MergeDecision
    reason: string
  }
  auto_merge_reservation: 'disabled_until_issue_167_human_go'
}

const v2InputFields = ['schema_version', 'review_attestation', 'merge_input'] as const
const v3InputFields = [...v2InputFields, 'review_lineage_supersession'] as const
const v1AttestationFields = [
  'schema_version',
  'issue_id',
  'pr_number',
  'merge_base_sha',
  'head_sha',
  'round',
  'change_areas',
  'status',
  'reason',
  'required_roles',
  'review_gate',
] as const
const v2AttestationFields = [...v1AttestationFields, 'review_round_exception'] as const
const reviewRoundExceptionFields = [
  'schema_version',
  'issue_id',
  'pr_number',
  'merge_base_sha',
  'head_sha',
  'max_round',
] as const
const reviewGateFields = [
  'schema_version',
  'status',
  'reviewed_sha',
  'required_reviewers',
  'completed_reviewers',
  'actionable_findings',
  'completed_roles',
] as const
const specialistReviewReasons = new Set<SpecialistReviewGateReason>([
  'all_required_reviews_passed',
  'invalid_input',
  'unknown_field',
  'unsupported_schema_version',
  'invalid_issue_id',
  'invalid_pr_number',
  'invalid_merge_base_sha',
  'invalid_head_sha',
  'review_round_exceeded',
  'invalid_parallel_slots',
  'invalid_change_areas',
  'risk_classification_missing',
  'unknown_change_area',
  'duplicate_change_area',
  'invalid_reviews',
  'invalid_review',
  'unknown_review_field',
  'unknown_reviewer_role',
  'duplicate_reviewer_role',
  'duplicate_reviewer_instance',
  'reviewer_role_mismatch',
  'review_context_mismatch',
  'reviewer_timeout',
  'invalid_finding',
  'unknown_finding_field',
  'finding_sha_mismatch',
  'review_status_mismatch',
  'reviewer_count_out_of_range',
  'review_sha_mismatch',
  'reviewer_not_read_only',
  'reviewer_not_independent',
  'peer_review_output_visible',
  'required_reviewer_missing',
  'actionable_findings_present',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function hasExactFields<const T extends readonly string[]>(
  value: Record<string, unknown>,
  fields: T,
): boolean {
  return (
    Object.keys(value).every((field) => fields.includes(field as T[number])) &&
    fields.every((field) => Object.hasOwn(value, field))
  )
}

function isUniqueStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 64) &&
    new Set(value).size === value.length
  )
}

function sameStringSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const sortedRight = [...right].sort()
  return [...left].sort().every((value, index) => value === sortedRight[index])
}

function isReviewGate(value: unknown): value is ReviewGate {
  if (!isRecord(value) || !hasExactFields(value, reviewGateFields)) return false
  return (
    value.schema_version === 'loop-engineer-review-gate/v1' &&
    typeof value.status === 'string' &&
    ['pass', 'pending', 'fail'].includes(value.status) &&
    isSha(value.reviewed_sha) &&
    Number.isInteger(value.required_reviewers) &&
    (value.required_reviewers as number) >= 0 &&
    Number.isInteger(value.completed_reviewers) &&
    (value.completed_reviewers as number) >= 0 &&
    Number.isInteger(value.actionable_findings) &&
    (value.actionable_findings as number) >= 0 &&
    isUniqueStringArray(value.completed_roles)
  )
}

function sameReviewGate(left: ReviewGate, right: ReviewGate): boolean {
  return (
    left.schema_version === right.schema_version &&
    left.status === right.status &&
    left.reviewed_sha === right.reviewed_sha &&
    left.required_reviewers === right.required_reviewers &&
    left.completed_reviewers === right.completed_reviewers &&
    left.actionable_findings === right.actionable_findings &&
    sameStringSet(left.completed_roles, right.completed_roles)
  )
}

function isReviewRoundExceptionProof(value: unknown): value is ReviewRoundExceptionProof {
  return (
    isRecord(value) &&
    hasExactFields(value, reviewRoundExceptionFields) &&
    value.schema_version === 'loop-engineer-review-round-exception/v1' &&
    typeof value.issue_id === 'string' &&
    /^ISSUE-\d{3}$/.test(value.issue_id) &&
    Number.isSafeInteger(value.pr_number) &&
    (value.pr_number as number) > 0 &&
    isSha(value.merge_base_sha) &&
    isSha(value.head_sha) &&
    (value.max_round === 4 || value.max_round === 5)
  )
}

function sameReviewRoundException(
  left: ReviewRoundExceptionProof,
  right: ReviewRoundExceptionProof,
): boolean {
  return reviewRoundExceptionFields.every((field) => left[field] === right[field])
}

function validateAttestation(
  raw: unknown,
  verifiedException?: ReviewRoundExceptionProof,
): SpecialistReviewAttestation | string {
  if (!isRecord(raw)) return 'invalid_review_attestation'
  const expectedFields =
    raw.schema_version === 'loop-engineer-review-attestation/v2'
      ? v2AttestationFields
      : v1AttestationFields
  if (!hasExactFields(raw, expectedFields)) {
    return 'invalid_review_attestation'
  }
  if (
    raw.schema_version !== 'loop-engineer-review-attestation/v1' &&
    raw.schema_version !== 'loop-engineer-review-attestation/v2'
  ) {
    return 'unsupported_review_attestation_schema'
  }
  if (
    typeof raw.issue_id !== 'string' ||
    !/^ISSUE-\d{3}$/.test(raw.issue_id) ||
    !Number.isInteger(raw.pr_number) ||
    (raw.pr_number as number) <= 0 ||
    !isSha(raw.merge_base_sha) ||
    !isSha(raw.head_sha) ||
    !Number.isInteger(raw.round) ||
    (raw.round as number) < 1 ||
    !isUniqueStringArray(raw.change_areas) ||
    typeof raw.status !== 'string' ||
    !['pass', 'pending', 'fail'].includes(raw.status) ||
    typeof raw.reason !== 'string' ||
    !specialistReviewReasons.has(raw.reason as SpecialistReviewGateReason) ||
    !isUniqueStringArray(raw.required_roles) ||
    !isReviewGate(raw.review_gate)
  ) {
    return 'invalid_review_attestation'
  }

  if (raw.schema_version === 'loop-engineer-review-attestation/v1') {
    if ((raw.round as number) > 3) return 'review_round_exceeded'
  } else {
    if (!verifiedException) return 'review_round_exception_not_verified'
    if (
      !isReviewRoundExceptionProof(raw.review_round_exception) ||
      !sameReviewRoundException(raw.review_round_exception, verifiedException) ||
      (raw.round as number) < 4 ||
      (raw.round as number) > 5 ||
      (raw.round as number) > raw.review_round_exception.max_round ||
      raw.review_round_exception.issue_id !== raw.issue_id ||
      raw.review_round_exception.pr_number !== raw.pr_number ||
      raw.review_round_exception.merge_base_sha !== raw.merge_base_sha ||
      raw.review_round_exception.head_sha !== raw.head_sha
    ) {
      return 'invalid_review_round_exception'
    }
  }

  const attestation = raw as SpecialistReviewAttestation
  if (
    attestation.review_gate.status !== attestation.status ||
    attestation.review_gate.reviewed_sha !== attestation.head_sha ||
    (attestation.status === 'pass' &&
      (attestation.reason !== 'all_required_reviews_passed' ||
        attestation.review_gate.actionable_findings !== 0 ||
        attestation.review_gate.required_reviewers !== attestation.required_roles.length ||
        attestation.review_gate.completed_reviewers !== attestation.required_roles.length ||
        !sameStringSet(attestation.required_roles, attestation.review_gate.completed_roles))) ||
    (attestation.status === 'pending' && attestation.reason !== 'required_reviewer_missing') ||
    (attestation.status === 'fail' && attestation.reason === 'all_required_reviews_passed')
  ) {
    return 'invalid_review_attestation'
  }

  return attestation
}

function redactedFailure(reason: string): GitHubMergeGateEvaluation {
  return {
    schema_version: 'loop-engineer-github-gate-evaluation/v2',
    issue_id: null,
    pr_number: null,
    head_sha: null,
    specialist_review_gate: { status: 'failure', reason },
    merge_eligibility: { status: 'failure', decision: 'HOLD', reason },
    auto_merge_reservation: 'disabled_until_issue_167_human_go',
  }
}

function validateInput(
  rawInput: unknown,
  expectedHeadSha: string,
  verifiedException?: ReviewRoundExceptionProof,
  verifiedSupersession?: ReviewLineageSupersessionProof,
): GitHubMergeGateInput | string {
  if (!isSha(expectedHeadSha) || !isRecord(rawInput)) return 'invalid_input'
  const inputFields =
    rawInput.schema_version === 'loop-engineer-github-gate-input/v3' ? v3InputFields : v2InputFields
  if (Object.keys(rawInput).some((field) => !inputFields.includes(field as never))) {
    return 'unknown_field'
  }
  if (inputFields.some((field) => !Object.hasOwn(rawInput, field))) return 'invalid_input'
  if (
    rawInput.schema_version !== 'loop-engineer-github-gate-input/v2' &&
    rawInput.schema_version !== 'loop-engineer-github-gate-input/v3'
  ) {
    return 'unsupported_schema_version'
  }
  if (
    isRecord(rawInput.review_attestation) &&
    typeof rawInput.review_attestation.issue_id === 'string' &&
    Number.isSafeInteger(rawInput.review_attestation.pr_number) &&
    isTerminalReviewHold(
      rawInput.review_attestation.issue_id,
      rawInput.review_attestation.pr_number as number,
    )
  ) {
    return 'terminal_review_limit'
  }
  const attestation = validateAttestation(rawInput.review_attestation, verifiedException)
  if (typeof attestation === 'string') return attestation
  if (!isRecord(rawInput.merge_input)) return 'invalid_input'

  const requiresSupersession = reviewLineageRequiresSupersession(attestation.issue_id)
  if (requiresSupersession) {
    if (rawInput.schema_version !== 'loop-engineer-github-gate-input/v3' || !verifiedSupersession) {
      return 'review_lineage_supersession_not_verified'
    }
    const proof = parseReviewLineageSupersessionProof(rawInput.review_lineage_supersession)
    if (
      !proof ||
      !sameReviewLineageSupersession(proof, verifiedSupersession) ||
      proof.successor_issue_id !== attestation.issue_id ||
      proof.successor_pr_number !== attestation.pr_number ||
      proof.merge_base_sha !== attestation.merge_base_sha ||
      proof.head_sha !== attestation.head_sha ||
      proof.review_round !== attestation.round
    ) {
      return 'invalid_review_lineage_supersession'
    }
  } else if (rawInput.schema_version === 'loop-engineer-github-gate-input/v3') {
    return 'invalid_review_lineage_supersession'
  }

  return { ...rawInput, review_attestation: attestation } as GitHubMergeGateInput
}

function evaluateGitHubMergeGatesInternal(
  rawInput: unknown,
  expectedHeadSha: string,
  verifiedException?: ReviewRoundExceptionProof,
  verifiedSupersession?: ReviewLineageSupersessionProof,
): GitHubMergeGateEvaluation {
  const validated = validateInput(
    rawInput,
    expectedHeadSha,
    verifiedException,
    verifiedSupersession,
  )
  if (typeof validated === 'string') return redactedFailure(validated)
  const input = validated
  const attestation = input.review_attestation
  const classification = classifyMergeEligibility(input.merge_input)
  const specialistPassed = attestation.status === 'pass' && attestation.head_sha === expectedHeadSha
  const specialistReason =
    attestation.status === 'pass' && attestation.head_sha !== expectedHeadSha
      ? 'workflow_sha_mismatch'
      : attestation.reason
  const attestationMatches =
    specialistPassed &&
    attestation.issue_id === input.merge_input.issue_id &&
    attestation.pr_number === input.merge_input.pr_number &&
    attestation.head_sha === input.merge_input.head_sha &&
    sameStringSet(attestation.change_areas, input.merge_input.change_areas) &&
    sameReviewGate(attestation.review_gate, input.merge_input.review_gate)
  const effectiveClassification = attestationMatches
    ? classification
    : ({
        ...classification,
        decision: 'HOLD' as const,
        reason: 'review_attestation_mismatch',
      } as const)
  const mergeStatus =
    effectiveClassification.decision === 'AUTO_MERGE_ELIGIBLE'
      ? 'success'
      : effectiveClassification.decision === 'HUMAN_REQUIRED'
        ? 'human_approval_required'
        : 'failure'

  return {
    schema_version: 'loop-engineer-github-gate-evaluation/v2',
    issue_id: classification.issue_id,
    pr_number: classification.pr_number,
    head_sha: classification.head_sha,
    specialist_review_gate: {
      status: specialistPassed ? 'success' : 'failure',
      reason: specialistReason,
    },
    merge_eligibility: {
      status: mergeStatus,
      decision: effectiveClassification.decision,
      reason: effectiveClassification.reason,
    },
    auto_merge_reservation: 'disabled_until_issue_167_human_go',
  }
}

export function evaluateGitHubMergeGates(
  rawInput: unknown,
  expectedHeadSha: string,
): GitHubMergeGateEvaluation {
  return evaluateGitHubMergeGatesInternal(rawInput, expectedHeadSha)
}

function reviewRoundVerificationReason(error: unknown): string {
  if (!(error instanceof Error)) return 'review_round_exception_verification_failed'
  const allowed = new Set([
    'invalid_review_round_exception',
    'invalid_repository',
    'invalid_app_id',
    'stale_review_round_exception',
    'ambiguous_review_round_exception',
    'review_round_exception_not_approved',
  ])
  return allowed.has(error.message) ? error.message : 'review_round_exception_verification_failed'
}

export async function evaluateGitHubMergeGatesWithReviewRoundException(
  rawInput: unknown,
  expectedHeadSha: string,
  verifier: { repository: string; appId: number },
  adapter: ReviewRoundExceptionAdapter,
): Promise<GitHubMergeGateEvaluation> {
  let snapshot: unknown
  try {
    snapshot = structuredClone(rawInput)
  } catch {
    return redactedFailure('invalid_input')
  }
  if (
    !isRecord(snapshot) ||
    !isRecord(snapshot.review_attestation) ||
    snapshot.review_attestation.schema_version !== 'loop-engineer-review-attestation/v2' ||
    !isReviewRoundExceptionProof(snapshot.review_attestation.review_round_exception)
  ) {
    return evaluateGitHubMergeGates(snapshot, expectedHeadSha)
  }

  const proof = snapshot.review_attestation.review_round_exception
  try {
    await verifyReviewRoundException(
      { repository: verifier.repository, appId: verifier.appId, proof },
      adapter,
    )
  } catch (error) {
    return redactedFailure(reviewRoundVerificationReason(error))
  }
  return evaluateGitHubMergeGatesInternal(snapshot, expectedHeadSha, proof)
}

function reviewLineageVerificationReason(error: unknown): string {
  if (!(error instanceof Error)) return 'review_lineage_supersession_verification_failed'
  const allowed = new Set([
    'invalid_review_lineage_supersession',
    'invalid_repository',
    'invalid_app_id',
    'stale_review_lineage_supersession',
    'ambiguous_review_lineage_supersession',
    'review_lineage_check_app_mismatch',
    'review_lineage_supersession_not_approved',
  ])
  return allowed.has(error.message)
    ? error.message
    : 'review_lineage_supersession_verification_failed'
}

export async function evaluateGitHubMergeGatesWithProtectedProofs(
  rawInput: unknown,
  expectedHeadSha: string,
  verifier: { repository: string; appId: number },
  adapters: {
    reviewRound: ReviewRoundExceptionAdapter
    reviewLineage: ReviewLineageSupersessionAdapter
  },
  reviewLineageRequired = false,
): Promise<GitHubMergeGateEvaluation> {
  let snapshot: unknown
  try {
    snapshot = structuredClone(rawInput)
  } catch {
    return redactedFailure('invalid_input')
  }
  if (!isRecord(snapshot) || !isRecord(snapshot.review_attestation)) {
    return evaluateGitHubMergeGates(snapshot, expectedHeadSha)
  }
  if (
    typeof snapshot.review_attestation.issue_id === 'string' &&
    Number.isSafeInteger(snapshot.review_attestation.pr_number) &&
    isTerminalReviewHold(
      snapshot.review_attestation.issue_id,
      snapshot.review_attestation.pr_number as number,
    )
  ) {
    return redactedFailure('terminal_review_limit')
  }
  if (reviewLineageRequired && snapshot.schema_version !== 'loop-engineer-github-gate-input/v3') {
    return redactedFailure('review_lineage_supersession_not_verified')
  }

  let verifiedException: ReviewRoundExceptionProof | undefined
  if (snapshot.review_attestation.schema_version === 'loop-engineer-review-attestation/v2') {
    const proof = snapshot.review_attestation.review_round_exception
    if (!isReviewRoundExceptionProof(proof)) {
      return redactedFailure('invalid_review_round_exception')
    }
    try {
      await verifyReviewRoundException(
        { repository: verifier.repository, appId: verifier.appId, proof },
        adapters.reviewRound,
      )
      verifiedException = proof
    } catch (error) {
      return redactedFailure(reviewRoundVerificationReason(error))
    }
  }

  let verifiedSupersession: ReviewLineageSupersessionProof | undefined
  if (snapshot.schema_version === 'loop-engineer-github-gate-input/v3') {
    const proof = parseReviewLineageSupersessionProof(snapshot.review_lineage_supersession)
    if (!proof) return redactedFailure('invalid_review_lineage_supersession')
    try {
      await verifyReviewLineageSupersession(
        { repository: verifier.repository, appId: verifier.appId, proof },
        adapters.reviewLineage,
      )
      verifiedSupersession = proof
    } catch (error) {
      return redactedFailure(reviewLineageVerificationReason(error))
    }
  }

  return evaluateGitHubMergeGatesInternal(
    snapshot,
    expectedHeadSha,
    verifiedException,
    verifiedSupersession,
  )
}
