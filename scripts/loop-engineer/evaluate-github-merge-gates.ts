import {
  evaluateGitHubMergeGates,
  evaluateGitHubMergeGatesWithProtectedProofs,
  type GitHubMergeGateInput,
} from './github-merge-gates'
import { createGitHubReviewLineageSupersessionAdapter } from './github-review-lineage-supersession'
import { createGitHubReviewRoundExceptionAdapter } from './github-review-round-exception'

const maxInputBytes = 64 * 1024
const contractHeadSha = 'b'.repeat(40)
const contractMergeBaseSha = 'a'.repeat(40)
const contractRoles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

async function readStdin(): Promise<string | null> {
  const chunks: Buffer[] = []
  let bytes = 0

  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    bytes += buffer.byteLength
    if (bytes > maxInputBytes) return null
    chunks.push(buffer)
  }

  return Buffer.concat(chunks).toString('utf8')
}

function invalidInput(): void {
  writeJson(evaluateGitHubMergeGates(null, ''))
  process.exitCode = 1
}

function hasProtectedProof(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    ((value as { schema_version?: unknown }).schema_version ===
      'loop-engineer-github-gate-input/v3' ||
      (typeof (value as { review_attestation?: unknown }).review_attestation === 'object' &&
        (value as { review_attestation?: { schema_version?: unknown } }).review_attestation
          ?.schema_version === 'loop-engineer-review-attestation/v2'))
  )
}

function contractInput(): GitHubMergeGateInput {
  const reviewGate = {
    schema_version: 'loop-engineer-review-gate/v1' as const,
    status: 'pass' as const,
    reviewed_sha: contractHeadSha,
    required_reviewers: 3,
    completed_reviewers: 3,
    actionable_findings: 0,
    completed_roles: [...contractRoles],
  }

  return {
    schema_version: 'loop-engineer-github-gate-input/v2',
    review_attestation: {
      schema_version: 'loop-engineer-review-attestation/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      merge_base_sha: contractMergeBaseSha,
      head_sha: contractHeadSha,
      round: 1,
      change_areas: ['docs', 'tests'],
      status: 'pass',
      reason: 'all_required_reviews_passed',
      required_roles: [...contractRoles],
      review_gate: structuredClone(reviewGate),
    },
    merge_input: {
      schema_version: 'loop-engineer-merge-input/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      head_sha: contractHeadSha,
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

function runContract(): void {
  const lowRisk = contractInput()

  const humanRequired = contractInput()
  const operationsRole = 'ci-supply-chain-operations'
  humanRequired.review_attestation.change_areas = ['ci', 'ruleset-change']
  humanRequired.review_attestation.required_roles.push(operationsRole)
  humanRequired.review_attestation.review_gate.required_reviewers = 4
  humanRequired.review_attestation.review_gate.completed_reviewers = 4
  humanRequired.review_attestation.review_gate.completed_roles.push(operationsRole)
  humanRequired.merge_input.change_areas = [...humanRequired.review_attestation.change_areas]
  humanRequired.merge_input.required_checks.push({ name: 'supply-chain', status: 'success' })
  humanRequired.merge_input.review_gate.required_reviewers = 4
  humanRequired.merge_input.review_gate.completed_reviewers = 4
  humanRequired.merge_input.review_gate.completed_roles.push(operationsRole)

  const hold = structuredClone(humanRequired)
  hold.review_attestation.status = 'fail'
  hold.review_attestation.reason = 'reviewer_timeout'
  hold.review_attestation.review_gate.status = 'fail'
  hold.merge_input.review_gate.status = 'fail'

  const cases = [
    { name: 'low-risk-auto', input: lowRisk, expectedSha: contractHeadSha },
    {
      name: 'human-required-protected-environment',
      input: humanRequired,
      expectedSha: contractHeadSha,
    },
    { name: 'stale-workflow-sha', input: lowRisk, expectedSha: 'c'.repeat(40) },
    { name: 'hold-not-overridden', input: hold, expectedSha: contractHeadSha },
    { name: 'malformed-input', input: null, expectedSha: contractHeadSha },
  ]
  const checks = cases.map(({ name, input, expectedSha }) => {
    const evaluation = evaluateGitHubMergeGates(input, expectedSha)
    return {
      name,
      specialist: evaluation.specialist_review_gate.status,
      merge: evaluation.merge_eligibility.status,
    }
  })
  const passed =
    checks[0]?.specialist === 'success' &&
    checks[0]?.merge === 'success' &&
    checks[1]?.specialist === 'success' &&
    checks[1]?.merge === 'human_approval_required' &&
    checks
      .slice(2)
      .every(({ specialist, merge }) => specialist === 'failure' && merge === 'failure')

  writeJson({
    schema_version: 'loop-engineer-github-gate-contract/v2',
    issue_id: 'ISSUE-166',
    mode: 'contract',
    result: passed ? 'pass' : 'fail',
    evidence_policy: 'status-only',
    checks,
  })
  if (!passed) process.exitCode = 1
}

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2)
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  if (args.length === 1 && args[0] === '--mode=contract') {
    runContract()
    return
  }
  const expectedHeadShaArg = args.find((arg) => arg.startsWith('--expected-head-sha='))
  const checkArg = args.find((arg) => arg.startsWith('--check='))
  const reviewLineageRequiredArg = args.find((arg) => arg.startsWith('--review-lineage-required='))
  if (
    (args.length !== 2 && args.length !== 3) ||
    !expectedHeadShaArg ||
    !checkArg ||
    (args.length === 3 && !reviewLineageRequiredArg)
  ) {
    invalidInput()
    return
  }

  const expectedHeadSha = expectedHeadShaArg.slice('--expected-head-sha='.length)
  const check = checkArg.slice('--check='.length)
  const reviewLineageRequired =
    reviewLineageRequiredArg?.slice('--review-lineage-required='.length) ?? 'false'
  if (!['specialist', 'merge'].includes(check)) {
    invalidInput()
    return
  }
  if (!['true', 'false'].includes(reviewLineageRequired)) {
    invalidInput()
    return
  }

  const document = await readStdin()
  if (document === null) {
    invalidInput()
    return
  }

  try {
    const input = JSON.parse(document) as unknown
    const evaluation =
      hasProtectedProof(input) || reviewLineageRequired === 'true'
        ? await evaluateGitHubMergeGatesWithProtectedProofs(
            input,
            expectedHeadSha,
            {
              repository: process.env.GITHUB_REPOSITORY ?? '',
              appId: Number(process.env.LOOP_ENGINEER_APP_ID ?? 0),
            },
            {
              reviewRound: createGitHubReviewRoundExceptionAdapter(),
              reviewLineage: createGitHubReviewLineageSupersessionAdapter(),
            },
            reviewLineageRequired === 'true',
          )
        : evaluateGitHubMergeGates(input, expectedHeadSha)
    writeJson(evaluation)
    const status =
      check === 'specialist'
        ? evaluation.specialist_review_gate.status
        : evaluation.merge_eligibility.status
    if (status !== 'success') process.exitCode = 1
  } catch {
    invalidInput()
  }
}

void main().catch(() => invalidInput())
