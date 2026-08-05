import { execFileSync } from 'node:child_process'
import { createHash, createPublicKey, verify } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const reviewLineageSupersessionCheckName = 'review-lineage-supersession'
export const reviewLineageRegistrationCheckName = 'review-lineage-registration'

export const reviewLineageSupersessionProofFields = [
  'schema_version',
  'review_lineage_id',
  'predecessor_issue_id',
  'predecessor_issue_number',
  'predecessor_pr_number',
  'predecessor_head_sha',
  'successor_issue_id',
  'successor_issue_number',
  'successor_pr_number',
  'merge_base_sha',
  'head_sha',
  'finding_ids',
  'succession',
  'review_round',
] as const

export const issue172Lineage = {
  review_lineage_id: 'lineage-issue-172',
  predecessor_issue_id: 'ISSUE-172',
  predecessor_issue_number: 354,
  predecessor_pr_number: 355,
  predecessor_head_sha: '2f0eaf7ee713bfd140269720a7d593e8f007c5a7',
  successor_issue_id: 'ISSUE-175',
  successor_issue_number: 359,
  finding_ids: ['gh_cli_pagination_contract', 'main_sha_race', 'status_metadata_allowlist'],
  succession: 1,
} as const

export type ReviewLineageSupersessionProof = {
  schema_version: 'loop-engineer-review-lineage-supersession/v1'
  review_lineage_id: string
  predecessor_issue_id: string
  predecessor_issue_number: number
  predecessor_pr_number: number
  predecessor_head_sha: string
  successor_issue_id: string
  successor_issue_number: number
  successor_pr_number: number
  merge_base_sha: string
  head_sha: string
  finding_ids: string[]
  succession: 1
  review_round: 1 | 2 | 3 | 4 | 5
}

export type ReviewLineagePullRequest = {
  state: string
  draft: boolean
  base_ref: string
  current_main_sha: string
  head_sha: string
  mergeable: boolean
  merged: boolean
  closing_issues: Array<{ repository: string; number: number }>
}

export type ReviewLineageCheckRun = {
  id: number
  app_id: number
  name: string
  head_sha: string
  external_id: string
  status: string
  conclusion: string | null
}

type CreateCheckRunInput = Omit<ReviewLineageCheckRun, 'id' | 'app_id'>
type UpdateCheckRunInput = Pick<
  ReviewLineageCheckRun,
  'name' | 'external_id' | 'status' | 'conclusion'
>

export type ReviewLineageSupersessionAdapter = {
  requestOidcToken(audience: string): Promise<string>
  readOidcJwks(): Promise<unknown>
  nowUnixSeconds(): number
  readPullRequest(repository: string, prNumber: number): Promise<ReviewLineagePullRequest>
  readCheckRuns(repository: string, headSha: string, name: string): Promise<ReviewLineageCheckRun[]>
  createCheckRun(repository: string, input: CreateCheckRunInput): Promise<{ id: number }>
  updateCheckRun(repository: string, checkId: number, input: UpdateCheckRunInput): Promise<void>
}

type ReviewLineageSupersessionInput = {
  repository: string
  appId: number
  proof: ReviewLineageSupersessionProof
}

export type ApproveReviewLineageSupersessionInput = ReviewLineageSupersessionInput & {
  runId: string
  runAttempt: string
}

const oidcAudience = 'hana-review-lineage-supersession/v1'
const oidcIssuer = 'https://token.actions.githubusercontent.com'
const expectedRepository = 'Kazuya-Sakashita/Hana'
const expectedRepositoryId = '1238189306'
const expectedOwner = 'Kazuya-Sakashita'
const expectedOwnerId = '64903209'
const expectedEnvironment = 'hana-merge-human-approval'
const expectedWorkflowRef =
  'Kazuya-Sakashita/Hana/.github/workflows/loop-engineer-review-lineage-supersession.yml@refs/heads/main'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isExactClosingIssue(
  issues: ReadonlyArray<{ repository: string; number: number }>,
  issueNumber: number,
): boolean {
  return (
    issues.length === 1 &&
    issues[0]?.repository === expectedRepository &&
    issues[0]?.number === issueNumber
  )
}

export function parseReviewLineageSupersessionProof(
  value: unknown,
): ReviewLineageSupersessionProof | null {
  if (
    !isRecord(value) ||
    Object.keys(value).some(
      (field) => !reviewLineageSupersessionProofFields.includes(field as never),
    ) ||
    reviewLineageSupersessionProofFields.some((field) => !Object.hasOwn(value, field)) ||
    value.schema_version !== 'loop-engineer-review-lineage-supersession/v1' ||
    value.review_lineage_id !== issue172Lineage.review_lineage_id ||
    value.predecessor_issue_id !== issue172Lineage.predecessor_issue_id ||
    value.predecessor_issue_number !== issue172Lineage.predecessor_issue_number ||
    value.predecessor_pr_number !== issue172Lineage.predecessor_pr_number ||
    value.predecessor_head_sha !== issue172Lineage.predecessor_head_sha ||
    value.successor_issue_id !== issue172Lineage.successor_issue_id ||
    value.successor_issue_number !== issue172Lineage.successor_issue_number ||
    !Number.isSafeInteger(value.successor_pr_number) ||
    (value.successor_pr_number as number) <= 0 ||
    !isSha(value.merge_base_sha) ||
    !isSha(value.head_sha) ||
    value.head_sha === value.predecessor_head_sha ||
    !Array.isArray(value.finding_ids) ||
    !sameStrings(value.finding_ids as string[], issue172Lineage.finding_ids) ||
    value.succession !== issue172Lineage.succession ||
    !Number.isSafeInteger(value.review_round) ||
    (value.review_round as number) < 1 ||
    (value.review_round as number) > 5
  ) {
    return null
  }
  return value as ReviewLineageSupersessionProof
}

function requireProof(value: unknown): ReviewLineageSupersessionProof {
  const proof = parseReviewLineageSupersessionProof(value)
  if (!proof) throw new Error('invalid_review_lineage_supersession')
  return proof
}

export function reviewLineageRequiresSupersession(issueId: string): boolean {
  return issueId === issue172Lineage.successor_issue_id
}

export function isTerminalReviewHold(issueId: string, prNumber: number): boolean {
  return (
    issueId === issue172Lineage.predecessor_issue_id ||
    prNumber === issue172Lineage.predecessor_pr_number
  )
}

function requireInput(input: ReviewLineageSupersessionInput) {
  if (input.repository !== expectedRepository) throw new Error('invalid_repository')
  if (!Number.isSafeInteger(input.appId) || input.appId <= 0) throw new Error('invalid_app_id')
  return { repository: input.repository, appId: input.appId, proof: requireProof(input.proof) }
}

function isFrozenPredecessor(
  pullRequest: ReviewLineagePullRequest,
  proof: ReviewLineageSupersessionProof,
): boolean {
  return (
    pullRequest.state === 'closed' &&
    pullRequest.base_ref === 'main' &&
    pullRequest.head_sha === proof.predecessor_head_sha &&
    pullRequest.merged === false &&
    isExactClosingIssue(pullRequest.closing_issues, proof.predecessor_issue_number)
  )
}

function isCurrentSuccessor(
  pullRequest: ReviewLineagePullRequest,
  proof: ReviewLineageSupersessionProof,
): boolean {
  return (
    pullRequest.state === 'open' &&
    pullRequest.draft === false &&
    pullRequest.base_ref === 'main' &&
    pullRequest.current_main_sha === proof.merge_base_sha &&
    pullRequest.head_sha === proof.head_sha &&
    pullRequest.mergeable === true &&
    pullRequest.merged === false &&
    isExactClosingIssue(pullRequest.closing_issues, proof.successor_issue_number)
  )
}

function canonicalProof(proof: ReviewLineageSupersessionProof): string {
  return JSON.stringify(
    reviewLineageSupersessionProofFields.reduce<Record<string, unknown>>((result, field) => {
      result[field] = proof[field]
      return result
    }, {}),
  )
}

export function reviewLineageSupersessionExternalId(proof: ReviewLineageSupersessionProof): string {
  const digest = createHash('sha256').update(canonicalProof(proof)).digest('hex')
  return `${proof.schema_version}|${digest}`
}

type ReviewLineageRegistration = {
  successorPrNumber: number
  reviewRound: number
  mergeBaseSha: string
  headSha: string
  digest: string
}

export function reviewLineageRegistrationExternalId(proof: ReviewLineageSupersessionProof): string {
  const digest = createHash('sha256').update(canonicalProof(proof)).digest('hex')
  return [
    'loop-engineer-review-lineage-registration/v1',
    proof.successor_pr_number,
    proof.review_round,
    proof.merge_base_sha,
    proof.head_sha,
    digest,
  ].join('|')
}

function parseReviewLineageRegistrationExternalId(
  externalId: string,
): ReviewLineageRegistration | null {
  const match = externalId.match(
    /^loop-engineer-review-lineage-registration\/v1\|(\d+)\|([1-5])\|([0-9a-f]{40})\|([0-9a-f]{40})\|([0-9a-f]{64})$/,
  )
  if (!match) return null
  const successorPrNumber = Number(match[1])
  if (!Number.isSafeInteger(successorPrNumber) || successorPrNumber <= 0) return null
  return {
    successorPrNumber,
    reviewRound: Number(match[2]),
    mergeBaseSha: match[3]!,
    headSha: match[4]!,
    digest: match[5]!,
  }
}

export function sameReviewLineageSupersession(
  left: ReviewLineageSupersessionProof,
  right: ReviewLineageSupersessionProof,
): boolean {
  return canonicalProof(left) === canonicalProof(right)
}

function requireExclusiveTrustedRuns(
  runs: ReviewLineageCheckRun[],
  appId: number,
  name: string,
): ReviewLineageCheckRun[] {
  const namedRuns = runs.filter((run) => run.name === name)
  if (namedRuns.some((run) => run.app_id !== appId)) {
    throw new Error('review_lineage_check_app_mismatch')
  }
  return namedRuns
}

function requireRegistrationProgression(
  run: ReviewLineageCheckRun | undefined,
  proof: ReviewLineageSupersessionProof,
): void {
  if (!run) {
    if (proof.review_round !== 1) throw new Error('review_lineage_must_start_at_round_one')
    return
  }
  if (run.head_sha !== proof.predecessor_head_sha) {
    throw new Error('invalid_review_lineage_registration')
  }
  const registration = parseReviewLineageRegistrationExternalId(run.external_id)
  if (!registration || registration.successorPrNumber !== proof.successor_pr_number) {
    throw new Error('review_lineage_already_superseded')
  }
  const registeredProof: ReviewLineageSupersessionProof = {
    schema_version: 'loop-engineer-review-lineage-supersession/v1',
    review_lineage_id: issue172Lineage.review_lineage_id,
    predecessor_issue_id: issue172Lineage.predecessor_issue_id,
    predecessor_issue_number: issue172Lineage.predecessor_issue_number,
    predecessor_pr_number: issue172Lineage.predecessor_pr_number,
    predecessor_head_sha: issue172Lineage.predecessor_head_sha,
    successor_issue_id: issue172Lineage.successor_issue_id,
    successor_issue_number: issue172Lineage.successor_issue_number,
    successor_pr_number: registration.successorPrNumber,
    merge_base_sha: registration.mergeBaseSha,
    head_sha: registration.headSha,
    finding_ids: [...issue172Lineage.finding_ids],
    succession: issue172Lineage.succession,
    review_round: registration.reviewRound as 1 | 2 | 3 | 4 | 5,
  }
  if (reviewLineageRegistrationExternalId(registeredProof) !== run.external_id) {
    throw new Error('invalid_review_lineage_registration')
  }
  const completedFailure = run.status === 'completed' && run.conclusion === 'failure'
  const completedSuccess = run.status === 'completed' && run.conclusion === 'success'
  const incomplete = run.status === 'in_progress' && run.conclusion === null
  if (!completedFailure && !completedSuccess && !incomplete) {
    throw new Error('ambiguous_review_lineage_supersession')
  }
  const retryExactRound =
    (completedFailure || incomplete) &&
    registration.reviewRound === proof.review_round &&
    run.external_id === reviewLineageRegistrationExternalId(proof)
  const nextRoundAndNewHead =
    completedSuccess &&
    registration.reviewRound + 1 === proof.review_round &&
    registration.headSha !== proof.head_sha
  if (!retryExactRound && !nextRoundAndNewHead) {
    throw new Error('invalid_review_lineage_round_progression')
  }
}

function requireRetryableSupersessionRun(
  run: ReviewLineageCheckRun,
  registration: ReviewLineageCheckRun | undefined,
  proof: ReviewLineageSupersessionProof,
): { alreadySucceeded: boolean } {
  if (
    !registration ||
    run.head_sha !== proof.head_sha ||
    run.external_id !== reviewLineageSupersessionExternalId(proof)
  ) {
    throw new Error('review_lineage_supersession_reused')
  }
  if (run.status === 'completed' && run.conclusion === 'success') {
    return { alreadySucceeded: true }
  }
  if (
    (run.status === 'completed' && run.conclusion === 'failure') ||
    (run.status === 'in_progress' && run.conclusion === null)
  ) {
    return { alreadySucceeded: false }
  }
  throw new Error('ambiguous_review_lineage_supersession')
}

async function completeCheckAsFailure(
  adapter: ReviewLineageSupersessionAdapter,
  repository: string,
  checkId: number,
  name: string,
  externalId: string,
): Promise<void> {
  try {
    await adapter.updateCheckRun(repository, checkId, {
      name,
      external_id: externalId,
      status: 'completed',
      conclusion: 'failure',
    })
  } catch {}
}

function decodeJwtPart(value: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 12 * 1024) {
    throw new Error('invalid_oidc_token')
  }
  try {
    const decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown
    if (!isRecord(decoded)) throw new Error('invalid_oidc_token')
    return decoded
  } catch {
    throw new Error('invalid_oidc_token')
  }
}

function requireJwk(jwks: unknown, keyId: string): JsonWebKey {
  if (!isRecord(jwks) || !Array.isArray(jwks.keys) || jwks.keys.length > 20) {
    throw new Error('invalid_oidc_jwks')
  }
  const matchingKeys = jwks.keys.filter(
    (key) =>
      isRecord(key) &&
      key.kid === keyId &&
      key.kty === 'RSA' &&
      key.alg === 'RS256' &&
      key.use === 'sig' &&
      typeof key.n === 'string' &&
      typeof key.e === 'string',
  )
  if (matchingKeys.length !== 1) throw new Error('invalid_oidc_jwks')
  return matchingKeys[0] as JsonWebKey
}

function validSubject(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return (
    value === `repo:${expectedRepository}:environment:${expectedEnvironment}` ||
    value ===
      `repo:${expectedOwner}@${expectedOwnerId}/Hana@${expectedRepositoryId}:environment:${expectedEnvironment}`
  )
}

function requireExactClaims(
  claims: Record<string, unknown>,
  input: ApproveReviewLineageSupersessionInput,
  now: number,
): void {
  const exactClaims: Record<string, string> = {
    iss: oidcIssuer,
    aud: oidcAudience,
    repository: expectedRepository,
    repository_id: expectedRepositoryId,
    repository_owner: expectedOwner,
    repository_owner_id: expectedOwnerId,
    actor: expectedOwner,
    actor_id: expectedOwnerId,
    ref: 'refs/heads/main',
    sha: input.proof.merge_base_sha,
    workflow_ref: expectedWorkflowRef,
    workflow_sha: input.proof.merge_base_sha,
    environment: expectedEnvironment,
    event_name: 'workflow_dispatch',
    run_id: input.runId,
    run_attempt: input.runAttempt,
    runner_environment: 'github-hosted',
  }
  if (Object.entries(exactClaims).some(([name, value]) => claims[name] !== value)) {
    throw new Error('oidc_claim_mismatch')
  }
  if (!validSubject(claims.sub)) throw new Error('oidc_claim_mismatch')
  if (claims.ref_protected !== 'true' && claims.ref_protected !== true) {
    throw new Error('oidc_claim_mismatch')
  }
  if (typeof claims.jti !== 'string' || !/^[A-Za-z0-9._:-]{1,256}$/.test(claims.jti)) {
    throw new Error('oidc_claim_mismatch')
  }
  if (
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.nbf) ||
    !Number.isInteger(claims.exp) ||
    (claims.iat as number) > now + 30 ||
    (claims.iat as number) < now - 600 ||
    (claims.nbf as number) > now + 30 ||
    (claims.exp as number) <= now - 30 ||
    (claims.exp as number) - (claims.iat as number) > 600
  ) {
    throw new Error('oidc_token_expired')
  }
}

async function verifyProtectedEnvironmentApproval(
  input: ApproveReviewLineageSupersessionInput,
  adapter: ReviewLineageSupersessionAdapter,
): Promise<void> {
  const token = await adapter.requestOidcToken(oidcAudience)
  if (typeof token !== 'string' || token.length > 16 * 1024) throw new Error('invalid_oidc_token')
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('invalid_oidc_token')
  const [encodedHeader, encodedClaims, encodedSignature] = parts as [string, string, string]
  const header = decodeJwtPart(encodedHeader)
  const claims = decodeJwtPart(encodedClaims)
  if (
    header.alg !== 'RS256' ||
    header.typ !== 'JWT' ||
    typeof header.kid !== 'string' ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(header.kid) ||
    !/^[A-Za-z0-9_-]+$/.test(encodedSignature)
  ) {
    throw new Error('invalid_oidc_token')
  }
  const jwk = requireJwk(await adapter.readOidcJwks(), header.kid)
  let validSignature = false
  try {
    validSignature = verify(
      'RSA-SHA256',
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      createPublicKey({ key: jwk, format: 'jwk' }),
      Buffer.from(encodedSignature, 'base64url'),
    )
  } catch {
    throw new Error('invalid_oidc_signature')
  }
  if (!validSignature) throw new Error('invalid_oidc_signature')
  requireExactClaims(claims, input, adapter.nowUnixSeconds())
}

async function readBoundPullRequests(
  input: ReviewLineageSupersessionInput,
  adapter: ReviewLineageSupersessionAdapter,
): Promise<{ predecessor: ReviewLineagePullRequest; successor: ReviewLineagePullRequest }> {
  const [predecessor, successor] = await Promise.all([
    adapter.readPullRequest(input.repository, input.proof.predecessor_pr_number),
    adapter.readPullRequest(input.repository, input.proof.successor_pr_number),
  ])
  return { predecessor, successor }
}

function requireCurrentLineage(
  pullRequests: { predecessor: ReviewLineagePullRequest; successor: ReviewLineagePullRequest },
  proof: ReviewLineageSupersessionProof,
): void {
  if (
    !isFrozenPredecessor(pullRequests.predecessor, proof) ||
    !isCurrentSuccessor(pullRequests.successor, proof)
  ) {
    throw new Error('stale_review_lineage_supersession')
  }
}

export async function approveReviewLineageSupersession(
  rawInput: ApproveReviewLineageSupersessionInput,
  adapter: ReviewLineageSupersessionAdapter,
): Promise<{ status: 'approved'; succession: 1 }> {
  const input = {
    ...requireInput(rawInput),
    runId: rawInput.runId,
    runAttempt: rawInput.runAttempt,
  }
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) {
    throw new Error('invalid_workflow_run')
  }
  await verifyProtectedEnvironmentApproval(input, adapter)
  requireCurrentLineage(await readBoundPullRequests(input, adapter), input.proof)

  const [registrationRuns, proofRuns] = await Promise.all([
    adapter.readCheckRuns(
      input.repository,
      input.proof.predecessor_head_sha,
      reviewLineageRegistrationCheckName,
    ),
    adapter.readCheckRuns(
      input.repository,
      input.proof.head_sha,
      reviewLineageSupersessionCheckName,
    ),
  ])
  const registrations = requireExclusiveTrustedRuns(
    registrationRuns,
    input.appId,
    reviewLineageRegistrationCheckName,
  )
  const runs = requireExclusiveTrustedRuns(
    proofRuns,
    input.appId,
    reviewLineageSupersessionCheckName,
  )
  if (registrations.length > 1 || runs.length > 1) {
    throw new Error('ambiguous_review_lineage_supersession')
  }
  requireRegistrationProgression(registrations[0], input.proof)

  const registrationExternalId = reviewLineageRegistrationExternalId(input.proof)
  const registrationId =
    registrations[0]?.id ??
    (
      await adapter.createCheckRun(input.repository, {
        name: reviewLineageRegistrationCheckName,
        head_sha: input.proof.predecessor_head_sha,
        external_id: registrationExternalId,
        status: 'in_progress',
        conclusion: null,
      })
    ).id
  if (!Number.isSafeInteger(registrationId) || registrationId <= 0) {
    throw new Error('invalid_check_id')
  }

  const requestedExternalId = reviewLineageSupersessionExternalId(input.proof)
  const existingProofState = runs[0]
    ? requireRetryableSupersessionRun(runs[0], registrations[0], input.proof)
    : { alreadySucceeded: false }
  let checkId = runs[0]?.id
  try {
    if (checkId === undefined) {
      checkId = (
        await adapter.createCheckRun(input.repository, {
          name: reviewLineageSupersessionCheckName,
          head_sha: input.proof.head_sha,
          external_id: requestedExternalId,
          status: 'in_progress',
          conclusion: null,
        })
      ).id
    }
    if (!Number.isSafeInteger(checkId) || checkId <= 0) throw new Error('invalid_check_id')
    requireCurrentLineage(await readBoundPullRequests(input, adapter), input.proof)
    if (!existingProofState.alreadySucceeded) {
      await adapter.updateCheckRun(input.repository, checkId, {
        name: reviewLineageSupersessionCheckName,
        external_id: requestedExternalId,
        status: 'completed',
        conclusion: 'success',
      })
    }
    await adapter.updateCheckRun(input.repository, registrationId, {
      name: reviewLineageRegistrationCheckName,
      external_id: registrationExternalId,
      status: 'completed',
      conclusion: 'success',
    })
  } catch (error) {
    if (Number.isSafeInteger(checkId) && (checkId ?? 0) > 0) {
      await completeCheckAsFailure(
        adapter,
        input.repository,
        checkId!,
        reviewLineageSupersessionCheckName,
        requestedExternalId,
      )
    }
    await completeCheckAsFailure(
      adapter,
      input.repository,
      registrationId,
      reviewLineageRegistrationCheckName,
      registrationExternalId,
    )
    throw error
  }
  return { status: 'approved', succession: 1 }
}

export async function verifyReviewLineageSupersession(
  rawInput: ReviewLineageSupersessionInput,
  adapter: ReviewLineageSupersessionAdapter,
): Promise<{ status: 'approved'; succession: 1 }> {
  const input = requireInput(rawInput)
  const [pullRequests, allRuns, registrationRuns] = await Promise.all([
    readBoundPullRequests(input, adapter),
    adapter.readCheckRuns(
      input.repository,
      input.proof.head_sha,
      reviewLineageSupersessionCheckName,
    ),
    adapter.readCheckRuns(
      input.repository,
      input.proof.predecessor_head_sha,
      reviewLineageRegistrationCheckName,
    ),
  ])
  requireCurrentLineage(pullRequests, input.proof)
  const runs = requireExclusiveTrustedRuns(allRuns, input.appId, reviewLineageSupersessionCheckName)
  const registrations = requireExclusiveTrustedRuns(
    registrationRuns,
    input.appId,
    reviewLineageRegistrationCheckName,
  )
  if (runs.length > 1 || registrations.length > 1) {
    throw new Error('ambiguous_review_lineage_supersession')
  }
  const run = runs[0]
  const registration = registrations[0]
  if (
    !run ||
    !registration ||
    registration.head_sha !== input.proof.predecessor_head_sha ||
    registration.external_id !== reviewLineageRegistrationExternalId(input.proof) ||
    registration.status !== 'completed' ||
    registration.conclusion !== 'success' ||
    run.head_sha !== input.proof.head_sha ||
    run.external_id !== reviewLineageSupersessionExternalId(input.proof) ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    throw new Error('review_lineage_supersession_not_approved')
  }
  return { status: 'approved', succession: 1 }
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

function ghStatusJson<T>(args: string[]): T {
  try {
    const output = execFileSync('gh', ['api', ...args], {
      encoding: 'utf8',
      env: { ...process.env, GH_TOKEN: requireEnv('GITHUB_STATUS_TOKEN') },
      stdio: ['ignore', 'pipe', 'pipe'],
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

function readClosingIssues(
  repository: string,
  prNumber: number,
): Array<{ repository: string; number: number }> {
  const [owner, name, extra] = repository.split('/')
  if (!owner || !name || extra) throw new Error('invalid_repository')
  const response = ghStatusJson<{ issues?: unknown; has_next_page?: unknown }>([
    'graphql',
    '-f',
    'query=query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){closingIssuesReferences(first:10){nodes{number repository{nameWithOwner}}pageInfo{hasNextPage}}}}}',
    '-F',
    `owner=${owner}`,
    '-F',
    `name=${name}`,
    '-F',
    `number=${prNumber}`,
    '--jq',
    '{issues:[.data.repository.pullRequest.closingIssuesReferences.nodes[]|{repository:.repository.nameWithOwner,number}],has_next_page:.data.repository.pullRequest.closingIssuesReferences.pageInfo.hasNextPage}',
  ])
  if (
    response.has_next_page !== false ||
    !Array.isArray(response.issues) ||
    response.issues.some(
      (value) =>
        !isRecord(value) ||
        typeof value.repository !== 'string' ||
        !Number.isSafeInteger(value.number) ||
        (value.number as number) <= 0,
    )
  ) {
    throw new Error('invalid_closing_issue_inventory')
  }
  return response.issues as Array<{ repository: string; number: number }>
}

async function fetchJson(url: URL, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)
  try {
    const response = await fetch(url, { ...init, redirect: 'error', signal: controller.signal })
    if (!response.ok) throw new Error('oidc_network_failed')
    const contentLength = response.headers.get('content-length')
    if (contentLength && Number(contentLength) > 256 * 1024) {
      throw new Error('oidc_response_too_large')
    }
    const reader = response.body?.getReader()
    if (!reader) throw new Error('oidc_network_failed')
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > 256 * 1024) {
        await reader.cancel().catch(() => undefined)
        controller.abort()
        throw new Error('oidc_response_too_large')
      }
      chunks.push(value)
    }
    return JSON.parse(Buffer.concat(chunks, totalBytes).toString('utf8')) as unknown
  } catch (error) {
    if (error instanceof Error && /^[a-z0-9_]+$/.test(error.message)) throw error
    throw new Error('oidc_network_failed')
  } finally {
    clearTimeout(timeout)
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing_${name.toLowerCase()}`)
  return value
}

function requirePositiveInteger(value: unknown, reason: string): number {
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number <= 0) throw new Error(reason)
  return number
}

function oidcRequestUrl(audience: string): URL {
  const url = new URL(requireEnv('ACTIONS_ID_TOKEN_REQUEST_URL'))
  const trustedHost =
    url.hostname === 'token.actions.githubusercontent.com' ||
    url.hostname.endsWith('.actions.githubusercontent.com')
  if (
    url.protocol !== 'https:' ||
    !trustedHost ||
    url.username !== '' ||
    url.password !== '' ||
    (url.port !== '' && url.port !== '443')
  ) {
    throw new Error('invalid_oidc_request_url')
  }
  url.searchParams.set('audience', audience)
  return url
}

export function createGitHubReviewLineageSupersessionAdapter(): ReviewLineageSupersessionAdapter {
  return {
    async requestOidcToken(audience) {
      const response = await fetchJson(oidcRequestUrl(audience), {
        headers: { authorization: `bearer ${requireEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN')}` },
      })
      if (!isRecord(response) || typeof response.value !== 'string') {
        throw new Error('invalid_oidc_token_response')
      }
      return response.value
    },
    async readOidcJwks() {
      return fetchJson(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'))
    },
    nowUnixSeconds() {
      return Math.floor(Date.now() / 1000)
    },
    async readPullRequest(repository, prNumber) {
      const response = ghStatusJson<{
        state?: unknown
        draft?: unknown
        base_ref?: unknown
        head_sha?: unknown
        mergeable?: unknown
        merged?: unknown
      }>([
        `repos/${repository}/pulls/${prNumber}`,
        '--jq',
        '{state,draft,base_ref:.base.ref,head_sha:.head.sha,mergeable,merged:(.merged_at != null)}',
      ])
      const mainRef = ghStatusJson<{ sha?: unknown }>([
        `repos/${repository}/git/ref/heads/main`,
        '--jq',
        '{sha:.object.sha}',
      ])
      return {
        state: String(response.state),
        draft: response.draft === true,
        base_ref: String(response.base_ref),
        current_main_sha: String(mainRef.sha),
        head_sha: String(response.head_sha),
        mergeable: response.mergeable === true,
        merged: response.merged === true,
        closing_issues: readClosingIssues(repository, prNumber),
      }
    },
    async readCheckRuns(repository, headSha, name) {
      const response = ghJson<{
        total_count?: unknown
        check_runs?: Array<{
          id?: unknown
          app?: { id?: unknown }
          name?: unknown
          head_sha?: unknown
          external_id?: unknown
          status?: unknown
          conclusion?: unknown
        }>
      }>([
        `repos/${repository}/commits/${headSha}/check-runs?filter=all&check_name=${encodeURIComponent(name)}&per_page=100`,
        '--jq',
        '{total_count,check_runs:[.check_runs[]|{id,app:{id:.app.id},name,head_sha,external_id,status,conclusion}]}',
      ])
      const runs = response.check_runs ?? []
      if (!Number.isSafeInteger(response.total_count) || response.total_count !== runs.length) {
        throw new Error('invalid_check_inventory')
      }
      return runs.map((run) => ({
        id: requirePositiveInteger(run.id, 'invalid_check_id'),
        app_id: requirePositiveInteger(run.app?.id, 'invalid_app_id'),
        name: String(run.name),
        head_sha: String(run.head_sha),
        external_id: String(run.external_id),
        status: String(run.status),
        conclusion: run.conclusion === null ? null : String(run.conclusion),
      }))
    },
    async createCheckRun(repository, input) {
      const response = ghJson<{ id?: unknown }>(
        ['--method', 'POST', `repos/${repository}/check-runs`, '--input', '-', '--jq', '{id}'],
        {
          name: input.name,
          head_sha: input.head_sha,
          external_id: input.external_id,
          status: input.status,
          ...(input.conclusion === null ? {} : { conclusion: input.conclusion }),
          output: { title: input.name, summary: 'review_lineage_supersession_in_progress' },
        },
      )
      return { id: requirePositiveInteger(response.id, 'invalid_check_id') }
    },
    async updateCheckRun(repository, checkId, input) {
      ghVoid(['--method', 'PATCH', `repos/${repository}/check-runs/${checkId}`, '--input', '-'], {
        name: input.name,
        external_id: input.external_id,
        status: input.status,
        ...(input.conclusion === null ? {} : { conclusion: input.conclusion }),
        output: {
          title: input.name,
          summary:
            input.conclusion === 'success'
              ? 'review_lineage_supersession_approved'
              : input.conclusion === 'failure'
                ? 'review_lineage_supersession_stale'
                : 'review_lineage_supersession_in_progress',
        },
      })
    },
  }
}

async function main(): Promise<void> {
  if (process.argv[2] !== 'approve') throw new Error('invalid_mode')
  const findingIds = JSON.parse(requireEnv('FINDING_IDS_JSON')) as unknown
  const proof = requireProof({
    schema_version: 'loop-engineer-review-lineage-supersession/v1',
    review_lineage_id: requireEnv('REVIEW_LINEAGE_ID'),
    predecessor_issue_id: requireEnv('PREDECESSOR_ISSUE_ID'),
    predecessor_issue_number: requirePositiveInteger(
      requireEnv('PREDECESSOR_ISSUE_NUMBER'),
      'invalid_predecessor_issue_number',
    ),
    predecessor_pr_number: requirePositiveInteger(
      requireEnv('PREDECESSOR_PR_NUMBER'),
      'invalid_predecessor_pr_number',
    ),
    predecessor_head_sha: requireEnv('PREDECESSOR_HEAD_SHA'),
    successor_issue_id: requireEnv('SUCCESSOR_ISSUE_ID'),
    successor_issue_number: requirePositiveInteger(
      requireEnv('SUCCESSOR_ISSUE_NUMBER'),
      'invalid_successor_issue_number',
    ),
    successor_pr_number: requirePositiveInteger(
      requireEnv('SUCCESSOR_PR_NUMBER'),
      'invalid_successor_pr_number',
    ),
    merge_base_sha: requireEnv('BASE_SHA'),
    head_sha: requireEnv('HEAD_SHA'),
    finding_ids: findingIds,
    succession: requirePositiveInteger(requireEnv('SUCCESSION'), 'invalid_succession'),
    review_round: requirePositiveInteger(requireEnv('REVIEW_ROUND'), 'invalid_review_round'),
  })
  await approveReviewLineageSupersession(
    {
      repository: requireEnv('GITHUB_REPOSITORY'),
      appId: requirePositiveInteger(requireEnv('LOOP_ENGINEER_APP_ID'), 'invalid_app_id'),
      runId: requireEnv('GITHUB_RUN_ID'),
      runAttempt: requireEnv('GITHUB_RUN_ATTEMPT'),
      proof,
    },
    createGitHubReviewLineageSupersessionAdapter(),
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const reason =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'failed'
    process.stderr.write(`::error::${reason}\n`)
    process.exitCode = 1
  })
}
