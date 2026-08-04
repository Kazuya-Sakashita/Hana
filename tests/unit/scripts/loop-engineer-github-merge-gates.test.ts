import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubMergeGates,
  type GitHubMergeGateInput,
} from '../../../scripts/loop-engineer/github-merge-gates'

const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const completedRoles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

function eligibleGateInput(): GitHubMergeGateInput {
  return {
    schema_version: 'loop-engineer-github-gate-input/v2',
    review_attestation: {
      schema_version: 'loop-engineer-review-attestation/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      merge_base_sha: mergeBaseSha,
      head_sha: headSha,
      round: 1,
      change_areas: ['docs', 'tests'],
      status: 'pass',
      reason: 'all_required_reviews_passed',
      required_roles: [...completedRoles],
      review_gate: {
        schema_version: 'loop-engineer-review-gate/v1',
        status: 'pass',
        reviewed_sha: headSha,
        required_reviewers: 3,
        completed_reviewers: 3,
        actionable_findings: 0,
        completed_roles: [...completedRoles],
      },
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
        completed_roles: [...completedRoles],
      },
    },
  }
}

function rulesetChangeInput(): GitHubMergeGateInput {
  const input = eligibleGateInput()
  const operationsRole = 'ci-supply-chain-operations'
  const changeAreas = ['ci', 'workflow', 'ruleset-change', 'repository-setting-change']

  input.review_attestation.change_areas = [...changeAreas]
  input.review_attestation.required_roles.push(operationsRole)
  input.review_attestation.review_gate.required_reviewers = 4
  input.review_attestation.review_gate.completed_reviewers = 4
  input.review_attestation.review_gate.completed_roles.push(operationsRole)
  input.merge_input.change_areas = [...changeAreas]
  input.merge_input.required_checks.push({ name: 'supply-chain', status: 'success' })
  input.merge_input.review_gate.required_reviewers = 4
  input.merge_input.review_gate.completed_reviewers = 4
  input.merge_input.review_gate.completed_roles.push(operationsRole)

  return input
}

describe('evaluateGitHubMergeGates', () => {
  it('passes both required checks for complete low-risk evidence on the live PR SHA', () => {
    expect(evaluateGitHubMergeGates(eligibleGateInput(), headSha)).toEqual({
      schema_version: 'loop-engineer-github-gate-evaluation/v2',
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

  it('requires the protected GitHub Environment for HUMAN_REQUIRED instead of caller input', () => {
    expect(evaluateGitHubMergeGates(rulesetChangeInput(), headSha)).toMatchObject({
      issue_id: 'ISSUE-166',
      pr_number: 345,
      head_sha: headSha,
      specialist_review_gate: { status: 'success' },
      merge_eligibility: {
        status: 'human_approval_required',
        decision: 'HUMAN_REQUIRED',
        reason: 'ruleset_change',
      },
    })
  })

  it('rejects legacy caller-supplied human approval and raw finding-bearing review input', () => {
    const input = eligibleGateInput() as unknown as Record<string, unknown>
    input.human_approval = {
      status: 'approved',
      reason: 'ruleset_change',
      approved_head_sha: headSha,
    }

    expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
      issue_id: null,
      specialist_review_gate: { status: 'failure', reason: 'unknown_field' },
      merge_eligibility: { status: 'failure', decision: 'HOLD', reason: 'unknown_field' },
    })
  })

  it('fails closed for a stale live PR SHA', () => {
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

  it('fails closed when the status-only attestation is pending or failed', () => {
    for (const status of ['pending', 'fail'] as const) {
      const input = eligibleGateInput()
      input.review_attestation.status = status
      input.review_attestation.reason =
        status === 'pending' ? 'required_reviewer_missing' : 'review_status_mismatch'
      input.review_attestation.review_gate.status = status
      input.merge_input.review_gate.status = status

      expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
        specialist_review_gate: { status: 'failure' },
        merge_eligibility: { status: 'failure', decision: 'HOLD' },
      })
    }
  })

  it('compares attestation roles as a set, independent of JSON property and array order', () => {
    const input = eligibleGateInput()
    input.review_attestation.required_roles.reverse()
    input.review_attestation.review_gate = {
      completed_roles: [...completedRoles].reverse(),
      actionable_findings: 0,
      completed_reviewers: 3,
      required_reviewers: 3,
      reviewed_sha: headSha,
      status: 'pass',
      schema_version: 'loop-engineer-review-gate/v1',
    }

    expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
      specialist_review_gate: { status: 'success' },
      merge_eligibility: { status: 'success', decision: 'AUTO_MERGE_ELIGIBLE' },
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

  it('rejects malformed attestation fields instead of coercing their types', () => {
    const input = eligibleGateInput() as unknown as {
      review_attestation: Record<string, unknown>
    }
    input.review_attestation.status = ['pass']

    expect(evaluateGitHubMergeGates(input, headSha)).toMatchObject({
      specialist_review_gate: { status: 'failure', reason: 'invalid_review_attestation' },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'invalid_review_attestation',
      },
    })
  })
})
