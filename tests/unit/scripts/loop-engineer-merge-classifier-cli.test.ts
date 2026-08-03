import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/classify-merge-eligibility.ts', import.meta.url),
)
const headSha = 'a'.repeat(40)

const eligibleInput = {
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
    completed_roles: ['spec-acceptance', 'implementation-correctness', 'test-reliability'],
  },
}

function runCli(args: string[], stdin = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    input: stdin,
  })
}

describe('ISSUE-164 merge classifier CLI', () => {
  it('classifies one status-only stdin document and writes only JSON to stdout', () => {
    const result = runCli([], JSON.stringify(eligibleInput))

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      schema_version: 'loop-engineer-merge-classification/v1',
      decision: 'AUTO_MERGE_ELIGIBLE',
      reason: 'all_required_evidence_passed',
      issue_id: 'ISSUE-164',
      pr_number: 343,
      head_sha: headSha,
    })
  })

  it('fails closed with a redacted result when stdin is not JSON', () => {
    const result = runCli([], 'forbidden-free-text-sentinel')

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      schema_version: 'loop-engineer-merge-classification/v1',
      decision: 'HOLD',
      reason: 'invalid_input',
      issue_id: null,
      pr_number: null,
      head_sha: null,
    })
    expect(result.stdout).not.toContain('forbidden-free-text-sentinel')
  })

  it('runs a side-effect-free contract matrix for pr:gate', () => {
    const result = runCli(['--', '--mode=contract'])
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(output).toMatchObject({
      schema_version: 'loop-engineer-merge-contract/v1',
      issue_id: 'ISSUE-164',
      mode: 'contract',
      result: 'pass',
      evidence_policy: 'status-only',
    })
    expect(output.checks).toEqual([
      {
        name: 'low-risk-complete',
        decision: 'AUTO_MERGE_ELIGIBLE',
        reason: 'all_required_evidence_passed',
      },
      {
        name: 'real-db-migration',
        decision: 'HUMAN_REQUIRED',
        reason: 'real_db_migration',
      },
      {
        name: 'acceptance-incomplete',
        decision: 'HOLD',
        reason: 'acceptance_criteria_incomplete',
      },
      {
        name: 'review-stale-after-new-commit',
        decision: 'HOLD',
        reason: 'review_sha_mismatch',
      },
      {
        name: 'unknown-risk',
        decision: 'HOLD',
        reason: 'unknown_change_area',
      },
    ])
  })
})
