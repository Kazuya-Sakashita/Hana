import { describe, expect, it } from 'vitest'

import {
  evaluateGitHubMergeGates,
  evaluateGitHubMergeGatesWithProtectedProofs,
  type GitHubMergeGateInput,
} from '../../../scripts/loop-engineer/github-merge-gates'
import {
  issue172Lineage,
  reviewLineageRegistrationExternalId,
  reviewLineageSupersessionExternalId,
  type ReviewLineageSupersessionProof,
  type ReviewLineageSupersessionAdapter,
} from '../../../scripts/loop-engineer/github-review-lineage-supersession'
import type { ReviewRoundExceptionAdapter } from '../../../scripts/loop-engineer/github-review-round-exception'

const repository = 'Kazuya-Sakashita/Hana'
const appId = 424242
const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const successorPrNumber = 361
const roles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']
const lineageProof = {
  schema_version: 'loop-engineer-review-lineage-supersession/v1' as const,
  review_lineage_id: issue172Lineage.review_lineage_id,
  predecessor_issue_id: issue172Lineage.predecessor_issue_id,
  predecessor_issue_number: issue172Lineage.predecessor_issue_number,
  predecessor_pr_number: issue172Lineage.predecessor_pr_number,
  predecessor_head_sha: issue172Lineage.predecessor_head_sha,
  successor_issue_id: issue172Lineage.successor_issue_id,
  successor_issue_number: issue172Lineage.successor_issue_number,
  successor_pr_number: successorPrNumber,
  merge_base_sha: mergeBaseSha,
  head_sha: headSha,
  finding_ids: [...issue172Lineage.finding_ids],
  succession: 1 as const,
  review_round: 1 as const,
}

function baseInput(issueId: string, prNumber: number): GitHubMergeGateInput {
  const reviewGate = {
    schema_version: 'loop-engineer-review-gate/v1' as const,
    status: 'pass' as const,
    reviewed_sha: headSha,
    required_reviewers: 3,
    completed_reviewers: 3,
    actionable_findings: 0,
    completed_roles: [...roles],
  }
  return {
    schema_version: 'loop-engineer-github-gate-input/v2',
    review_attestation: {
      schema_version: 'loop-engineer-review-attestation/v1',
      issue_id: issueId,
      pr_number: prNumber,
      merge_base_sha: mergeBaseSha,
      head_sha: headSha,
      round: 1,
      change_areas: ['docs', 'tests'],
      status: 'pass',
      reason: 'all_required_reviews_passed',
      required_roles: [...roles],
      review_gate: structuredClone(reviewGate),
    },
    merge_input: {
      schema_version: 'loop-engineer-merge-input/v1',
      issue_id: issueId,
      pr_number: prNumber,
      head_sha: headSha,
      change_areas: ['docs', 'tests'],
      required_checks: [
        { name: 'acceptance-criteria', status: 'success' },
        { name: 'unrelated-diff', status: 'success' },
        { name: 'merge-conflict', status: 'success' },
        { name: 'rollback-record', status: 'success' },
        { name: 'pr-gate', status: 'success' },
      ],
      review_gate: reviewGate,
    },
  }
}

function successorInput(): GitHubMergeGateInput {
  const input = baseInput('ISSUE-175', successorPrNumber)
  return {
    ...input,
    schema_version: 'loop-engineer-github-gate-input/v3',
    review_lineage_supersession: structuredClone(lineageProof),
  }
}

function approvedLineageAdapter(
  app = appId,
  approvedProof: ReviewLineageSupersessionProof = lineageProof,
): ReviewLineageSupersessionAdapter {
  return {
    async requestOidcToken() {
      throw new Error('unexpected_oidc_request')
    },
    async readOidcJwks() {
      throw new Error('unexpected_oidc_request')
    },
    nowUnixSeconds() {
      return 0
    },
    async readPullRequest(_repository, prNumber) {
      if (prNumber === issue172Lineage.predecessor_pr_number) {
        return {
          state: 'closed',
          draft: false,
          base_ref: 'main',
          current_main_sha: mergeBaseSha,
          head_sha: issue172Lineage.predecessor_head_sha,
          mergeable: false,
          merged: false,
          closing_issues: [{ repository, number: issue172Lineage.predecessor_issue_number }],
        }
      }
      return {
        state: 'open',
        draft: false,
        base_ref: 'main',
        current_main_sha: mergeBaseSha,
        head_sha: headSha,
        mergeable: true,
        merged: false,
        closing_issues: [{ repository, number: issue172Lineage.successor_issue_number }],
      }
    },
    async readCheckRuns(_repository, requestedHeadSha, name) {
      const runs = [
        {
          id: 200,
          app_id: app,
          name: 'review-lineage-registration',
          head_sha: issue172Lineage.predecessor_head_sha,
          external_id: reviewLineageRegistrationExternalId(approvedProof),
          status: 'completed',
          conclusion: 'success',
        },
        {
          id: 201,
          app_id: app,
          name: 'review-lineage-supersession',
          head_sha: headSha,
          external_id: reviewLineageSupersessionExternalId(approvedProof),
          status: 'completed',
          conclusion: 'success',
        },
      ]
      return runs.filter((run) => run.head_sha === requestedHeadSha && run.name === name)
    },
    async createCheckRun() {
      throw new Error('unexpected_write')
    },
    async updateCheckRun() {
      throw new Error('unexpected_write')
    },
  }
}

function unusedRoundAdapter(): ReviewRoundExceptionAdapter {
  return {
    async requestOidcToken() {
      throw new Error('unexpected_oidc_request')
    },
    async readOidcJwks() {
      throw new Error('unexpected_oidc_request')
    },
    nowUnixSeconds() {
      return 0
    },
    async readPullRequest() {
      throw new Error('unexpected_review_round_read')
    },
    async readCheckRuns() {
      throw new Error('unexpected_review_round_read')
    },
    async createCheckRun() {
      throw new Error('unexpected_write')
    },
    async updateCheckRun() {
      throw new Error('unexpected_write')
    },
  }
}

function approvedRoundAdapter(): ReviewRoundExceptionAdapter {
  return {
    ...unusedRoundAdapter(),
    async readPullRequest() {
      return {
        state: 'open',
        draft: false,
        base_ref: 'main',
        current_main_sha: mergeBaseSha,
        head_sha: headSha,
        mergeable: true,
      }
    },
    async readCheckRuns() {
      return [
        {
          id: 301,
          app_id: appId,
          name: 'review-round-exception',
          head_sha: headSha,
          external_id: `loop-engineer-review-round-exception/v1|ISSUE-175|${successorPrNumber}|${mergeBaseSha}|${headSha}|5`,
          status: 'completed',
          conclusion: 'success',
        },
      ]
    },
  }
}

describe('ISSUE-174 review lineage merge gate', () => {
  it('keeps ISSUE-172 / PR 355 in terminal HOLD even with a round-one attestation', () => {
    expect(evaluateGitHubMergeGates(baseInput('ISSUE-172', 355), headSha)).toMatchObject({
      specialist_review_gate: { status: 'failure', reason: 'terminal_review_limit' },
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'terminal_review_limit',
      },
    })

    expect(evaluateGitHubMergeGates(baseInput('ISSUE-172', 999), headSha)).toMatchObject({
      merge_eligibility: { decision: 'HOLD', reason: 'terminal_review_limit' },
    })
    expect(evaluateGitHubMergeGates(baseInput('ISSUE-999', 355), headSha)).toMatchObject({
      merge_eligibility: { decision: 'HOLD', reason: 'terminal_review_limit' },
    })

    const roundSix = baseInput('ISSUE-172', 355)
    roundSix.review_attestation.round = 6
    expect(evaluateGitHubMergeGates(roundSix, headSha)).toMatchObject({
      merge_eligibility: { decision: 'HOLD', reason: 'terminal_review_limit' },
    })
  })

  it('rejects ISSUE-175 when the protected lineage proof is omitted or caller-supplied only', () => {
    expect(
      evaluateGitHubMergeGates(baseInput('ISSUE-175', successorPrNumber), headSha),
    ).toMatchObject({
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_lineage_supersession_not_verified',
      },
    })
    expect(evaluateGitHubMergeGates(successorInput(), headSha)).toMatchObject({
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_lineage_supersession_not_verified',
      },
    })
  })

  it('rejects a renamed Issue when trusted patch matching identifies the terminal lineage', async () => {
    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        baseInput('ISSUE-999', 999),
        headSha,
        { repository, appId },
        { reviewRound: unusedRoundAdapter(), reviewLineage: approvedLineageAdapter() },
        true,
      ),
    ).resolves.toMatchObject({
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_lineage_supersession_not_verified',
      },
    })
  })

  it('accepts the successor only after live dedicated-App proof verification', async () => {
    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        successorInput(),
        headSha,
        { repository, appId },
        { reviewRound: unusedRoundAdapter(), reviewLineage: approvedLineageAdapter() },
      ),
    ).resolves.toMatchObject({
      issue_id: 'ISSUE-175',
      pr_number: successorPrNumber,
      specialist_review_gate: { status: 'success' },
      merge_eligibility: { status: 'success', decision: 'AUTO_MERGE_ELIGIBLE' },
    })
  })

  it('requires both protected proofs for a fourth-round successor review', async () => {
    const input = successorInput() as Extract<
      GitHubMergeGateInput,
      { schema_version: 'loop-engineer-github-gate-input/v3' }
    >
    input.review_attestation = {
      ...input.review_attestation,
      schema_version: 'loop-engineer-review-attestation/v2',
      round: 4,
      review_round_exception: {
        schema_version: 'loop-engineer-review-round-exception/v1',
        issue_id: 'ISSUE-175',
        pr_number: successorPrNumber,
        merge_base_sha: mergeBaseSha,
        head_sha: headSha,
        max_round: 5,
      },
    }
    input.review_lineage_supersession.review_round = 4

    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        input,
        headSha,
        { repository, appId },
        {
          reviewRound: approvedRoundAdapter(),
          reviewLineage: approvedLineageAdapter(appId, input.review_lineage_supersession),
        },
      ),
    ).resolves.toMatchObject({
      specialist_review_gate: { status: 'success' },
      merge_eligibility: { status: 'success', decision: 'AUTO_MERGE_ELIGIBLE' },
    })

    input.review_attestation.round = 6
    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        input,
        headSha,
        { repository, appId },
        {
          reviewRound: approvedRoundAdapter(),
          reviewLineage: approvedLineageAdapter(appId, input.review_lineage_supersession),
        },
      ),
    ).resolves.toMatchObject({
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'invalid_review_round_exception',
      },
    })
  })

  it('fails closed for a wrong-App or stale protected proof', async () => {
    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        successorInput(),
        headSha,
        { repository, appId },
        { reviewRound: unusedRoundAdapter(), reviewLineage: approvedLineageAdapter(appId + 1) },
      ),
    ).resolves.toMatchObject({
      merge_eligibility: {
        status: 'failure',
        decision: 'HOLD',
        reason: 'review_lineage_check_app_mismatch',
      },
    })

    const stale = successorInput() as Extract<
      GitHubMergeGateInput,
      { schema_version: 'loop-engineer-github-gate-input/v3' }
    >
    stale.review_lineage_supersession.head_sha = 'c'.repeat(40)
    await expect(
      evaluateGitHubMergeGatesWithProtectedProofs(
        stale,
        headSha,
        { repository, appId },
        { reviewRound: unusedRoundAdapter(), reviewLineage: approvedLineageAdapter() },
      ),
    ).resolves.toMatchObject({
      merge_eligibility: { status: 'failure', decision: 'HOLD' },
    })
  })
})
