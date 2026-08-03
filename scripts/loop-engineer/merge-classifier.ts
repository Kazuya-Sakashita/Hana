export type MergeDecision = 'AUTO_MERGE_ELIGIBLE' | 'HUMAN_REQUIRED' | 'HOLD'

export type MergeClassificationReason =
  | 'all_required_evidence_passed'
  | 'real_db_migration'
  | 'destructive_operation'
  | 'real_user_data'
  | 'production_deploy'
  | 'secret_change'
  | 'vendor_change'
  | 'breaking_waiver'
  | 'force_push'
  | 'ruleset_change'
  | 'repository_setting_change'
  | 'token_permission_change'
  | 'external_notification'
  | 'billing_change'
  | 'invalid_input'
  | 'unknown_field'
  | 'unsupported_schema_version'
  | 'invalid_issue_id'
  | 'invalid_pr_number'
  | 'invalid_head_sha'
  | 'invalid_change_areas'
  | 'risk_classification_missing'
  | 'unknown_change_area'
  | 'duplicate_change_area'
  | 'invalid_required_checks'
  | 'unknown_check'
  | 'duplicate_check'
  | 'required_check_missing'
  | 'acceptance_criteria_incomplete'
  | 'unrelated_diff_detected'
  | 'merge_conflict_detected'
  | 'required_check_pending'
  | 'required_check_failed'
  | 'invalid_review_gate'
  | 'unsupported_review_gate_schema'
  | 'unknown_reviewer_role'
  | 'duplicate_reviewer_role'
  | 'reviewer_role_mismatch'
  | 'review_sha_mismatch'
  | 'review_pending'
  | 'review_failed'
  | 'reviewer_count_out_of_range'
  | 'review_incomplete'
  | 'actionable_findings_present'

export type MergeClassificationInput = {
  schema_version: 'loop-engineer-merge-input/v1'
  issue_id: string
  pr_number: number
  head_sha: string
  change_areas: string[]
  required_checks: Array<{
    name: string
    status: 'success' | 'pending' | 'failure'
  }>
  review_gate: {
    schema_version: 'loop-engineer-review-gate/v1'
    status: 'pass' | 'pending' | 'fail'
    reviewed_sha: string
    required_reviewers: number
    completed_reviewers: number
    actionable_findings: number
    completed_roles: string[]
  }
}

export type MergeClassification = {
  schema_version: 'loop-engineer-merge-classification/v1'
  decision: MergeDecision
  reason: MergeClassificationReason
  issue_id: string | null
  pr_number: number | null
  head_sha: string | null
}

const requiredInputFields = [
  'schema_version',
  'issue_id',
  'pr_number',
  'head_sha',
  'change_areas',
  'required_checks',
  'review_gate',
] as const
const allowedInputFields = new Set<string>(requiredInputFields)
const requiredCheckFields = ['name', 'status'] as const
const allowedCheckFields = new Set<string>(requiredCheckFields)
const baselineCheckNames = [
  'acceptance-criteria',
  'unrelated-diff',
  'merge-conflict',
  'rollback-record',
  'pr-gate',
] as const
const baseReviewerRoles = [
  'spec-acceptance',
  'implementation-correctness',
  'test-reliability',
] as const
type ChangeAreaPolicy = {
  check?: string
  reviewerRole?: string
  humanReason?: MergeClassificationReason
}
const changeAreaPolicy: Record<string, ChangeAreaPolicy> = {
  docs: {},
  tests: {},
  ci: { check: 'supply-chain', reviewerRole: 'ci-supply-chain-operations' },
  workflow: { check: 'supply-chain', reviewerRole: 'ci-supply-chain-operations' },
  dependency: { check: 'supply-chain', reviewerRole: 'ci-supply-chain-operations' },
  ui: { check: 'ui-accessibility', reviewerRole: 'ui-accessibility' },
  api: { check: 'openapi-contract', reviewerRole: 'api-contract' },
  auth: { check: 'security', reviewerRole: 'security-authorization' },
  ai: { check: 'ai-safety', reviewerRole: 'ai-safety-privacy' },
  image: { check: 'image-pipeline', reviewerRole: 'image-pipeline-privacy' },
  storage: { check: 'image-pipeline', reviewerRole: 'image-pipeline-privacy' },
  privacy: { check: 'privacy', reviewerRole: 'privacy-data-protection' },
  database: { check: 'database', reviewerRole: 'database-migration' },
  'migration-code': { check: 'database', reviewerRole: 'database-migration' },
  'real-db-migration': {
    check: 'database',
    reviewerRole: 'database-migration',
    humanReason: 'real_db_migration',
  },
  'destructive-operation': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'destructive_operation',
  },
  'real-user-data': {
    check: 'privacy',
    reviewerRole: 'privacy-data-protection',
    humanReason: 'real_user_data',
  },
  'production-deploy': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'production_deploy',
  },
  'secret-change': {
    check: 'security',
    reviewerRole: 'security-authorization',
    humanReason: 'secret_change',
  },
  'vendor-change': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'vendor_change',
  },
  'breaking-waiver': {
    check: 'openapi-contract',
    reviewerRole: 'api-contract',
    humanReason: 'breaking_waiver',
  },
  'force-push': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'force_push',
  },
  'ruleset-change': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'ruleset_change',
  },
  'repository-setting-change': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'repository_setting_change',
  },
  'token-permission-change': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'token_permission_change',
  },
  'external-notification': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'external_notification',
  },
  'billing-change': {
    check: 'supply-chain',
    reviewerRole: 'ci-supply-chain-operations',
    humanReason: 'billing_change',
  },
}
const allowedCheckNames = new Set([
  ...baselineCheckNames,
  ...Object.values(changeAreaPolicy).flatMap(({ check }) => (check ? [check] : [])),
  'issue-registry',
])
const allowedReviewerRoles = new Set([
  ...baseReviewerRoles,
  ...Object.values(changeAreaPolicy).flatMap(({ reviewerRole }) =>
    reviewerRole ? [reviewerRole] : [],
  ),
])
const requiredReviewGateFields = [
  'schema_version',
  'status',
  'reviewed_sha',
  'required_reviewers',
  'completed_reviewers',
  'actionable_findings',
  'completed_roles',
] as const
const allowedReviewGateFields = new Set<string>(requiredReviewGateFields)
const allowedChangeAreas = new Set(Object.keys(changeAreaPolicy))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function redactedHold(reason: MergeClassificationReason): MergeClassification {
  return {
    schema_version: 'loop-engineer-merge-classification/v1',
    decision: 'HOLD',
    reason,
    issue_id: null,
    pr_number: null,
    head_sha: null,
  }
}

function classification(
  input: MergeClassificationInput,
  decision: MergeDecision,
  reason: MergeClassificationReason,
): MergeClassification {
  return {
    schema_version: 'loop-engineer-merge-classification/v1',
    decision,
    reason,
    issue_id: input.issue_id,
    pr_number: input.pr_number,
    head_sha: input.head_sha,
  }
}

export function classifyMergeEligibility(rawInput: unknown): MergeClassification {
  if (!isRecord(rawInput)) return redactedHold('invalid_input')
  if (Object.keys(rawInput).some((field) => !allowedInputFields.has(field))) {
    return redactedHold('unknown_field')
  }
  if (requiredInputFields.some((field) => !Object.hasOwn(rawInput, field))) {
    return redactedHold('invalid_input')
  }
  if (rawInput.schema_version !== 'loop-engineer-merge-input/v1') {
    return redactedHold('unsupported_schema_version')
  }
  if (typeof rawInput.issue_id !== 'string' || !/^ISSUE-\d{3}$/.test(rawInput.issue_id)) {
    return redactedHold('invalid_issue_id')
  }
  if (!Number.isInteger(rawInput.pr_number) || (rawInput.pr_number as number) <= 0) {
    return redactedHold('invalid_pr_number')
  }
  if (typeof rawInput.head_sha !== 'string' || !/^[0-9a-f]{40}$/.test(rawInput.head_sha)) {
    return redactedHold('invalid_head_sha')
  }
  if (!Array.isArray(rawInput.change_areas)) return redactedHold('invalid_change_areas')
  if (!Array.isArray(rawInput.required_checks)) return redactedHold('invalid_required_checks')
  if (!isRecord(rawInput.review_gate)) return redactedHold('invalid_review_gate')

  const input = rawInput as MergeClassificationInput
  if (input.change_areas.some((area) => typeof area !== 'string')) {
    return classification(input, 'HOLD', 'invalid_change_areas')
  }

  for (const check of rawInput.required_checks) {
    if (!isRecord(check)) return classification(input, 'HOLD', 'invalid_required_checks')
    if (Object.keys(check).some((field) => !allowedCheckFields.has(field))) {
      return classification(input, 'HOLD', 'unknown_field')
    }
    if (requiredCheckFields.some((field) => !Object.hasOwn(check, field))) {
      return classification(input, 'HOLD', 'invalid_required_checks')
    }
    if (
      typeof check.name !== 'string' ||
      !['success', 'pending', 'failure'].includes(String(check.status))
    ) {
      return classification(input, 'HOLD', 'invalid_required_checks')
    }
  }

  const reviewGate = rawInput.review_gate
  if (Object.keys(reviewGate).some((field) => !allowedReviewGateFields.has(field))) {
    return classification(input, 'HOLD', 'unknown_field')
  }
  if (requiredReviewGateFields.some((field) => !Object.hasOwn(reviewGate, field))) {
    return classification(input, 'HOLD', 'invalid_review_gate')
  }
  if (reviewGate.schema_version !== 'loop-engineer-review-gate/v1') {
    return classification(input, 'HOLD', 'unsupported_review_gate_schema')
  }
  if (
    !['pass', 'pending', 'fail'].includes(String(reviewGate.status)) ||
    typeof reviewGate.reviewed_sha !== 'string' ||
    !/^[0-9a-f]{40}$/.test(reviewGate.reviewed_sha) ||
    !Number.isInteger(reviewGate.required_reviewers) ||
    (reviewGate.required_reviewers as number) < 0 ||
    !Number.isInteger(reviewGate.completed_reviewers) ||
    (reviewGate.completed_reviewers as number) < 0 ||
    !Number.isInteger(reviewGate.actionable_findings) ||
    (reviewGate.actionable_findings as number) < 0 ||
    !Array.isArray(reviewGate.completed_roles) ||
    reviewGate.completed_roles.some((role) => typeof role !== 'string')
  ) {
    return classification(input, 'HOLD', 'invalid_review_gate')
  }
  if (input.review_gate.completed_roles.some((role) => !allowedReviewerRoles.has(role))) {
    return classification(input, 'HOLD', 'unknown_reviewer_role')
  }
  if (
    new Set(input.review_gate.completed_roles).size !== input.review_gate.completed_roles.length
  ) {
    return classification(input, 'HOLD', 'duplicate_reviewer_role')
  }

  if (input.change_areas.length === 0) {
    return classification(input, 'HOLD', 'risk_classification_missing')
  }

  if (input.change_areas.some((area) => !allowedChangeAreas.has(area))) {
    return classification(input, 'HOLD', 'unknown_change_area')
  }
  if (new Set(input.change_areas).size !== input.change_areas.length) {
    return classification(input, 'HOLD', 'duplicate_change_area')
  }

  const checkNames = input.required_checks.map((check) => check.name)
  if (checkNames.some((name) => !allowedCheckNames.has(name))) {
    return classification(input, 'HOLD', 'unknown_check')
  }
  if (new Set(checkNames).size !== checkNames.length) {
    return classification(input, 'HOLD', 'duplicate_check')
  }

  if (input.review_gate.reviewed_sha !== input.head_sha) {
    return classification(input, 'HOLD', 'review_sha_mismatch')
  }

  const acceptanceCriteria = input.required_checks.find(
    (check) => check.name === 'acceptance-criteria',
  )
  if (acceptanceCriteria?.status !== 'success') {
    return classification(input, 'HOLD', 'acceptance_criteria_incomplete')
  }

  const requiredCheckNames = new Set<string>(baselineCheckNames)
  const requiredReviewerRoles = new Set<string>(baseReviewerRoles)
  for (const changeArea of input.change_areas) {
    const policy = changeAreaPolicy[changeArea]
    if (!policy) return classification(input, 'HOLD', 'unknown_change_area')
    if (policy.check) requiredCheckNames.add(policy.check)
    if (policy.reviewerRole) requiredReviewerRoles.add(policy.reviewerRole)
  }

  if ([...requiredCheckNames].some((name) => !checkNames.includes(name))) {
    return classification(input, 'HOLD', 'required_check_missing')
  }

  const unrelatedDiff = input.required_checks.find((check) => check.name === 'unrelated-diff')
  if (unrelatedDiff?.status === 'failure') {
    return classification(input, 'HOLD', 'unrelated_diff_detected')
  }

  const mergeConflict = input.required_checks.find((check) => check.name === 'merge-conflict')
  if (mergeConflict?.status === 'failure') {
    return classification(input, 'HOLD', 'merge_conflict_detected')
  }

  if (input.required_checks.some((check) => check.status === 'pending')) {
    return classification(input, 'HOLD', 'required_check_pending')
  }
  if (input.required_checks.some((check) => check.status === 'failure')) {
    return classification(input, 'HOLD', 'required_check_failed')
  }

  if (input.review_gate.status === 'pending') {
    return classification(input, 'HOLD', 'review_pending')
  }
  if (input.review_gate.status === 'fail') {
    return classification(input, 'HOLD', 'review_failed')
  }
  if (
    requiredReviewerRoles.size > 6 ||
    input.review_gate.required_reviewers < 3 ||
    input.review_gate.required_reviewers > 6
  ) {
    return classification(input, 'HOLD', 'reviewer_count_out_of_range')
  }
  if (
    input.review_gate.required_reviewers !== requiredReviewerRoles.size ||
    input.review_gate.completed_roles.length !== requiredReviewerRoles.size ||
    [...requiredReviewerRoles].some((role) => !input.review_gate.completed_roles.includes(role))
  ) {
    return classification(input, 'HOLD', 'reviewer_role_mismatch')
  }
  if (input.review_gate.completed_reviewers !== input.review_gate.required_reviewers) {
    return classification(input, 'HOLD', 'review_incomplete')
  }
  if (input.review_gate.actionable_findings > 0) {
    return classification(input, 'HOLD', 'actionable_findings_present')
  }

  const humanReason = Object.entries(changeAreaPolicy).find(
    ([changeArea, policy]) =>
      policy.humanReason !== undefined && input.change_areas.includes(changeArea),
  )?.[1].humanReason
  if (humanReason) {
    return classification(input, 'HUMAN_REQUIRED', humanReason)
  }

  return classification(input, 'AUTO_MERGE_ELIGIBLE', 'all_required_evidence_passed')
}
