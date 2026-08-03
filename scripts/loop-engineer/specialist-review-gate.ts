export type SpecialistReviewGateReason =
  | 'all_required_reviews_passed'
  | 'invalid_input'
  | 'unknown_field'
  | 'unsupported_schema_version'
  | 'invalid_issue_id'
  | 'invalid_pr_number'
  | 'invalid_merge_base_sha'
  | 'invalid_head_sha'
  | 'review_round_exceeded'
  | 'invalid_parallel_slots'
  | 'invalid_change_areas'
  | 'risk_classification_missing'
  | 'unknown_change_area'
  | 'duplicate_change_area'
  | 'invalid_reviews'
  | 'invalid_review'
  | 'unknown_review_field'
  | 'unknown_reviewer_role'
  | 'duplicate_reviewer_role'
  | 'reviewer_role_mismatch'
  | 'review_context_mismatch'
  | 'reviewer_timeout'
  | 'invalid_finding'
  | 'unknown_finding_field'
  | 'finding_sha_mismatch'
  | 'review_status_mismatch'
  | 'reviewer_count_out_of_range'
  | 'review_sha_mismatch'
  | 'reviewer_not_read_only'
  | 'reviewer_not_independent'
  | 'peer_review_output_visible'
  | 'required_reviewer_missing'
  | 'actionable_findings_present'

const baseReviewerRoles = [
  'spec-acceptance',
  'implementation-correctness',
  'test-reliability',
] as const

const reviewerRoleByChangeArea: Record<string, string | undefined> = {
  docs: undefined,
  tests: undefined,
  ci: 'ci-supply-chain-operations',
  workflow: 'ci-supply-chain-operations',
  dependency: 'ci-supply-chain-operations',
  ui: 'ui-accessibility',
  api: 'api-contract',
  auth: 'security-authorization',
  ai: 'ai-safety-privacy',
  image: 'image-pipeline-privacy',
  storage: 'image-pipeline-privacy',
  privacy: 'privacy-data-protection',
  database: 'database-migration',
  'migration-code': 'database-migration',
  'real-db-migration': 'database-migration',
  'destructive-operation': 'ci-supply-chain-operations',
  'real-user-data': 'privacy-data-protection',
  'production-deploy': 'ci-supply-chain-operations',
  'secret-change': 'security-authorization',
  'vendor-change': 'ci-supply-chain-operations',
  'breaking-waiver': 'api-contract',
  'force-push': 'ci-supply-chain-operations',
  'ruleset-change': 'ci-supply-chain-operations',
  'repository-setting-change': 'ci-supply-chain-operations',
  'token-permission-change': 'ci-supply-chain-operations',
  'external-notification': 'ci-supply-chain-operations',
  'billing-change': 'ci-supply-chain-operations',
}

const requiredInputFields = [
  'schema_version',
  'issue_id',
  'pr_number',
  'merge_base_sha',
  'head_sha',
  'round',
  'parallel_slots',
  'change_areas',
  'reviews',
] as const
const allowedInputFields = new Set<string>(requiredInputFields)
const requiredReviewFields = [
  'role',
  'reviewed_issue_id',
  'reviewed_merge_base_sha',
  'reviewed_round',
  'reviewed_sha',
  'status',
  'read_only',
  'independent_context',
  'other_reviewer_outputs_visible',
  'findings',
] as const
const allowedReviewFields = new Set<string>(requiredReviewFields)
const requiredFindingFields = [
  'severity',
  'evidence',
  'file',
  'line',
  'required_fix',
  'reviewed_sha',
] as const
const allowedFindingFields = new Set<string>(requiredFindingFields)
const allowedReviewerRoles = new Set<string>([
  ...baseReviewerRoles,
  ...Object.values(reviewerRoleByChangeArea).filter(
    (role): role is string => typeof role === 'string',
  ),
])

export type ReviewInput = {
  role: string
  reviewed_issue_id: string
  reviewed_merge_base_sha: string
  reviewed_round: number
  reviewed_sha: string
  status: 'go' | 'finding' | 'timeout'
  read_only: boolean
  independent_context: boolean
  other_reviewer_outputs_visible: boolean
  findings: FindingInput[]
}

export type FindingInput = {
  severity: 'P0' | 'P1' | 'P2'
  evidence: string
  file: string
  line: number
  required_fix: string
  reviewed_sha: string
}

export type SpecialistReviewInput = {
  schema_version: 'loop-engineer-review-input/v1'
  issue_id: string
  pr_number: number
  merge_base_sha: string
  head_sha: string
  round: number
  parallel_slots: number
  change_areas: string[]
  reviews: ReviewInput[]
}

type ReviewStatus = 'pass' | 'pending' | 'fail'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function isNonEmptyBoundedText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 512
}

function isRepositoryRelativePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 240 &&
    /^[A-Za-z0-9._/-]+$/.test(value) &&
    !value.startsWith('/') &&
    !value.split('/').includes('..')
  )
}

function toWaves(roles: string[], parallelSlots: number): string[][] {
  const waves: string[][] = []
  for (let index = 0; index < roles.length; index += parallelSlots) {
    waves.push(roles.slice(index, index + parallelSlots))
  }
  return waves
}

function redactedFailure(reason: SpecialistReviewGateReason) {
  return {
    schema_version: 'loop-engineer-review-evaluation/v1' as const,
    status: 'fail' as const,
    reason,
    issue_id: null,
    pr_number: null,
    head_sha: null,
    round: null,
    required_roles: [] as string[],
    waves: [] as string[][],
    review_gate: null,
  }
}

function validateInput(rawInput: unknown): SpecialistReviewInput | SpecialistReviewGateReason {
  if (!isRecord(rawInput)) return 'invalid_input'
  if (Object.keys(rawInput).some((field) => !allowedInputFields.has(field))) {
    return 'unknown_field'
  }
  if (requiredInputFields.some((field) => !Object.hasOwn(rawInput, field))) {
    return 'invalid_input'
  }
  if (rawInput.schema_version !== 'loop-engineer-review-input/v1') {
    return 'unsupported_schema_version'
  }
  if (typeof rawInput.issue_id !== 'string' || !/^ISSUE-\d{3}$/.test(rawInput.issue_id)) {
    return 'invalid_issue_id'
  }
  if (!Number.isInteger(rawInput.pr_number) || (rawInput.pr_number as number) <= 0) {
    return 'invalid_pr_number'
  }
  if (!isSha(rawInput.merge_base_sha)) return 'invalid_merge_base_sha'
  if (!isSha(rawInput.head_sha)) return 'invalid_head_sha'
  if (!Number.isInteger(rawInput.round) || (rawInput.round as number) < 1) {
    return 'invalid_input'
  }
  if ((rawInput.round as number) > 3) return 'review_round_exceeded'
  if (
    !Number.isInteger(rawInput.parallel_slots) ||
    (rawInput.parallel_slots as number) < 1 ||
    (rawInput.parallel_slots as number) > 6
  ) {
    return 'invalid_parallel_slots'
  }
  if (
    !Array.isArray(rawInput.change_areas) ||
    rawInput.change_areas.some((area) => typeof area !== 'string')
  ) {
    return 'invalid_change_areas'
  }
  if (rawInput.change_areas.length === 0) return 'risk_classification_missing'
  if (new Set(rawInput.change_areas).size !== rawInput.change_areas.length) {
    return 'duplicate_change_area'
  }
  if (rawInput.change_areas.some((area) => !Object.hasOwn(reviewerRoleByChangeArea, area))) {
    return 'unknown_change_area'
  }
  if (!Array.isArray(rawInput.reviews)) return 'invalid_reviews'
  for (const reviewInput of rawInput.reviews) {
    if (!isRecord(reviewInput)) return 'invalid_review'
    if (Object.keys(reviewInput).some((field) => !allowedReviewFields.has(field))) {
      return 'unknown_review_field'
    }
    if (requiredReviewFields.some((field) => !Object.hasOwn(reviewInput, field))) {
      return 'invalid_review'
    }
    if (
      typeof reviewInput.role !== 'string' ||
      typeof reviewInput.reviewed_issue_id !== 'string' ||
      !isSha(reviewInput.reviewed_merge_base_sha) ||
      !Number.isInteger(reviewInput.reviewed_round) ||
      !isSha(reviewInput.reviewed_sha) ||
      typeof reviewInput.status !== 'string' ||
      !['go', 'finding', 'timeout'].includes(reviewInput.status) ||
      typeof reviewInput.read_only !== 'boolean' ||
      typeof reviewInput.independent_context !== 'boolean' ||
      typeof reviewInput.other_reviewer_outputs_visible !== 'boolean' ||
      !Array.isArray(reviewInput.findings)
    ) {
      return 'invalid_review'
    }
    for (const finding of reviewInput.findings) {
      if (!isRecord(finding)) return 'invalid_finding'
      if (Object.keys(finding).some((field) => !allowedFindingFields.has(field))) {
        return 'unknown_finding_field'
      }
      if (requiredFindingFields.some((field) => !Object.hasOwn(finding, field))) {
        return 'invalid_finding'
      }
      if (
        !['P0', 'P1', 'P2'].includes(String(finding.severity)) ||
        typeof finding.severity !== 'string' ||
        !isNonEmptyBoundedText(finding.evidence) ||
        !isRepositoryRelativePath(finding.file) ||
        !Number.isInteger(finding.line) ||
        (finding.line as number) <= 0 ||
        !isNonEmptyBoundedText(finding.required_fix) ||
        !isSha(finding.reviewed_sha)
      ) {
        return 'invalid_finding'
      }
      if (finding.reviewed_sha !== rawInput.head_sha) return 'finding_sha_mismatch'
    }
  }

  return rawInput as SpecialistReviewInput
}

export function evaluateSpecialistReviewGate(rawInput: unknown) {
  const validated = validateInput(rawInput)
  if (typeof validated === 'string') return redactedFailure(validated)
  const input = validated

  const requiredRoles = [...baseReviewerRoles] as string[]
  for (const changeArea of input.change_areas) {
    const reviewerRole = reviewerRoleByChangeArea[changeArea]
    if (reviewerRole && !requiredRoles.includes(reviewerRole)) requiredRoles.push(reviewerRole)
  }
  if (requiredRoles.length > 6) return redactedFailure('reviewer_count_out_of_range')

  const reviewRoles = input.reviews.map(({ role }) => role)
  const actionableFindings = input.reviews.reduce(
    (count, reviewInput) => count + reviewInput.findings.length,
    0,
  )
  let reason: SpecialistReviewGateReason = 'all_required_reviews_passed'
  if (reviewRoles.some((role) => !allowedReviewerRoles.has(role))) {
    reason = 'unknown_reviewer_role'
  } else if (new Set(reviewRoles).size !== reviewRoles.length) {
    reason = 'duplicate_reviewer_role'
  } else if (reviewRoles.some((role) => !requiredRoles.includes(role))) {
    reason = 'reviewer_role_mismatch'
  } else if (
    input.reviews.some(
      (reviewInput) =>
        reviewInput.reviewed_issue_id !== input.issue_id ||
        reviewInput.reviewed_merge_base_sha !== input.merge_base_sha ||
        reviewInput.reviewed_round !== input.round,
    )
  ) {
    reason = 'review_context_mismatch'
  } else if (
    input.reviews.some(
      ({ findings, status: reviewStatus }) => (reviewStatus === 'finding') !== findings.length > 0,
    )
  ) {
    reason = 'review_status_mismatch'
  } else if (input.reviews.some(({ status: reviewStatus }) => reviewStatus === 'timeout')) {
    reason = 'reviewer_timeout'
  } else if (
    input.reviews.some(({ reviewed_sha: reviewedSha }) => reviewedSha !== input.head_sha)
  ) {
    reason = 'review_sha_mismatch'
  } else if (input.reviews.some(({ read_only: readOnly }) => !readOnly)) {
    reason = 'reviewer_not_read_only'
  } else if (
    input.reviews.some(({ independent_context: independentContext }) => !independentContext)
  ) {
    reason = 'reviewer_not_independent'
  } else if (
    input.reviews.some(({ other_reviewer_outputs_visible: outputsVisible }) => outputsVisible)
  ) {
    reason = 'peer_review_output_visible'
  } else if (actionableFindings > 0) {
    reason = 'actionable_findings_present'
  } else if (
    requiredRoles.some((requiredRole) => !input.reviews.some(({ role }) => role === requiredRole))
  ) {
    reason = 'required_reviewer_missing'
  }

  const status: ReviewStatus =
    reason === 'all_required_reviews_passed'
      ? 'pass'
      : reason === 'required_reviewer_missing'
        ? 'pending'
        : 'fail'

  return {
    schema_version: 'loop-engineer-review-evaluation/v1' as const,
    status,
    reason,
    issue_id: input.issue_id,
    pr_number: input.pr_number,
    head_sha: input.head_sha,
    round: input.round,
    required_roles: requiredRoles,
    waves: toWaves(requiredRoles, input.parallel_slots),
    review_gate: {
      schema_version: 'loop-engineer-review-gate/v1' as const,
      status,
      reviewed_sha: input.head_sha,
      required_reviewers: requiredRoles.length,
      completed_reviewers: input.reviews.length,
      actionable_findings: actionableFindings,
      completed_roles: input.reviews.map(({ role }) => role),
    },
  }
}
