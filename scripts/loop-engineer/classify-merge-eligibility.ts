import {
  classifyMergeEligibility,
  type MergeClassificationInput,
  type MergeClassificationReason,
  type MergeDecision,
} from './merge-classifier'

const maxInputBytes = 64 * 1024
const headSha = 'a'.repeat(40)

type ContractExpectation = {
  name: string
  input: MergeClassificationInput
  decision: MergeDecision
  reason: MergeClassificationReason
}

function eligibleInput(): MergeClassificationInput {
  return {
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
}

function contractExpectations(): ContractExpectation[] {
  const humanRequired = eligibleInput()
  humanRequired.change_areas = ['database', 'real-db-migration']
  humanRequired.required_checks.push({ name: 'database', status: 'success' })
  humanRequired.review_gate.required_reviewers = 4
  humanRequired.review_gate.completed_reviewers = 4
  humanRequired.review_gate.completed_roles.push('database-migration')

  const acceptanceIncomplete = eligibleInput()
  acceptanceIncomplete.required_checks[0] = {
    name: 'acceptance-criteria',
    status: 'failure',
  }

  const staleReview = eligibleInput()
  staleReview.head_sha = 'b'.repeat(40)

  const unknownRisk = eligibleInput()
  unknownRisk.change_areas = ['future-unknown-area']

  return [
    {
      name: 'low-risk-complete',
      input: eligibleInput(),
      decision: 'AUTO_MERGE_ELIGIBLE',
      reason: 'all_required_evidence_passed',
    },
    {
      name: 'real-db-migration',
      input: humanRequired,
      decision: 'HUMAN_REQUIRED',
      reason: 'real_db_migration',
    },
    {
      name: 'acceptance-incomplete',
      input: acceptanceIncomplete,
      decision: 'HOLD',
      reason: 'acceptance_criteria_incomplete',
    },
    {
      name: 'review-stale-after-new-commit',
      input: staleReview,
      decision: 'HOLD',
      reason: 'review_sha_mismatch',
    },
    {
      name: 'unknown-risk',
      input: unknownRisk,
      decision: 'HOLD',
      reason: 'unknown_change_area',
    },
  ]
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

function invalidInput(): void {
  writeJson(classifyMergeEligibility(null))
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
  const checks = contractExpectations().map(({ name, input, decision, reason }) => {
    const actual = classifyMergeEligibility(input)
    return {
      name,
      decision: actual.decision,
      reason: actual.reason,
      passed: actual.decision === decision && actual.reason === reason,
    }
  })
  const passed = checks.every((check) => check.passed)

  writeJson({
    schema_version: 'loop-engineer-merge-contract/v1',
    issue_id: 'ISSUE-164',
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
    invalidInput()
    return
  }

  const document = await readStdin()
  if (document === null) {
    invalidInput()
    return
  }

  try {
    writeJson(classifyMergeEligibility(JSON.parse(document)))
  } catch {
    invalidInput()
  }
}

void main().catch(() => invalidInput())
