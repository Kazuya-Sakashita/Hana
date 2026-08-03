import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubMergeGates,
  type GitHubMergeGateInput,
} from '../../../scripts/loop-engineer/github-merge-gates'

const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)

function eligibleGateInput(): GitHubMergeGateInput {
  const completedRoles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

  return {
    schema_version: 'loop-engineer-github-gate-input/v1',
    review_input: {
      schema_version: 'loop-engineer-review-input/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      merge_base_sha: mergeBaseSha,
      head_sha: headSha,
      round: 1,
      parallel_slots: 3,
      change_areas: ['docs', 'tests'],
      reviews: completedRoles.map((role) => ({
        role,
        reviewer_instance_id: `reviewer_${role.replaceAll('-', '_')}`,
        reviewed_issue_id: 'ISSUE-166',
        reviewed_merge_base_sha: mergeBaseSha,
        reviewed_round: 1,
        reviewed_sha: headSha,
        status: 'go',
        read_only: true,
        independent_context: true,
        other_reviewer_outputs_visible: false,
        findings: [],
      })),
    },
    merge_input: {
      schema_version: 'loop-engineer-merge-input/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
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
        completed_roles: completedRoles,
      },
    },
    human_approval: {
      status: 'absent',
      reason: null,
      approved_head_sha: null,
    },
  }
}

function approvedRulesetChangeInput() {
  const input = eligibleGateInput()
  const operationsRole = 'ci-supply-chain-operations'

  input.review_input.change_areas = [
    'ci',
    'workflow',
    'ruleset-change',
    'repository-setting-change',
  ]
  input.review_input.reviews.push({
    role: operationsRole,
    reviewer_instance_id: 'reviewer_ci_supply_chain_operations',
    reviewed_issue_id: 'ISSUE-166',
    reviewed_merge_base_sha: mergeBaseSha,
    reviewed_round: 1,
    reviewed_sha: headSha,
    status: 'go',
    read_only: true,
    independent_context: true,
    other_reviewer_outputs_visible: false,
    findings: [],
  })
  input.merge_input.change_areas = [...input.review_input.change_areas]
  input.merge_input.required_checks.push({ name: 'supply-chain', status: 'success' })
  input.merge_input.review_gate.required_reviewers = 4
  input.merge_input.review_gate.completed_reviewers = 4
  input.merge_input.review_gate.completed_roles.push(operationsRole)
  input.human_approval = {
    status: 'approved',
    reason: 'ruleset_change',
    approved_head_sha: headSha,
  }

  return input
}

describe('evaluateGitHubMergeGates', () => {
  it('passes both required checks for complete low-risk evidence on the workflow SHA', () => {
    expect(evaluateGitHubMergeGates(eligibleGateInput(), headSha)).toEqual({
      schema_version: 'loop-engineer-github-gate-evaluation/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      head_sha: headSha,
      specialist_review_gate: {
        status: 'success',
        reason: 'all_required_reviews_passed',
      },
      merge_eligibility: {
        status: 'success',
        decision: 'AUTO_MERGE_ELIGIBLE',
        reason: 'all_required_evidence_passed',
      },
      auto_merge_reservation: 'disabled_until_issue_167_human_go',
    })
  })

  it('passes merge eligibility for HUMAN_REQUIRED only with matching SHA-bound approval', () => {
    expect(evaluateGitHubMergeGates(approvedRulesetChangeInput(), headSha)).toMatchObject({
      issue_id: 'ISSUE-166',
      pr_number: 345,
      head_sha: headSha,
      specialist_review_gate: {
        status: 'success',
        reason: 'all_required_reviews_passed',
      },
      merge_eligibility: {
        status: 'success',
        decision: 'HUMAN_REQUIRED',
        reason: 'ruleset_change',
      },
      auto_merge_reservation: 'disabled_until_issue_167_human_go',
    })
  })

  it('fails merge eligibility when the supplied merge attestation disagrees with fresh review evaluation', () => {
    const input = eligibleGateInput()
    input.review_input.reviews[0]!.status = 'timeout'

    expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
      specialist_review_gate: {
        status: 'failure',
        reason: 'reviewer_timeout',
      },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_attestation_mismatch',
      },
    })
  })

  it('returns a redacted HOLD for malformed workflow input', () => {
    expect(evaluateGitHubMergeGates(null, headSha)).toEqual({
      schema_version: 'loop-engineer-github-gate-evaluation/v1',
      issue_id: null,
      pr_number: null,
      head_sha: null,
      specialist_review_gate: {
        status: 'failure',
        reason: 'invalid_input',
      },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'invalid_input',
      },
      auto_merge_reservation: 'disabled_until_issue_167_human_go',
    })
  })

  it('fails closed when review and merge evidence classify different change areas', () => {
    const input = eligibleGateInput()
    input.merge_input.change_areas = ['docs']

    expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
      specialist_review_gate: { status: 'success' },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_attestation_mismatch',
      },
    })
  })

  it('reports a fixed workflow SHA mismatch instead of a misleading review success reason', () => {
    expect(evaluateGitHubMergeGates(eligibleGateInput(), 'c'.repeat(40))).toMatchObject({
      specialist_review_gate: {
        status: 'failure',
        reason: 'workflow_sha_mismatch',
      },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_attestation_mismatch',
      },
    })
  })
})
