import { evaluateSpecialistReviewGate, type SpecialistReviewInput } from './specialist-review-gate'
import { classifyMergeEligibility, type MergeClassificationInput } from './merge-classifier'

export type GitHubMergeGateInput = {
  schema_version: 'loop-engineer-github-gate-input/v1'
  review_input: SpecialistReviewInput
  merge_input: MergeClassificationInput
  human_approval: {
    status: 'absent' | 'approved'
    reason: string | null
    approved_head_sha: string | null
  }
}

export type GitHubMergeGateEvaluation = {
  schema_version: 'loop-engineer-github-gate-evaluation/v1'
  issue_id: string | null
  pr_number: number | null
  head_sha: string | null
  specialist_review_gate: {
    status: 'success' | 'failure'
    reason: string
  }
  merge_eligibility: {
    status: 'success' | 'failure'
    decision: 'AUTO_MERGE_ELIGIBLE' | 'HUMAN_REQUIRED' | 'HOLD'
    reason: string
  }
  auto_merge_reservation: 'disabled_until_issue_167_human_go'
}

const inputFields = ['schema_version', 'review_input', 'merge_input', 'human_approval'] as const
const approvalFields = ['status', 'reason', 'approved_head_sha'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function redactedFailure(reason: string): GitHubMergeGateEvaluation {
  return {
    schema_version: 'loop-engineer-github-gate-evaluation/v1',
    issue_id: null,
    pr_number: null,
    head_sha: null,
    specialist_review_gate: { status: 'failure', reason },
    merge_eligibility: { status: 'failure', decision: 'HOLD', reason },
    auto_merge_reservation: 'disabled_until_issue_167_human_go',
  }
}

function sameStringSet(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  )
}

function validateInput(rawInput: unknown, expectedHeadSha: string): GitHubMergeGateInput | string {
  if (!/^[0-9a-f]{40}$/.test(expectedHeadSha) || !isRecord(rawInput)) return 'invalid_input'
  if (Object.keys(rawInput).some((field) => !inputFields.includes(field as never))) {
    return 'unknown_field'
  }
  if (inputFields.some((field) => !Object.hasOwn(rawInput, field))) return 'invalid_input'
  if (rawInput.schema_version !== 'loop-engineer-github-gate-input/v1') {
    return 'unsupported_schema_version'
  }
  if (!isRecord(rawInput.human_approval)) return 'invalid_human_approval'
  const approval = rawInput.human_approval
  if (Object.keys(approval).some((field) => !approvalFields.includes(field as never))) {
    return 'unknown_field'
  }
  if (approvalFields.some((field) => !Object.hasOwn(approval, field))) {
    return 'invalid_human_approval'
  }
  if (!['absent', 'approved'].includes(String(approval.status))) {
    return 'invalid_human_approval'
  }
  if (approval.reason !== null && typeof approval.reason !== 'string') {
    return 'invalid_human_approval'
  }
  if (approval.approved_head_sha !== null && typeof approval.approved_head_sha !== 'string') {
    return 'invalid_human_approval'
  }

  return rawInput as GitHubMergeGateInput
}

export function evaluateGitHubMergeGates(
  rawInput: unknown,
  expectedHeadSha: string,
): GitHubMergeGateEvaluation {
  const validated = validateInput(rawInput, expectedHeadSha)
  if (typeof validated === 'string') return redactedFailure(validated)
  const input = validated
  const review = evaluateSpecialistReviewGate(input.review_input)
  const classification = classifyMergeEligibility(input.merge_input)
  const specialistPassed = review.status === 'pass' && review.head_sha === expectedHeadSha
  const specialistReason =
    review.status === 'pass' && review.head_sha !== expectedHeadSha
      ? 'workflow_sha_mismatch'
      : review.reason
  const attestationMatches =
    specialistPassed &&
    review.issue_id === input.merge_input.issue_id &&
    review.pr_number === input.merge_input.pr_number &&
    review.head_sha === input.merge_input.head_sha &&
    sameStringSet(input.review_input.change_areas, input.merge_input.change_areas) &&
    JSON.stringify(review.review_gate) === JSON.stringify(input.merge_input.review_gate)
  const effectiveClassification = attestationMatches
    ? classification
    : ({
        ...classification,
        decision: 'HOLD' as const,
        reason: 'review_attestation_mismatch',
      } as const)
  const humanApprovalMatches =
    input.human_approval.status === 'approved' &&
    input.human_approval.reason === effectiveClassification.reason &&
    input.human_approval.approved_head_sha === expectedHeadSha &&
    effectiveClassification.head_sha === expectedHeadSha
  const mergePassed =
    effectiveClassification.decision === 'AUTO_MERGE_ELIGIBLE' ||
    (effectiveClassification.decision === 'HUMAN_REQUIRED' && humanApprovalMatches)

  return {
    schema_version: 'loop-engineer-github-gate-evaluation/v1',
    issue_id: classification.issue_id,
    pr_number: classification.pr_number,
    head_sha: classification.head_sha,
    specialist_review_gate: {
      status: specialistPassed ? 'success' : 'failure',
      reason: specialistReason,
    },
    merge_eligibility: {
      status: mergePassed ? 'success' : 'failure',
      decision: effectiveClassification.decision,
      reason: effectiveClassification.reason,
    },
    auto_merge_reservation: 'disabled_until_issue_167_human_go',
  }
}
