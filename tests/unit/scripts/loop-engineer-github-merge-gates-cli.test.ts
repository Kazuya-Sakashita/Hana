import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import type { GitHubMergeGateInput } from '../../../scripts/loop-engineer/github-merge-gates'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/evaluate-github-merge-gates.ts', import.meta.url),
)
const headSha = 'b'.repeat(40)
const mergeBaseSha = 'a'.repeat(40)
const roles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

function passingInput(): GitHubMergeGateInput {
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
      issue_id: 'ISSUE-166',
      pr_number: 345,
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
      review_gate: reviewGate,
    },
  }
}

function runCli(args: string[], stdin = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_REPOSITORY: '',
      LOOP_ENGINEER_APP_ID: '',
    },
    input: stdin,
  })
}

function expectJsonOnlyFailure(result: ReturnType<typeof runCli>, reason: string) {
  expect(result.status).toBe(1)
  expect(result.stderr).toBe('')
  expect(() => JSON.parse(result.stdout)).not.toThrow()
  expect(JSON.parse(result.stdout)).toMatchObject({
    merge_eligibility: { status: 'failure', decision: 'HOLD', reason },
  })
}

describe('ISSUE-166 GitHub merge gate CLI', () => {
  it.each(['specialist', 'merge'] as const)(
    'returns JSON-only success for the %s required check',
    (check) => {
      const result = runCli(
        [`--expected-head-sha=${headSha}`, `--check=${check}`],
        JSON.stringify(passingInput()),
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        schema_version: 'loop-engineer-github-gate-evaluation/v2',
        issue_id: 'ISSUE-166',
        head_sha: headSha,
        specialist_review_gate: { status: 'success' },
        merge_eligibility: { status: 'success' },
      })
    },
  )

  it('exits nonzero for HUMAN_REQUIRED until the protected Environment approves it', () => {
    const input = passingInput()
    input.review_attestation.change_areas = ['ruleset-change']
    input.merge_input.change_areas = ['ruleset-change']
    input.review_attestation.required_roles.push('ci-supply-chain-operations')
    input.review_attestation.review_gate.required_reviewers = 4
    input.review_attestation.review_gate.completed_reviewers = 4
    input.review_attestation.review_gate.completed_roles.push('ci-supply-chain-operations')
    input.merge_input.review_gate.required_reviewers = 4
    input.merge_input.review_gate.completed_reviewers = 4
    input.merge_input.review_gate.completed_roles.push('ci-supply-chain-operations')
    input.merge_input.required_checks.push({ name: 'supply-chain', status: 'success' })
    const result = runCli(
      [`--expected-head-sha=${headSha}`, '--check=merge'],
      JSON.stringify(input),
    )

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      merge_eligibility: {
        status: 'human_approval_required',
        decision: 'HUMAN_REQUIRED',
        reason: 'ruleset_change',
      },
    })
  })

  it('routes a fourth-round attestation through live dedicated-App verification', () => {
    const input = passingInput() as unknown as {
      schema_version: string
      review_attestation: Record<string, unknown>
      merge_input: GitHubMergeGateInput['merge_input']
    }
    input.review_attestation.schema_version = 'loop-engineer-review-attestation/v2'
    input.review_attestation.issue_id = 'ISSUE-172'
    input.review_attestation.pr_number = 355
    input.review_attestation.round = 4
    input.review_attestation.review_round_exception = {
      schema_version: 'loop-engineer-review-round-exception/v1',
      issue_id: 'ISSUE-172',
      pr_number: 355,
      merge_base_sha: mergeBaseSha,
      head_sha: headSha,
      max_round: 5,
    }
    input.merge_input.issue_id = 'ISSUE-172'
    input.merge_input.pr_number = 355

    const result = runCli(
      [`--expected-head-sha=${headSha}`, '--check=merge'],
      JSON.stringify(input),
    )

    expectJsonOnlyFailure(result, 'terminal_review_limit')
  })

  it('routes a terminal-HOLD successor through live lineage proof verification', () => {
    const input = passingInput() as unknown as {
      schema_version: string
      review_attestation: Record<string, unknown>
      merge_input: GitHubMergeGateInput['merge_input']
      review_lineage_supersession?: Record<string, unknown>
    }
    input.schema_version = 'loop-engineer-github-gate-input/v3'
    input.review_attestation.issue_id = 'ISSUE-175'
    input.review_attestation.pr_number = 361
    input.merge_input.issue_id = 'ISSUE-175'
    input.merge_input.pr_number = 361
    input.review_lineage_supersession = {
      schema_version: 'loop-engineer-review-lineage-supersession/v1',
      review_lineage_id: 'lineage-issue-172',
      predecessor_issue_id: 'ISSUE-172',
      predecessor_issue_number: 354,
      predecessor_pr_number: 355,
      predecessor_head_sha: '2f0eaf7ee713bfd140269720a7d593e8f007c5a7',
      successor_issue_id: 'ISSUE-175',
      successor_issue_number: 359,
      successor_pr_number: 361,
      merge_base_sha: mergeBaseSha,
      head_sha: headSha,
      finding_ids: ['gh_cli_pagination_contract', 'main_sha_race', 'status_metadata_allowlist'],
      succession: 1,
      review_round: 1,
    }

    const result = runCli(
      [`--expected-head-sha=${headSha}`, '--check=merge'],
      JSON.stringify(input),
    )

    expectJsonOnlyFailure(result, 'invalid_repository')
  })

  it('requires a protected lineage proof for a trusted patch-id match', () => {
    const result = runCli(
      [`--expected-head-sha=${headSha}`, '--check=merge', '--review-lineage-required=true'],
      JSON.stringify(passingInput()),
    )

    expectJsonOnlyFailure(result, 'review_lineage_supersession_not_verified')
  })

  it.each([
    [
      'stale SHA',
      (input: ReturnType<typeof passingInput>) => input,
      'c'.repeat(40),
      'review_attestation_mismatch',
    ],
    [
      'review timeout',
      (input: ReturnType<typeof passingInput>) => {
        input.review_attestation.status = 'fail'
        input.review_attestation.reason = 'reviewer_timeout'
        input.review_attestation.review_gate.status = 'fail'
        input.merge_input.review_gate.status = 'fail'
        return input
      },
      headSha,
      'review_attestation_mismatch',
    ],
    [
      'merge conflict',
      (input: ReturnType<typeof passingInput>) => {
        input.merge_input.required_checks.find(({ name }) => name === 'merge-conflict')!.status =
          'failure'
        return input
      },
      headSha,
      'merge_conflict_detected',
    ],
  ] as const)('returns JSON-only failure for %s', (_name, mutate, expectedSha, reason) => {
    const result = runCli(
      [`--expected-head-sha=${expectedSha}`, '--check=merge'],
      JSON.stringify(mutate(passingInput())),
    )

    expectJsonOnlyFailure(result, reason)
  })

  it.each([
    ['unknown check mode', [`--expected-head-sha=${headSha}`, '--check=unknown'], '{}'],
    ['malformed JSON', [`--expected-head-sha=${headSha}`, '--check=merge'], '{'],
    ['oversized input', [`--expected-head-sha=${headSha}`, '--check=merge'], 'x'.repeat(65 * 1024)],
  ] as const)('fails closed with JSON-only output for %s', (_name, args, stdin) => {
    const result = runCli([...args], stdin)

    expectJsonOnlyFailure(result, 'invalid_input')
  })

  it('runs the status-only contract matrix used by pr:gate', () => {
    const result = runCli(['--', '--mode=contract'])
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(output).toMatchObject({
      schema_version: 'loop-engineer-github-gate-contract/v2',
      issue_id: 'ISSUE-166',
      mode: 'contract',
      result: 'pass',
      evidence_policy: 'status-only',
    })
    expect(output.checks).toEqual([
      { name: 'low-risk-auto', specialist: 'success', merge: 'success' },
      {
        name: 'human-required-protected-environment',
        specialist: 'success',
        merge: 'human_approval_required',
      },
      { name: 'stale-workflow-sha', specialist: 'failure', merge: 'failure' },
      { name: 'hold-not-overridden', specialist: 'failure', merge: 'failure' },
      { name: 'malformed-input', specialist: 'failure', merge: 'failure' },
    ])
  })
})
