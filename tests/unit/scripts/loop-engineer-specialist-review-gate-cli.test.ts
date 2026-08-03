import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const cliPath = fileURLToPath(
  new URL('../../../scripts/loop-engineer/evaluate-specialist-reviews.ts', import.meta.url),
)
const headSha = 'b'.repeat(40)
const roles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']
const passingInput = {
  schema_version: 'loop-engineer-review-input/v1',
  issue_id: 'ISSUE-165',
  pr_number: 344,
  merge_base_sha: 'a'.repeat(40),
  head_sha: headSha,
  round: 1,
  parallel_slots: 2,
  change_areas: ['docs', 'tests'],
  reviews: roles.map((role) => ({
    role,
    reviewer_instance_id: `reviewer_${role.replaceAll('-', '_')}`,
    reviewed_issue_id: 'ISSUE-165',
    reviewed_merge_base_sha: 'a'.repeat(40),
    reviewed_round: 1,
    reviewed_sha: headSha,
    status: 'go',
    read_only: true,
    independent_context: true,
    other_reviewer_outputs_visible: false,
    findings: [],
  })),
}

function runCli(args: string[], stdin = '') {
  return spawnSync(process.execPath, ['--import', 'tsx', cliPath, ...args], {
    cwd: fileURLToPath(new URL('../../..', import.meta.url)),
    encoding: 'utf8',
    input: stdin,
  })
}

describe('ISSUE-165 specialist review gate CLI', () => {
  it('evaluates one status-only stdin document and writes JSON only', () => {
    const result = runCli([], JSON.stringify(passingInput))

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      schema_version: 'loop-engineer-review-evaluation/v1',
      status: 'pass',
      reason: 'all_required_reviews_passed',
      head_sha: headSha,
      review_gate: {
        status: 'pass',
        required_reviewers: 3,
        actionable_findings: 0,
      },
    })
  })

  it('fails closed without echoing invalid stdin', () => {
    const result = runCli([], 'forbidden-cli-input-sentinel')

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: 'fail',
      reason: 'invalid_input',
      issue_id: null,
      head_sha: null,
    })
    expect(result.stdout).not.toContain('forbidden-cli-input-sentinel')
  })

  it('returns exit 1 and JSON-only output for valid fail and pending evaluations', () => {
    const staleSha = structuredClone(passingInput)
    staleSha.reviews[0]!.reviewed_sha = 'c'.repeat(40)

    const minorityFinding = {
      ...structuredClone(passingInput),
      reviews: passingInput.reviews.map((reviewInput, index) =>
        index === 1
          ? {
              ...reviewInput,
              status: 'finding',
              findings: [
                {
                  severity: 'P1',
                  evidence: 'synthetic CLI evidence',
                  file: 'scripts/example.ts',
                  line: 1,
                  required_fix: 'retain the finding',
                  reviewed_sha: headSha,
                },
              ],
            }
          : reviewInput,
      ),
    }

    const timeout = {
      ...structuredClone(passingInput),
      reviews: passingInput.reviews.map((reviewInput, index) =>
        index === 2 ? { ...reviewInput, status: 'timeout' } : reviewInput,
      ),
    }
    const missingReviewer = {
      ...structuredClone(passingInput),
      reviews: passingInput.reviews.slice(0, 2),
    }

    for (const [input, status, reason] of [
      [staleSha, 'fail', 'review_sha_mismatch'],
      [minorityFinding, 'fail', 'actionable_findings_present'],
      [timeout, 'fail', 'reviewer_timeout'],
      [missingReviewer, 'pending', 'required_reviewer_missing'],
    ] as const) {
      const result = runCli([], JSON.stringify(input))

      expect(result.status).toBe(1)
      expect(result.stderr).toBe('')
      expect(JSON.parse(result.stdout)).toMatchObject({ status, reason })
    }
  })

  it('runs the side-effect-free contract matrix used by pr:gate', () => {
    const result = runCli(['--', '--mode=contract'])
    const output = JSON.parse(result.stdout)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    expect(output).toMatchObject({
      schema_version: 'loop-engineer-review-contract/v1',
      issue_id: 'ISSUE-165',
      mode: 'contract',
      result: 'pass',
      evidence_policy: 'status-only',
    })
    expect(output.checks).toEqual([
      { name: 'baseline-pass', status: 'pass', reason: 'all_required_reviews_passed' },
      { name: 'stale-sha', status: 'fail', reason: 'review_sha_mismatch' },
      { name: 'minority-finding', status: 'fail', reason: 'actionable_findings_present' },
      { name: 'reviewer-timeout', status: 'fail', reason: 'reviewer_timeout' },
      { name: 'round-four', status: 'fail', reason: 'review_round_exceeded' },
      {
        name: 'more-than-six-reviewers',
        status: 'fail',
        reason: 'reviewer_count_out_of_range',
      },
    ])
  })
})
