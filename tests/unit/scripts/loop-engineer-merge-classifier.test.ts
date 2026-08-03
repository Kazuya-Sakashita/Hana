import { describe, expect, it } from 'vitest'

import {
  classifyMergeEligibility,
  type MergeClassificationInput,
} from '../../../scripts/loop-engineer/merge-classifier'

const headSha = 'a'.repeat(40)
const baseReviewerRoles = [
  'spec-acceptance',
  'implementation-correctness',
  'test-reliability',
] as const

const domainEvidence = {
  auth: ['security', 'security-authorization'],
  ai: ['ai-safety', 'ai-safety-privacy'],
  privacy: ['privacy', 'privacy-data-protection'],
  database: ['database', 'database-migration'],
  'migration-code': ['database', 'database-migration'],
  api: ['openapi-contract', 'api-contract'],
  ui: ['ui-accessibility', 'ui-accessibility'],
  image: ['image-pipeline', 'image-pipeline-privacy'],
  storage: ['image-pipeline', 'image-pipeline-privacy'],
  ci: ['supply-chain', 'ci-supply-chain-operations'],
  workflow: ['supply-chain', 'ci-supply-chain-operations'],
  dependency: ['supply-chain', 'ci-supply-chain-operations'],
  'real-db-migration': ['database', 'database-migration'],
  'destructive-operation': ['supply-chain', 'ci-supply-chain-operations'],
  'real-user-data': ['privacy', 'privacy-data-protection'],
  'production-deploy': ['supply-chain', 'ci-supply-chain-operations'],
  'secret-change': ['security', 'security-authorization'],
  'vendor-change': ['supply-chain', 'ci-supply-chain-operations'],
  'breaking-waiver': ['openapi-contract', 'api-contract'],
  'force-push': ['supply-chain', 'ci-supply-chain-operations'],
  'ruleset-change': ['supply-chain', 'ci-supply-chain-operations'],
  'repository-setting-change': ['supply-chain', 'ci-supply-chain-operations'],
  'token-permission-change': ['supply-chain', 'ci-supply-chain-operations'],
  'external-notification': ['supply-chain', 'ci-supply-chain-operations'],
  'billing-change': ['supply-chain', 'ci-supply-chain-operations'],
} as const

const eligibleInput = (): MergeClassificationInput => ({
  schema_version: 'loop-engineer-merge-input/v1',
  issue_id: 'ISSUE-164',
  pr_number: 343,
  head_sha: headSha,
  change_areas: ['docs', 'tests'],
  required_checks: [
    { name: 'acceptance-criteria', status: 'success' },
    { name: 'unrelated-diff', status: 'success' },
    { name: 'merge-conflict', status: 'success' },
    { name: 'rollback-record', status: 'success' },
    { name: 'pr-gate', status: 'success' },
  ],
  review_gate: {
    schema_version: 'loop-engineer-review-gate/v1',
    status: 'pass',
    reviewed_sha: headSha,
    required_reviewers: 3,
    completed_reviewers: 3,
    actionable_findings: 0,
    completed_roles: [...baseReviewerRoles],
  },
})

function inputForChangeAreas(changeAreas: string[]): MergeClassificationInput {
  const input = eligibleInput()
  input.change_areas = changeAreas

  const checks = new Set<string>()
  const roles = new Set<string>(baseReviewerRoles)
  for (const changeArea of changeAreas) {
    const evidence = domainEvidence[changeArea as keyof typeof domainEvidence]
    if (!evidence) continue
    checks.add(evidence[0])
    roles.add(evidence[1])
  }

  for (const name of checks) input.required_checks.push({ name, status: 'success' })
  input.review_gate.completed_roles = [...roles]
  input.review_gate.required_reviewers = roles.size
  input.review_gate.completed_reviewers = roles.size
  return input
}

describe('ISSUE-164 Loop Engineer merge classifier', () => {
  it('allows only a low-risk PR with complete checks and latest-SHA review evidence', () => {
    expect(classifyMergeEligibility(eligibleInput())).toEqual({
      schema_version: 'loop-engineer-merge-classification/v1',
      decision: 'AUTO_MERGE_ELIGIBLE',
      reason: 'all_required_evidence_passed',
      issue_id: 'ISSUE-164',
      pr_number: 343,
      head_sha: headSha,
    })
  })

  it('requires human approval for a real database migration even when checks pass', () => {
    const input = inputForChangeAreas(['database', 'real-db-migration'])

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HUMAN_REQUIRED',
      reason: 'real_db_migration',
      head_sha: headSha,
    })
  })

  it('holds stale review evidence before considering human-required operations', () => {
    const input = inputForChangeAreas(['database', 'real-db-migration'])
    input.review_gate.reviewed_sha = 'b'.repeat(40)

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'review_sha_mismatch',
      head_sha: headSha,
    })
  })

  it('holds when acceptance criteria are incomplete', () => {
    const input = eligibleInput()
    input.required_checks[0] = { name: 'acceptance-criteria', status: 'failure' }

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'acceptance_criteria_incomplete',
    })
  })

  it('fails closed without retaining an unknown field value', () => {
    const input = {
      ...eligibleInput(),
      pull_request_body: 'forbidden-free-text-sentinel',
    } as MergeClassificationInput

    const result = classifyMergeEligibility(input)

    expect(result).toEqual({
      schema_version: 'loop-engineer-merge-classification/v1',
      decision: 'HOLD',
      reason: 'unknown_field',
      issue_id: null,
      pr_number: null,
      head_sha: null,
    })
    expect(JSON.stringify(result)).not.toContain('forbidden-free-text-sentinel')
  })

  it('holds an unknown change area instead of treating it as low risk', () => {
    const input = eligibleInput()
    input.change_areas = ['docs', 'future-unknown-area']

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'unknown_change_area',
    })
  })

  it('holds when risk classification is missing', () => {
    const input = eligibleInput()
    input.change_areas = []

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'risk_classification_missing',
    })
  })

  it.each([
    ['destructive-operation', 'destructive_operation'],
    ['real-user-data', 'real_user_data'],
    ['production-deploy', 'production_deploy'],
    ['secret-change', 'secret_change'],
    ['vendor-change', 'vendor_change'],
    ['breaking-waiver', 'breaking_waiver'],
    ['force-push', 'force_push'],
    ['ruleset-change', 'ruleset_change'],
    ['repository-setting-change', 'repository_setting_change'],
    ['token-permission-change', 'token_permission_change'],
    ['external-notification', 'external_notification'],
    ['billing-change', 'billing_change'],
  ])('requires human approval for %s', (changeArea, reason) => {
    const input = inputForChangeAreas([changeArea])

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HUMAN_REQUIRED',
      reason,
    })
  })

  it('returns a redacted HOLD result for a non-object input', () => {
    expect(classifyMergeEligibility(null as never)).toEqual({
      schema_version: 'loop-engineer-merge-classification/v1',
      decision: 'HOLD',
      reason: 'invalid_input',
      issue_id: null,
      pr_number: null,
      head_sha: null,
    })
  })

  it.each([
    [{}, 'invalid_input'],
    [{ ...eligibleInput(), schema_version: 'v2' }, 'unsupported_schema_version'],
    [{ ...eligibleInput(), issue_id: 'issue-164' }, 'invalid_issue_id'],
    [{ ...eligibleInput(), pr_number: 0 }, 'invalid_pr_number'],
    [{ ...eligibleInput(), head_sha: 'not-a-sha' }, 'invalid_head_sha'],
    [{ ...eligibleInput(), change_areas: 'docs' }, 'invalid_change_areas'],
    [{ ...eligibleInput(), required_checks: {} }, 'invalid_required_checks'],
    [{ ...eligibleInput(), review_gate: null }, 'invalid_review_gate'],
  ])('holds malformed status-only input with reason %s', (input, reason) => {
    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason,
    })
  })

  it.each([
    [
      {
        ...eligibleInput(),
        required_checks: [
          ...eligibleInput().required_checks,
          { name: 'pr-gate', status: 'success', details: 'forbidden-nested-sentinel' },
        ],
      },
      'unknown_field',
    ],
    [
      {
        ...eligibleInput(),
        review_gate: {
          ...eligibleInput().review_gate,
          summary: 'forbidden-nested-sentinel',
        },
      },
      'unknown_field',
    ],
    [{ ...eligibleInput(), required_checks: ['invalid'] }, 'invalid_required_checks'],
    [
      {
        ...eligibleInput(),
        review_gate: { status: 'pass' },
      },
      'invalid_review_gate',
    ],
  ])('rejects nested non-status data with reason %s', (input, reason) => {
    const result = classifyMergeEligibility(input)

    expect(result).toMatchObject({ decision: 'HOLD', reason })
    expect(JSON.stringify(result)).not.toContain('forbidden-nested-sentinel')
  })

  it.each([
    [
      (input: MergeClassificationInput) => {
        input.required_checks.push({ name: 'future-check', status: 'success' })
      },
      'unknown_check',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks.push({ name: 'pr-gate', status: 'success' })
      },
      'duplicate_check',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks = input.required_checks.filter((check) => check.name !== 'pr-gate')
      },
      'required_check_missing',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks.find((check) => check.name === 'unrelated-diff')!.status = 'failure'
      },
      'unrelated_diff_detected',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks.find((check) => check.name === 'merge-conflict')!.status = 'failure'
      },
      'merge_conflict_detected',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks.find((check) => check.name === 'pr-gate')!.status = 'pending'
      },
      'required_check_pending',
    ],
    [
      (input: MergeClassificationInput) => {
        input.required_checks.find((check) => check.name === 'pr-gate')!.status = 'failure'
      },
      'required_check_failed',
    ],
  ])('holds non-passing check evidence with reason %s', (mutate, reason) => {
    const input = eligibleInput()
    mutate(input)

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason,
    })
  })

  it.each([
    [
      (input: MergeClassificationInput) => {
        input.review_gate.status = 'pending'
      },
      'review_pending',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.status = 'fail'
      },
      'review_failed',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.required_reviewers = 2
        input.review_gate.completed_reviewers = 2
      },
      'reviewer_count_out_of_range',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.required_reviewers = 7
        input.review_gate.completed_reviewers = 7
      },
      'reviewer_count_out_of_range',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.completed_reviewers = 2
      },
      'review_incomplete',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.actionable_findings = 1
      },
      'actionable_findings_present',
    ],
  ])('holds incomplete review evidence with reason %s', (mutate, reason) => {
    const input = eligibleInput()
    mutate(input)

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason,
    })
  })

  it('holds duplicate change-area evidence', () => {
    const input = eligibleInput()
    input.change_areas = ['docs', 'docs']

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'duplicate_change_area',
    })
  })

  it.each([
    ['auth', 'security', 'security-authorization'],
    ['ai', 'ai-safety', 'ai-safety-privacy'],
    ['privacy', 'privacy', 'privacy-data-protection'],
    ['database', 'database', 'database-migration'],
    ['migration-code', 'database', 'database-migration'],
    ['api', 'openapi-contract', 'api-contract'],
    ['ui', 'ui-accessibility', 'ui-accessibility'],
    ['image', 'image-pipeline', 'image-pipeline-privacy'],
    ['storage', 'image-pipeline', 'image-pipeline-privacy'],
    ['ci', 'supply-chain', 'ci-supply-chain-operations'],
    ['workflow', 'supply-chain', 'ci-supply-chain-operations'],
    ['dependency', 'supply-chain', 'ci-supply-chain-operations'],
  ])(
    'requires %s changes to include the %s check and %s reviewer role',
    (changeArea, requiredCheck, requiredRole) => {
      const complete = inputForChangeAreas([changeArea])
      expect(classifyMergeEligibility(complete)).toMatchObject({
        decision: 'AUTO_MERGE_ELIGIBLE',
      })

      const missingCheck = inputForChangeAreas([changeArea])
      missingCheck.required_checks = missingCheck.required_checks.filter(
        (check) => check.name !== requiredCheck,
      )
      expect(classifyMergeEligibility(missingCheck)).toMatchObject({
        decision: 'HOLD',
        reason: 'required_check_missing',
      })

      const missingRole = inputForChangeAreas([changeArea])
      missingRole.review_gate.completed_roles = missingRole.review_gate.completed_roles.filter(
        (role) => role !== requiredRole,
      )
      expect(classifyMergeEligibility(missingRole)).toMatchObject({
        decision: 'HOLD',
        reason: 'reviewer_role_mismatch',
      })
    },
  )

  it('holds a change set that would require more than six independent reviewer roles', () => {
    const input = inputForChangeAreas(['auth', 'ai', 'privacy', 'database'])

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason: 'reviewer_count_out_of_range',
    })
  })

  it.each([
    [
      (input: MergeClassificationInput) => {
        input.review_gate.schema_version = 'loop-engineer-review-gate/v2' as never
      },
      'unsupported_review_gate_schema',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.completed_roles.push('future-role')
      },
      'unknown_reviewer_role',
    ],
    [
      (input: MergeClassificationInput) => {
        input.review_gate.completed_roles.push('spec-acceptance')
      },
      'duplicate_reviewer_role',
    ],
  ])('holds invalid reviewer-role evidence with reason %s', (mutate, reason) => {
    const input = eligibleInput()
    mutate(input)

    expect(classifyMergeEligibility(input)).toMatchObject({
      decision: 'HOLD',
      reason,
    })
  })
})
