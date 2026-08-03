import { describe, expect, it } from 'vitest'

import {
  evaluateSpecialistReviewGate,
  type ReviewInput,
  type SpecialistReviewInput,
} from '../../../scripts/loop-engineer/specialist-review-gate'

const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const baseRoles = ['spec-acceptance', 'implementation-correctness', 'test-reliability'] as const
const domainRoles = [
  ['auth', 'security-authorization'],
  ['ai', 'ai-safety-privacy'],
  ['privacy', 'privacy-data-protection'],
  ['database', 'database-migration'],
  ['migration-code', 'database-migration'],
  ['api', 'api-contract'],
  ['ui', 'ui-accessibility'],
  ['image', 'image-pipeline-privacy'],
  ['storage', 'image-pipeline-privacy'],
  ['ci', 'ci-supply-chain-operations'],
  ['workflow', 'ci-supply-chain-operations'],
  ['dependency', 'ci-supply-chain-operations'],
  ['real-db-migration', 'database-migration'],
  ['destructive-operation', 'ci-supply-chain-operations'],
  ['real-user-data', 'privacy-data-protection'],
  ['production-deploy', 'ci-supply-chain-operations'],
  ['secret-change', 'security-authorization'],
  ['vendor-change', 'ci-supply-chain-operations'],
  ['breaking-waiver', 'api-contract'],
  ['force-push', 'ci-supply-chain-operations'],
  ['ruleset-change', 'ci-supply-chain-operations'],
  ['repository-setting-change', 'ci-supply-chain-operations'],
  ['token-permission-change', 'ci-supply-chain-operations'],
  ['external-notification', 'ci-supply-chain-operations'],
  ['billing-change', 'ci-supply-chain-operations'],
] as const

function review(role: string): ReviewInput {
  return {
    role,
    reviewer_instance_id: `reviewer_${role.replaceAll('-', '_')}`,
    reviewed_issue_id: 'ISSUE-165',
    reviewed_merge_base_sha: mergeBaseSha,
    reviewed_round: 1,
    reviewed_sha: headSha,
    status: 'go',
    read_only: true,
    independent_context: true,
    other_reviewer_outputs_visible: false,
    findings: [],
  }
}

function passingInput(): SpecialistReviewInput {
  return {
    schema_version: 'loop-engineer-review-input/v1',
    issue_id: 'ISSUE-165',
    pr_number: 344,
    merge_base_sha: mergeBaseSha,
    head_sha: headSha,
    round: 1,
    parallel_slots: 2,
    change_areas: ['docs', 'tests'],
    reviews: baseRoles.map(review),
  }
}

describe('ISSUE-165 specialist review gate', () => {
  it('passes three independent read-only reviews of the latest SHA and emits waves', () => {
    expect(evaluateSpecialistReviewGate(passingInput())).toEqual({
      schema_version: 'loop-engineer-review-evaluation/v1',
      status: 'pass',
      reason: 'all_required_reviews_passed',
      issue_id: 'ISSUE-165',
      pr_number: 344,
      head_sha: headSha,
      round: 1,
      required_roles: [...baseRoles],
      waves: [['spec-acceptance', 'implementation-correctness'], ['test-reliability']],
      review_gate: {
        schema_version: 'loop-engineer-review-gate/v1',
        status: 'pass',
        reviewed_sha: headSha,
        required_reviewers: 3,
        completed_reviewers: 3,
        actionable_findings: 0,
        completed_roles: [...baseRoles],
      },
    })
  })

  it('requires every reviewer to attest the same Issue, merge base, and round', () => {
    const input = passingInput()
    const contextBoundInput = {
      ...input,
      reviews: input.reviews.map((reviewInput) => ({
        ...reviewInput,
        reviewed_issue_id: input.issue_id,
        reviewed_merge_base_sha: input.merge_base_sha,
        reviewed_round: input.round,
      })),
    }

    expect(evaluateSpecialistReviewGate(contextBoundInput)).toMatchObject({
      status: 'pass',
      reason: 'all_required_reviews_passed',
    })
  })

  it('requires a distinct privacy-safe reviewer instance for every role', () => {
    const input = passingInput()
    const identityBoundInput = {
      ...input,
      reviews: input.reviews.map((reviewInput, index) => ({
        ...reviewInput,
        reviewer_instance_id: `reviewer_instance_${index + 1}`,
      })),
    }

    expect(evaluateSpecialistReviewGate(identityBoundInput)).toMatchObject({
      status: 'pass',
      reason: 'all_required_reviews_passed',
    })
  })

  it('fails when one reviewer instance claims multiple required roles', () => {
    const input = passingInput()
    input.reviews[1]!.reviewer_instance_id = input.reviews[0]!.reviewer_instance_id

    const result = evaluateSpecialistReviewGate(input)

    expect(result).toMatchObject({
      status: 'fail',
      reason: 'duplicate_reviewer_instance',
      review_gate: { status: 'fail' },
    })
    expect(JSON.stringify(result)).not.toContain(input.reviews[0]!.reviewer_instance_id)
  })

  it.each([
    ['reviewed_issue_id', 'ISSUE-999'],
    ['reviewed_merge_base_sha', 'c'.repeat(40)],
    ['reviewed_round', 2],
  ] as const)('fails when reviewer context field %s does not match', (field, value) => {
    const input = passingInput()
    const rawInput = {
      ...input,
      reviews: input.reviews.map((reviewInput, index) =>
        index === 0 ? { ...reviewInput, [field]: value } : reviewInput,
      ),
    }

    expect(evaluateSpecialistReviewGate(rawInput)).toMatchObject({
      status: 'fail',
      reason: 'review_context_mismatch',
      review_gate: { status: 'fail' },
    })
  })

  it('adds a specialist role for the changed area without merging independent roles', () => {
    const input = passingInput()
    input.change_areas = ['ci', 'workflow']
    input.reviews.push(review('ci-supply-chain-operations'))

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'pass',
      reason: 'all_required_reviews_passed',
      required_roles: [
        'spec-acceptance',
        'implementation-correctness',
        'test-reliability',
        'ci-supply-chain-operations',
      ],
      waves: [
        ['spec-acceptance', 'implementation-correctness'],
        ['test-reliability', 'ci-supply-chain-operations'],
      ],
      review_gate: {
        required_reviewers: 4,
        completed_reviewers: 4,
        completed_roles: [
          'spec-acceptance',
          'implementation-correctness',
          'test-reliability',
          'ci-supply-chain-operations',
        ],
      },
    })
  })

  it.each(domainRoles)('selects %s changes for the %s specialist', (changeArea, role) => {
    const input = passingInput()
    input.change_areas = [changeArea]
    input.reviews.push(review(role))

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'pass',
      required_roles: [...baseRoles, role],
      review_gate: { required_reviewers: 4 },
    })
  })

  it('keeps role and wave order canonical for change-area permutations and all slot counts', () => {
    for (let parallelSlots = 1; parallelSlots <= 6; parallelSlots += 1) {
      const first = passingInput()
      first.change_areas = ['auth', 'ci']
      first.parallel_slots = parallelSlots
      first.reviews.push(review('security-authorization'), review('ci-supply-chain-operations'))

      const second = passingInput()
      second.change_areas = ['ci', 'auth']
      second.parallel_slots = parallelSlots
      second.reviews.push(review('security-authorization'), review('ci-supply-chain-operations'))
      second.reviews.reverse()

      const firstResult = evaluateSpecialistReviewGate(first)
      const secondResult = evaluateSpecialistReviewGate(second)

      expect(firstResult).toMatchObject({ status: 'pass' })
      expect(secondResult).toMatchObject({ status: 'pass' })
      expect(secondResult.required_roles).toEqual(firstResult.required_roles)
      expect(secondResult.waves).toEqual(firstResult.waves)
      expect(secondResult.review_gate?.completed_roles).toEqual(
        firstResult.review_gate?.completed_roles,
      )
    }
  })

  it('fails closed when any review targets an older commit', () => {
    const input = passingInput()
    input.reviews[0]!.reviewed_sha = 'c'.repeat(40)

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'fail',
      reason: 'review_sha_mismatch',
      head_sha: headSha,
      review_gate: {
        status: 'fail',
        reviewed_sha: headSha,
      },
    })
  })

  it.each([
    ['read_only', false, 'reviewer_not_read_only'],
    ['independent_context', false, 'reviewer_not_independent'],
    ['other_reviewer_outputs_visible', true, 'peer_review_output_visible'],
  ] as const)('enforces reviewer isolation when %s is %s', (field, value, reason) => {
    const input = passingInput()
    input.reviews[0]![field] = value

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'fail',
      reason,
      review_gate: { status: 'fail' },
    })
  })

  it('does not pass when a required reviewer is missing', () => {
    const input = passingInput()
    input.reviews.pop()

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'pending',
      reason: 'required_reviewer_missing',
      review_gate: {
        status: 'pending',
        required_reviewers: 3,
        completed_reviewers: 2,
      },
    })
  })

  it('preserves a minority actionable finding as a blocking count without echoing evidence', () => {
    const input = passingInput()
    input.reviews[1] = {
      ...review('implementation-correctness'),
      status: 'finding',
      findings: [
        {
          severity: 'P1',
          evidence: 'forbidden-review-evidence-sentinel',
          file: 'scripts/loop-engineer/specialist-review-gate.ts',
          line: 1,
          required_fix: 'reject stale review evidence',
          reviewed_sha: headSha,
        },
      ],
    }

    const result = evaluateSpecialistReviewGate(input)

    expect(result).toMatchObject({
      status: 'fail',
      reason: 'actionable_findings_present',
      review_gate: {
        status: 'fail',
        actionable_findings: 1,
      },
    })
    expect(JSON.stringify(result)).not.toContain('forbidden-review-evidence-sentinel')
  })

  it.each([
    [null, 'invalid_input'],
    [{ ...passingInput(), schema_version: 'v2' }, 'unsupported_schema_version'],
    [{ ...passingInput(), issue_id: 'issue-165' }, 'invalid_issue_id'],
    [{ ...passingInput(), pr_number: 0 }, 'invalid_pr_number'],
    [{ ...passingInput(), merge_base_sha: 'not-a-sha' }, 'invalid_merge_base_sha'],
    [{ ...passingInput(), head_sha: 'not-a-sha' }, 'invalid_head_sha'],
    [{ ...passingInput(), round: 4 }, 'review_round_exceeded'],
    [{ ...passingInput(), parallel_slots: 0 }, 'invalid_parallel_slots'],
    [{ ...passingInput(), change_areas: [] }, 'risk_classification_missing'],
    [{ ...passingInput(), change_areas: ['future-area'] }, 'unknown_change_area'],
    [{ ...passingInput(), reviews: {} }, 'invalid_reviews'],
  ])('fails closed for malformed input with reason %s', (input, reason) => {
    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'fail',
      reason,
    })
  })

  it('rejects unknown fields without retaining their values', () => {
    const result = evaluateSpecialistReviewGate({
      ...passingInput(),
      prompt: 'forbidden-prompt-sentinel',
    })

    expect(result).toMatchObject({
      status: 'fail',
      reason: 'unknown_field',
      issue_id: null,
      pr_number: null,
      head_sha: null,
    })
    expect(JSON.stringify(result)).not.toContain('forbidden-prompt-sentinel')
  })

  it('redacts an unknown reviewer role instead of reflecting it to output', () => {
    const input = passingInput()
    input.reviews[0] = review('forbidden_secret_role_sentinel')

    const result = evaluateSpecialistReviewGate(input)

    expect(result).toMatchObject({
      status: 'fail',
      reason: 'unknown_reviewer_role',
      issue_id: null,
      review_gate: null,
    })
    expect(JSON.stringify(result)).not.toContain('forbidden_secret_role_sentinel')
  })

  it.each([
    [{ ...passingInput(), reviews: [null] }, 'invalid_review'],
    [
      {
        ...passingInput(),
        reviews: [
          {
            ...review('spec-acceptance'),
            prompt: 'forbidden-review-prompt-sentinel',
          },
        ],
      },
      'unknown_review_field',
    ],
    [
      {
        ...passingInput(),
        reviews: [...passingInput().reviews, review('spec-acceptance')],
      },
      'duplicate_reviewer_role',
    ],
    [
      {
        ...passingInput(),
        reviews: [review('future-reviewer'), ...passingInput().reviews.slice(1)],
      },
      'unknown_reviewer_role',
    ],
    [
      {
        ...passingInput(),
        reviews: [review('ui-accessibility'), ...passingInput().reviews],
      },
      'reviewer_role_mismatch',
    ],
    [
      {
        ...passingInput(),
        reviews: [
          { ...review('spec-acceptance'), status: 'timeout' },
          ...passingInput().reviews.slice(1),
        ],
      },
      'reviewer_timeout',
    ],
  ])('rejects invalid reviewer evidence with reason %s', (input, reason) => {
    const result = evaluateSpecialistReviewGate(input)
    expect(result).toMatchObject({ status: 'fail', reason })
    expect(JSON.stringify(result)).not.toContain('forbidden-review-prompt-sentinel')
  })

  it('holds when change areas require more than six independent reviewers', () => {
    const input = passingInput()
    input.change_areas = ['auth', 'ai', 'privacy', 'database']

    expect(evaluateSpecialistReviewGate(input)).toMatchObject({
      status: 'fail',
      reason: 'reviewer_count_out_of_range',
      issue_id: 'ISSUE-165',
      pr_number: 344,
      head_sha: headSha,
      round: 1,
      required_roles: [
        ...baseRoles,
        'security-authorization',
        'ai-safety-privacy',
        'privacy-data-protection',
        'database-migration',
      ],
      review_gate: {
        status: 'fail',
        reviewed_sha: headSha,
        required_reviewers: 7,
        completed_reviewers: 3,
      },
    })
  })

  it.each([
    [
      {
        severity: 'P1',
        evidence: 'missing required fix',
        file: 'scripts/example.ts',
        line: 1,
        reviewed_sha: headSha,
      },
      'invalid_finding',
    ],
    [
      {
        severity: 'P3',
        evidence: 'unsupported severity',
        file: 'scripts/example.ts',
        line: 1,
        required_fix: 'use a blocking severity',
        reviewed_sha: headSha,
      },
      'invalid_finding',
    ],
    [
      {
        severity: 'P1',
        evidence: 'unsafe path',
        file: '../outside.ts',
        line: 1,
        required_fix: 'use a repository-relative path',
        reviewed_sha: headSha,
      },
      'invalid_finding',
    ],
    [
      {
        severity: 'P1',
        evidence: 'stale finding',
        file: 'scripts/example.ts',
        line: 1,
        required_fix: 'review the latest SHA',
        reviewed_sha: 'c'.repeat(40),
      },
      'finding_sha_mismatch',
    ],
    [
      {
        severity: 'P1',
        evidence: 'unknown field',
        file: 'scripts/example.ts',
        line: 1,
        required_fix: 'remove free-form extras',
        reviewed_sha: headSha,
        prompt: 'forbidden-finding-prompt-sentinel',
      },
      'unknown_finding_field',
    ],
  ])('validates every actionable finding with reason %s', (finding, reason) => {
    const input = passingInput()
    const rawInput = {
      ...input,
      reviews: [
        { ...review('spec-acceptance'), status: 'finding', findings: [finding] },
        ...input.reviews.slice(1),
      ],
    }

    const result = evaluateSpecialistReviewGate(rawInput)
    expect(result).toMatchObject({ status: 'fail', reason })
    expect(JSON.stringify(result)).not.toContain('forbidden-finding-prompt-sentinel')
  })

  it.each([
    [
      'go',
      [
        {
          severity: 'P2',
          evidence: 'status disagrees with finding count',
          file: 'scripts/example.ts',
          line: 1,
          required_fix: 'return finding status',
          reviewed_sha: headSha,
        },
      ],
    ],
    ['finding', []],
  ])('rejects review status %s when it disagrees with findings', (status, findings) => {
    const input = passingInput()
    const rawInput = {
      ...input,
      reviews: [{ ...review('spec-acceptance'), status, findings }, ...input.reviews.slice(1)],
    }

    expect(evaluateSpecialistReviewGate(rawInput)).toMatchObject({
      status: 'fail',
      reason: 'review_status_mismatch',
    })
  })
})
