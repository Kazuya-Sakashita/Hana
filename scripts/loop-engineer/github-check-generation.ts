import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

type CheckName =
  | 'merge-eligibility'
  | 'specialist-review-gate'
  | 'pr-gate'
  | 'validate'
  | 'local-registry'

type CheckConclusion = 'success' | 'failure'

export type PullRequestSnapshot = {
  state: string
  draft: boolean
  base_ref: string
  base_sha: string
  head_sha: string
  mergeable: boolean
  breaking_approval_label_present: boolean
}

type CreateCheckRunInput = {
  name: CheckName
  headSha: string
  externalId: string
  status: 'in_progress' | 'completed'
  conclusion?: CheckConclusion
  summary: string
}

type UpdateCheckRunInput = {
  name: CheckName
  status: 'completed'
  conclusion: CheckConclusion
  summary: string
}

export type GitHubCheckGenerationClient = {
  readPullRequest(repository: string, prNumber: number): Promise<PullRequestSnapshot>
  readLatestCheckRunIds(
    repository: string,
    headSha: string,
    name: CheckName,
    appId: number,
  ): Promise<number[]>
  createCheckRun(repository: string, input: CreateCheckRunInput): Promise<{ id: number }>
  updateCheckRun(repository: string, checkId: number, input: UpdateCheckRunInput): Promise<void>
}

export type CheckIds = {
  merge_eligibility_check_id: number
  specialist_review_check_id: number
  pr_gate_check_id: number
  validate_check_id: number
  local_registry_check_id: number
}

export type BeginCheckGenerationInput = {
  repository: string
  prNumber: number
  headSha: string
  baseSha: string
  runId: string
}

type MergeDecision = 'AUTO_MERGE_ELIGIBLE' | 'HUMAN_REQUIRED' | 'HOLD'

export type FinalizeCheckGenerationInput = {
  repository: string
  appId: number
  prNumber: number
  headSha: string
  baseSha: string
  checkIds: CheckIds
  specialistStatus: 'success' | 'failure'
  mergeDecision: MergeDecision
  mergeReason: string
  prGateResult: string
  openapiResult: string
  openapiBreakingResult: string
  openapiBreakingDetected: boolean
  registryResult: string
}

export type ApproveCheckGenerationInput = {
  repository: string
  appId: number
  prNumber: number
  headSha: string
  baseSha: string
  mergeEligibilityCheckId: number
  openapiBreakingDetected: boolean
  mergeReason: string
}

export type RevokeBreakingWaiverInput = {
  repository: string
  prNumber: number
  eventHeadSha: string
  runId: string
}

const generationOrder: Array<{ name: CheckName; output: keyof CheckIds }> = [
  { name: 'merge-eligibility', output: 'merge_eligibility_check_id' },
  { name: 'specialist-review-gate', output: 'specialist_review_check_id' },
  { name: 'pr-gate', output: 'pr_gate_check_id' },
  { name: 'validate', output: 'validate_check_id' },
  { name: 'local-registry', output: 'local_registry_check_id' },
]

const evidenceOrder: Array<{ name: CheckName; id: keyof CheckIds }> = [
  { name: 'pr-gate', id: 'pr_gate_check_id' },
  { name: 'validate', id: 'validate_check_id' },
  { name: 'local-registry', id: 'local_registry_check_id' },
  { name: 'specialist-review-gate', id: 'specialist_review_check_id' },
]

function isSha(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value)
}

function requireRepository(value: string): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value)) {
    throw new Error('invalid_repository')
  }
  return value
}

function requirePositiveInteger(value: number, reason: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(reason)
  return value
}

function requireSha(value: string, reason: string): string {
  if (!isSha(value)) throw new Error(reason)
  return value
}

function requireRunId(value: string): string {
  if (!/^\d+$/.test(value)) throw new Error('invalid_run_id')
  return value
}

function requireReason(value: string): string {
  if (!/^[a-z0-9_]{1,96}$/.test(value)) throw new Error('invalid_merge_reason')
  return value
}

function validateCheckIds(checkIds: CheckIds): void {
  for (const id of Object.values(checkIds)) requirePositiveInteger(id, 'invalid_check_id')
}

function isCurrentPullRequest(
  pullRequest: PullRequestSnapshot,
  input: { headSha: string; baseSha: string },
  requireBreakingApproval: boolean,
): boolean {
  return (
    pullRequest.state === 'open' &&
    pullRequest.draft === false &&
    pullRequest.base_ref === 'main' &&
    pullRequest.base_sha === input.baseSha &&
    pullRequest.head_sha === input.headSha &&
    pullRequest.mergeable === true &&
    (!requireBreakingApproval || pullRequest.breaking_approval_label_present)
  )
}

function normalizeResult(value: string): CheckConclusion {
  return value === 'success' ? 'success' : 'failure'
}

async function completeCheck(
  client: GitHubCheckGenerationClient,
  repository: string,
  id: number,
  name: CheckName,
  conclusion: CheckConclusion,
  summary: string,
): Promise<void> {
  await client.updateCheckRun(repository, id, {
    name,
    status: 'completed',
    conclusion,
    summary,
  })
}

async function failGeneration(
  client: GitHubCheckGenerationClient,
  repository: string,
  checkIds: CheckIds,
  summary: string,
): Promise<void> {
  for (const check of evidenceOrder) {
    await completeCheck(client, repository, checkIds[check.id], check.name, 'failure', summary)
  }
  await completeCheck(
    client,
    repository,
    checkIds.merge_eligibility_check_id,
    'merge-eligibility',
    'failure',
    summary,
  )
}

export async function beginCheckGeneration(
  input: BeginCheckGenerationInput,
  client: GitHubCheckGenerationClient,
): Promise<CheckIds> {
  const repository = requireRepository(input.repository)
  requirePositiveInteger(input.prNumber, 'invalid_pr_number')
  requireSha(input.headSha, 'invalid_head_sha')
  requireSha(input.baseSha, 'invalid_base_sha')
  requireRunId(input.runId)

  const pullRequest = await client.readPullRequest(repository, input.prNumber)
  if (!isCurrentPullRequest(pullRequest, input, false)) throw new Error('stale_generation')

  const checkIds = {} as CheckIds
  for (const check of generationOrder) {
    const created = await client.createCheckRun(repository, {
      name: check.name,
      headSha: input.headSha,
      externalId: `loop-engineer-run-${input.runId}-${check.name}`,
      status: 'in_progress',
      summary: 'generation_evaluation_in_progress',
    })
    checkIds[check.output] = requirePositiveInteger(created.id, 'invalid_check_id')
  }
  return checkIds
}

export async function finalizeCheckGeneration(
  input: FinalizeCheckGenerationInput,
  client: GitHubCheckGenerationClient,
): Promise<{ status: 'completed' | 'in_progress'; conclusion: CheckConclusion | null }> {
  const repository = requireRepository(input.repository)
  requirePositiveInteger(input.appId, 'invalid_app_id')
  requirePositiveInteger(input.prNumber, 'invalid_pr_number')
  requireSha(input.headSha, 'invalid_head_sha')
  requireSha(input.baseSha, 'invalid_base_sha')
  validateCheckIds(input.checkIds)
  requireReason(input.mergeReason)
  if (!['success', 'failure'].includes(input.specialistStatus)) {
    throw new Error('invalid_specialist_status')
  }
  if (!['AUTO_MERGE_ELIGIBLE', 'HUMAN_REQUIRED', 'HOLD'].includes(input.mergeDecision)) {
    throw new Error('invalid_merge_decision')
  }

  const [pullRequest, latestMergeIds] = await Promise.all([
    client.readPullRequest(repository, input.prNumber),
    client.readLatestCheckRunIds(repository, input.headSha, 'merge-eligibility', input.appId),
  ])
  const currentGeneration =
    isCurrentPullRequest(pullRequest, input, input.openapiBreakingDetected) &&
    latestMergeIds.length === 1 &&
    latestMergeIds[0] === input.checkIds.merge_eligibility_check_id

  if (!currentGeneration) {
    await failGeneration(client, repository, input.checkIds, 'stale_generation')
    throw new Error('stale_generation')
  }

  const conclusions = {
    prGate: normalizeResult(input.prGateResult),
    validate:
      input.openapiResult === 'success' && input.openapiBreakingResult === 'success'
        ? ('success' as const)
        : ('failure' as const),
    registry: normalizeResult(input.registryResult),
    specialist: normalizeResult(input.specialistStatus),
  }
  await completeCheck(
    client,
    repository,
    input.checkIds.pr_gate_check_id,
    'pr-gate',
    conclusions.prGate,
    `candidate_pr_gate_${conclusions.prGate}`,
  )
  await completeCheck(
    client,
    repository,
    input.checkIds.validate_check_id,
    'validate',
    conclusions.validate,
    `candidate_openapi_${conclusions.validate}`,
  )
  await completeCheck(
    client,
    repository,
    input.checkIds.local_registry_check_id,
    'local-registry',
    conclusions.registry,
    `candidate_registry_${conclusions.registry}`,
  )
  await completeCheck(
    client,
    repository,
    input.checkIds.specialist_review_check_id,
    'specialist-review-gate',
    conclusions.specialist,
    `specialist_review_${conclusions.specialist}`,
  )

  const allEvidencePassed = Object.values(conclusions).every(
    (conclusion) => conclusion === 'success',
  )
  if (input.mergeDecision === 'HUMAN_REQUIRED' && allEvidencePassed) {
    return { status: 'in_progress', conclusion: null }
  }

  const mergeConclusion =
    input.mergeDecision === 'AUTO_MERGE_ELIGIBLE' && allEvidencePassed ? 'success' : 'failure'
  const summary =
    input.mergeDecision === 'AUTO_MERGE_ELIGIBLE'
      ? `auto_${input.mergeReason}_${mergeConclusion}`
      : input.mergeDecision === 'HOLD'
        ? `hold_${input.mergeReason}`
        : 'human_candidate_failure'
  await completeCheck(
    client,
    repository,
    input.checkIds.merge_eligibility_check_id,
    'merge-eligibility',
    mergeConclusion,
    summary,
  )
  return { status: 'completed', conclusion: mergeConclusion }
}

export async function approveCheckGeneration(
  input: ApproveCheckGenerationInput,
  client: GitHubCheckGenerationClient,
): Promise<{ status: 'completed'; conclusion: CheckConclusion }> {
  const repository = requireRepository(input.repository)
  requirePositiveInteger(input.appId, 'invalid_app_id')
  requirePositiveInteger(input.prNumber, 'invalid_pr_number')
  requirePositiveInteger(input.mergeEligibilityCheckId, 'invalid_check_id')
  requireSha(input.headSha, 'invalid_head_sha')
  requireSha(input.baseSha, 'invalid_base_sha')
  requireReason(input.mergeReason)

  const [pullRequest, latestMergeIds] = await Promise.all([
    client.readPullRequest(repository, input.prNumber),
    client.readLatestCheckRunIds(repository, input.headSha, 'merge-eligibility', input.appId),
  ])
  const currentGeneration =
    isCurrentPullRequest(pullRequest, input, input.openapiBreakingDetected) &&
    latestMergeIds.length === 1 &&
    latestMergeIds[0] === input.mergeEligibilityCheckId
  if (!currentGeneration) {
    await completeCheck(
      client,
      repository,
      input.mergeEligibilityCheckId,
      'merge-eligibility',
      'failure',
      'stale_human_approval',
    )
    throw new Error('stale_human_approval')
  }

  await completeCheck(
    client,
    repository,
    input.mergeEligibilityCheckId,
    'merge-eligibility',
    'success',
    `human_${input.mergeReason}_approved`,
  )
  return { status: 'completed', conclusion: 'success' }
}

export async function revokeBreakingWaiver(
  input: RevokeBreakingWaiverInput,
  client: GitHubCheckGenerationClient,
): Promise<{ revoked: boolean }> {
  const repository = requireRepository(input.repository)
  requirePositiveInteger(input.prNumber, 'invalid_pr_number')
  requireSha(input.eventHeadSha, 'invalid_head_sha')
  requireRunId(input.runId)

  const pullRequest = await client.readPullRequest(repository, input.prNumber)
  if (
    pullRequest.state !== 'open' ||
    pullRequest.base_ref !== 'main' ||
    pullRequest.head_sha !== input.eventHeadSha ||
    pullRequest.breaking_approval_label_present
  ) {
    return { revoked: false }
  }

  for (const name of ['merge-eligibility', 'validate'] as const) {
    await client.createCheckRun(repository, {
      name,
      headSha: input.eventHeadSha,
      externalId: `loop-engineer-waiver-revoked-${input.runId}-${name}`,
      status: 'completed',
      conclusion: 'failure',
      summary: 'breaking_waiver_revoked',
    })
  }
  return { revoked: true }
}

function ghJson<T>(args: string[], input?: unknown): T {
  try {
    const output = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8',
      input: input === undefined ? undefined : JSON.stringify(input),
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024,
    })
    return JSON.parse(output) as T
  } catch {
    throw new Error('github_api_failed')
  }
}

function ghVoid(args: string[], input: unknown): void {
  try {
    execFileSync('gh', ['api', ...args], {
      input: JSON.stringify(input),
      stdio: ['pipe', 'ignore', 'pipe'],
      maxBuffer: 1024 * 1024,
    })
  } catch {
    throw new Error('github_api_failed')
  }
}

function createGitHubClient(): GitHubCheckGenerationClient {
  return {
    async readPullRequest(repository, prNumber) {
      const response = ghJson<{
        state?: unknown
        draft?: unknown
        base?: { ref?: unknown; sha?: unknown }
        head?: { sha?: unknown }
        mergeable?: unknown
        labels?: Array<{ name?: unknown }>
      }>([`repos/${repository}/pulls/${prNumber}`])
      const mainRef = ghJson<{ object?: { sha?: unknown } }>([
        `repos/${repository}/git/ref/heads/main`,
      ])
      return {
        state: String(response.state),
        draft: response.draft === true,
        base_ref: String(response.base?.ref),
        base_sha: String(mainRef.object?.sha),
        head_sha: String(response.head?.sha),
        mergeable: response.mergeable === true,
        breaking_approval_label_present:
          response.labels?.some((label) => label.name === 'openapi-breaking-approved') === true,
      }
    },
    async readLatestCheckRunIds(repository, headSha, name, dedicatedAppId) {
      const response = ghJson<{
        total_count?: unknown
        check_runs?: Array<{ id?: unknown }>
      }>([
        `repos/${repository}/commits/${headSha}/check-runs?filter=latest&check_name=${name}&app_id=${dedicatedAppId}&per_page=100`,
      ])
      const runs = response.check_runs ?? []
      if (!Number.isSafeInteger(response.total_count) || response.total_count !== runs.length) {
        throw new Error('invalid_check_inventory')
      }
      return runs.map((run) => requirePositiveInteger(Number(run.id), 'invalid_check_id'))
    },
    async createCheckRun(repository, input) {
      const response = ghJson<{ id?: unknown }>(
        ['--method', 'POST', `repos/${repository}/check-runs`, '--input', '-'],
        {
          name: input.name,
          head_sha: input.headSha,
          external_id: input.externalId,
          status: input.status,
          ...(input.conclusion === undefined ? {} : { conclusion: input.conclusion }),
          output: { title: input.name, summary: input.summary },
        },
      )
      return { id: requirePositiveInteger(Number(response.id), 'invalid_check_id') }
    },
    async updateCheckRun(repository, checkId, input) {
      ghVoid(['--method', 'PATCH', `repos/${repository}/check-runs/${checkId}`, '--input', '-'], {
        status: input.status,
        conclusion: input.conclusion,
        output: { title: input.name, summary: input.summary },
      })
    },
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function integerEnv(name: string): number {
  const value = requireEnv(name)
  if (!/^\d+$/.test(value)) throw new Error(`invalid_${name.toLowerCase()}`)
  return requirePositiveInteger(Number(value), `invalid_${name.toLowerCase()}`)
}

function booleanEnv(name: string): boolean {
  const value = requireEnv(name)
  if (value !== 'true' && value !== 'false') throw new Error(`invalid_${name.toLowerCase()}`)
  return value === 'true'
}

function checkIdsFromEnv(): CheckIds {
  return {
    merge_eligibility_check_id: integerEnv('MERGE_ELIGIBILITY_CHECK_ID'),
    specialist_review_check_id: integerEnv('SPECIALIST_REVIEW_CHECK_ID'),
    pr_gate_check_id: integerEnv('PR_GATE_CHECK_ID'),
    validate_check_id: integerEnv('VALIDATE_CHECK_ID'),
    local_registry_check_id: integerEnv('LOCAL_REGISTRY_CHECK_ID'),
  }
}

function writeCheckIds(checkIds: CheckIds): void {
  const output = requireEnv('GITHUB_OUTPUT')
  const lines = Object.entries(checkIds)
    .map(([name, value]) => `${name}=${value}`)
    .join('\n')
  appendFileSync(output, `${lines}\n`, 'utf8')
}

async function main(): Promise<void> {
  const mode = process.argv[2]
  const client = createGitHubClient()
  const common = {
    repository: requireEnv('GITHUB_REPOSITORY'),
    prNumber: integerEnv('PR_NUMBER'),
  }

  if (mode === 'begin') {
    const checkIds = await beginCheckGeneration(
      {
        ...common,
        headSha: requireEnv('HEAD_SHA'),
        baseSha: requireEnv('BASE_SHA'),
        runId: requireEnv('GITHUB_RUN_ID'),
      },
      client,
    )
    writeCheckIds(checkIds)
    return
  }
  if (mode === 'finalize') {
    await finalizeCheckGeneration(
      {
        ...common,
        appId: integerEnv('LOOP_ENGINEER_APP_ID'),
        headSha: requireEnv('HEAD_SHA'),
        baseSha: requireEnv('BASE_SHA'),
        checkIds: checkIdsFromEnv(),
        specialistStatus: requireEnv('SPECIALIST_STATUS') as 'success' | 'failure',
        mergeDecision: requireEnv('MERGE_DECISION') as MergeDecision,
        mergeReason: requireEnv('MERGE_REASON'),
        prGateResult: requireEnv('PR_GATE_RESULT'),
        openapiResult: requireEnv('OPENAPI_RESULT'),
        openapiBreakingResult: requireEnv('OPENAPI_BREAKING_RESULT'),
        openapiBreakingDetected: booleanEnv('OPENAPI_BREAKING_DETECTED'),
        registryResult: requireEnv('REGISTRY_RESULT'),
      },
      client,
    )
    return
  }
  if (mode === 'approve') {
    await approveCheckGeneration(
      {
        ...common,
        appId: integerEnv('LOOP_ENGINEER_APP_ID'),
        headSha: requireEnv('HEAD_SHA'),
        baseSha: requireEnv('BASE_SHA'),
        mergeEligibilityCheckId: integerEnv('MERGE_ELIGIBILITY_CHECK_ID'),
        openapiBreakingDetected: booleanEnv('OPENAPI_BREAKING_DETECTED'),
        mergeReason: requireEnv('MERGE_REASON'),
      },
      client,
    )
    return
  }
  if (mode === 'revoke-waiver') {
    await revokeBreakingWaiver(
      {
        ...common,
        eventHeadSha: requireEnv('EVENT_HEAD_SHA'),
        runId: requireEnv('GITHUB_RUN_ID'),
      },
      client,
    )
    return
  }
  throw new Error('invalid_mode')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const reason =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'failed'
    process.stderr.write(`::error::${reason}\n`)
    process.exitCode = 1
  })
}
