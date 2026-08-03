import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/evaluate-github-merge-gates.ts', import.meta.url),
)
const headSha = 'b'.repeat(40)
const mergeBaseSha = 'a'.repeat(40)
const roles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

const passingInput = {
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
    reviews: roles.map((role) => ({
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
      completed_roles: roles,
    },
  },
  human_approval: {
    status: 'absent',
    reason: null,
    approved_head_sha: null,
  },
}

function runCli(args: string[], stdin = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    input: stdin,
  })
}

describe('ISSUE-166 GitHub merge gate CLI', () => {
  it.each(['specialist', 'merge'] as const)(
    'returns JSON-only success for the %s required check',
    (check) => {
      const result = runCli(
        [`--expected-head-sha=${headSha}`, `--check=${check}`],
        JSON.stringify(passingInput),
      )

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({
        schema_version: 'loop-engineer-github-gate-evaluation/v1',
        issue_id: 'ISSUE-166',
        head_sha: headSha,
        specialist_review_gate: { status: 'success' },
        merge_eligibility: { status: 'success' },
      })
    },
  )

  it('runs the status-only contract matrix used by pr:gate', () => {
    const result = runCli(['--', '--mode=contract'])
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(output).toMatchObject({
      schema_version: 'loop-engineer-github-gate-contract/v1',
      issue_id: 'ISSUE-166',
      mode: 'contract',
      result: 'pass',
      evidence_policy: 'status-only',
    })
    expect(output.checks).toEqual([
      { name: 'low-risk-auto', specialist: 'success', merge: 'success' },
      { name: 'approved-human-required', specialist: 'success', merge: 'success' },
      { name: 'stale-workflow-sha', specialist: 'failure', merge: 'failure' },
      { name: 'hold-not-overridden', specialist: 'failure', merge: 'failure' },
      { name: 'malformed-input', specialist: 'failure', merge: 'failure' },
    ])
  })
})
