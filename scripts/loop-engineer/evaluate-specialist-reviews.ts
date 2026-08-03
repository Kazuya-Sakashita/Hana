import { evaluateSpecialistReviewGate, type SpecialistReviewInput } from './specialist-review-gate'

const maxInputBytes = 64 * 1024
const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const baseRoles = ['spec-acceptance', 'implementation-correctness', 'test-reliability']

function baselineInput(): SpecialistReviewInput {
  return {
    schema_version: 'loop-engineer-review-input/v1',
    issue_id: 'ISSUE-165',
    pr_number: 344,
    merge_base_sha: mergeBaseSha,
    head_sha: headSha,
    round: 1,
    parallel_slots: 2,
    change_areas: ['docs', 'tests'],
    reviews: baseRoles.map((role) => ({
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
    })),
  }
}

function contractInputs() {
  const staleSha = baselineInput()
  staleSha.reviews[0]!.reviewed_sha = 'c'.repeat(40)

  const minorityFinding = baselineInput()
  minorityFinding.reviews[1]!.status = 'finding'
  minorityFinding.reviews[1]!.findings = [
    {
      severity: 'P1',
      evidence: 'synthetic contract evidence',
      file: 'scripts/loop-engineer/specialist-review-gate.ts',
      line: 1,
      required_fix: 'retain the synthetic finding as blocking evidence',
      reviewed_sha: headSha,
    },
  ]

  const reviewerTimeout = baselineInput()
  reviewerTimeout.reviews[2]!.status = 'timeout'

  const roundFour = { ...baselineInput(), round: 4 }
  const tooManyReviewers = {
    ...baselineInput(),
    change_areas: ['auth', 'ai', 'privacy', 'database'],
  }

  return [
    {
      name: 'baseline-pass',
      input: baselineInput(),
      status: 'pass',
      reason: 'all_required_reviews_passed',
    },
    { name: 'stale-sha', input: staleSha, status: 'fail', reason: 'review_sha_mismatch' },
    {
      name: 'minority-finding',
      input: minorityFinding,
      status: 'fail',
      reason: 'actionable_findings_present',
    },
    {
      name: 'reviewer-timeout',
      input: reviewerTimeout,
      status: 'fail',
      reason: 'reviewer_timeout',
    },
    { name: 'round-four', input: roundFour, status: 'fail', reason: 'review_round_exceeded' },
    {
      name: 'more-than-six-reviewers',
      input: tooManyReviewers,
      status: 'fail',
      reason: 'reviewer_count_out_of_range',
    },
  ]
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function failInvalidInput(): void {
  writeJson(evaluateSpecialistReviewGate(null))
  process.exitCode = 1
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

function runContract(): void {
  const checks = contractInputs().map(({ name, input, status, reason }) => {
    const actual = evaluateSpecialistReviewGate(input)
    return {
      name,
      status: actual.status,
      reason: actual.reason,
      passed: actual.status === status && actual.reason === reason,
    }
  })
  const passed = checks.every(({ passed: checkPassed }) => checkPassed)

  writeJson({
    schema_version: 'loop-engineer-review-contract/v1',
    issue_id: 'ISSUE-165',
    mode: 'contract',
    result: passed ? 'pass' : 'fail',
    evidence_policy: 'status-only',
    checks: checks.map(({ passed: _passed, ...check }) => check),
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
  if (args.length > 0) {
    failInvalidInput()
    return
  }

  const document = await readStdin()
  if (document === null) {
    failInvalidInput()
    return
  }

  try {
    const result = evaluateSpecialistReviewGate(JSON.parse(document))
    writeJson(result)
    if (result.status !== 'pass') process.exitCode = 1
  } catch {
    failInvalidInput()
  }
}

void main().catch(() => failInvalidInput())
