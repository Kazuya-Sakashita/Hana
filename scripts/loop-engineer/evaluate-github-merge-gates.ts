import { evaluateGitHubMergeGates, type GitHubMergeGateInput } from './github-merge-gates'

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

function contractInput(): GitHubMergeGateInput {
  return {
    schema_version: 'loop-engineer-github-gate-input/v1',
    review_input: {
      schema_version: 'loop-engineer-review-input/v1',
      issue_id: 'ISSUE-166',
      pr_number: 345,
      merge_base_sha: contractMergeBaseSha,
      head_sha: contractHeadSha,
      round: 1,
      parallel_slots: 3,
      change_areas: ['docs', 'tests'],
      reviews: contractRoles.map((role) => ({
        role,
        reviewer_instance_id: `reviewer_${role.replaceAll('-', '_')}`,
        reviewed_issue_id: 'ISSUE-166',
        reviewed_merge_base_sha: contractMergeBaseSha,
        reviewed_round: 1,
        reviewed_sha: contractHeadSha,
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
      head_sha: contractHeadSha,
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
        reviewed_sha: contractHeadSha,
        required_reviewers: 3,
        completed_reviewers: 3,
        actionable_findings: 0,
        completed_roles: [...contractRoles],
      },
    },
    human_approval: {
      status: 'absent',
      reason: null,
      approved_head_sha: null,
    },
  }
}

function runContract(): void {
  const lowRisk = contractInput()

  const humanRequired = contractInput()
  humanRequired.review_input.change_areas = ['ci', 'ruleset-change']
  humanRequired.review_input.reviews.push({
    role: 'ci-supply-chain-operations',
    reviewer_instance_id: 'reviewer_ci_supply_chain_operations',
    reviewed_issue_id: 'ISSUE-166',
    reviewed_merge_base_sha: contractMergeBaseSha,
    reviewed_round: 1,
    reviewed_sha: contractHeadSha,
    status: 'go',
    read_only: true,
    independent_context: true,
    other_reviewer_outputs_visible: false,
    findings: [],
  })
  humanRequired.merge_input.change_areas = [...humanRequired.review_input.change_areas]
  humanRequired.merge_input.required_checks.push({ name: 'supply-chain', status: 'success' })
  humanRequired.merge_input.review_gate.required_reviewers = 4
  humanRequired.merge_input.review_gate.completed_reviewers = 4
  humanRequired.merge_input.review_gate.completed_roles.push('ci-supply-chain-operations')
  humanRequired.human_approval = {
    status: 'approved',
    reason: 'ruleset_change',
    approved_head_sha: contractHeadSha,
  }

  const hold = structuredClone(humanRequired)
  hold.review_input.reviews[0]!.status = 'timeout'
  hold.human_approval = {
    status: 'approved',
    reason: 'review_attestation_mismatch',
    approved_head_sha: contractHeadSha,
  }

  const cases = [
    { name: 'low-risk-auto', input: lowRisk, expectedSha: contractHeadSha },
    { name: 'approved-human-required', input: humanRequired, expectedSha: contractHeadSha },
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
    checks[1]?.merge === 'success' &&
    checks
      .slice(2)
      .every(({ specialist, merge }) => specialist === 'failure' && merge === 'failure')

  writeJson({
    schema_version: 'loop-engineer-github-gate-contract/v1',
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
  if (args.length !== 2 || !expectedHeadShaArg || !checkArg) {
    invalidInput()
    return
  }

  const expectedHeadSha = expectedHeadShaArg.slice('--expected-head-sha='.length)
  const check = checkArg.slice('--check='.length)
  if (!['specialist', 'merge'].includes(check)) {
    invalidInput()
    return
  }

  const document = await readStdin()
  if (document === null) {
    invalidInput()
    return
  }

  try {
    const evaluation = evaluateGitHubMergeGates(JSON.parse(document), expectedHeadSha)
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
