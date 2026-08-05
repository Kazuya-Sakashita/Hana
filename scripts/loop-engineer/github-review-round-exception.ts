import { execFileSync } from 'node:child_process'
import { createPublicKey, verify } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const reviewRoundExceptionCheckName = 'review-round-exception'

export type ReviewRoundExceptionProof = {
  schema_version: 'loop-engineer-review-round-exception/v1'
  issue_id: string
  pr_number: number
  merge_base_sha: string
  head_sha: string
  max_round: 4 | 5
}

export type ReviewRoundExceptionPullRequest = {
  state: string
  draft: boolean
  base_ref: string
  current_main_sha: string
  head_sha: string
  mergeable: boolean
}

export type ReviewRoundExceptionCheckRun = {
  id: number
  app_id: number
  name: string
  head_sha: string
  external_id: string
  status: string
  conclusion: string | null
}

type CreateCheckRunInput = Omit<ReviewRoundExceptionCheckRun, 'id' | 'app_id'>
type UpdateCheckRunInput = Pick<
  ReviewRoundExceptionCheckRun,
  'name' | 'external_id' | 'status' | 'conclusion'
>

export type ReviewRoundExceptionAdapter = {
  requestOidcToken(audience: string): Promise<string>
  readOidcJwks(): Promise<unknown>
  nowUnixSeconds(): number
  readPullRequest(repository: string, prNumber: number): Promise<ReviewRoundExceptionPullRequest>
  readCheckRuns(
    repository: string,
    headSha: string,
    name: string,
  ): Promise<ReviewRoundExceptionCheckRun[]>
  createCheckRun(repository: string, input: CreateCheckRunInput): Promise<{ id: number }>
  updateCheckRun(repository: string, checkId: number, input: UpdateCheckRunInput): Promise<void>
}

type ReviewRoundExceptionInput = {
  repository: string
  appId: number
  proof: ReviewRoundExceptionProof
}

export type ApproveReviewRoundExceptionInput = ReviewRoundExceptionInput & {
  runId: string
  runAttempt: string
}

const oidcAudience = 'hana-review-round-exception/v1'
const oidcIssuer = 'https://token.actions.githubusercontent.com'
const expectedRepository = 'Kazuya-Sakashita/Hana'
const expectedRepositoryId = '1238189306'
const expectedOwner = 'Kazuya-Sakashita'
const expectedOwnerId = '64903209'
const expectedEnvironment = 'hana-merge-human-approval'
const expectedWorkflowRef =
  'Kazuya-Sakashita/Hana/.github/workflows/loop-engineer-review-round-exception.yml@refs/heads/main'
const proofFields = [
  'schema_version',
  'issue_id',
  'pr_number',
  'merge_base_sha',
  'head_sha',
  'max_round',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
}

function requireProof(value: unknown): ReviewRoundExceptionProof {
  if (
    !isRecord(value) ||
    Object.keys(value).some((field) => !proofFields.includes(field as never)) ||
    proofFields.some((field) => !Object.hasOwn(value, field)) ||
    value.schema_version !== 'loop-engineer-review-round-exception/v1' ||
    typeof value.issue_id !== 'string' ||
    !/^ISSUE-\d{3}$/.test(value.issue_id) ||
    !Number.isSafeInteger(value.pr_number) ||
    (value.pr_number as number) <= 0 ||
    !isSha(value.merge_base_sha) ||
    !isSha(value.head_sha) ||
    (value.max_round !== 4 && value.max_round !== 5)
  ) {
    throw new Error('invalid_review_round_exception')
  }
  return value as ReviewRoundExceptionProof
}

function requireInput(input: ReviewRoundExceptionInput) {
  if (input.repository !== expectedRepository) throw new Error('invalid_repository')
  if (!Number.isSafeInteger(input.appId) || input.appId <= 0) {
    throw new Error('invalid_app_id')
  }
  return {
    repository: input.repository,
    appId: input.appId,
    proof: requireProof(input.proof),
  }
}

function isCurrentPullRequest(
  pullRequest: ReviewRoundExceptionPullRequest,
  proof: ReviewRoundExceptionProof,
): boolean {
  return (
    pullRequest.state === 'open' &&
    pullRequest.draft === false &&
    pullRequest.base_ref === 'main' &&
    pullRequest.current_main_sha === proof.merge_base_sha &&
    pullRequest.head_sha === proof.head_sha &&
    pullRequest.mergeable === true
  )
}

function externalId(proof: ReviewRoundExceptionProof): string {
  return [
    proof.schema_version,
    proof.issue_id,
    String(proof.pr_number),
    proof.merge_base_sha,
    proof.head_sha,
    String(proof.max_round),
  ].join('|')
}

function trustedRuns(
  runs: ReviewRoundExceptionCheckRun[],
  appId: number,
): ReviewRoundExceptionCheckRun[] {
  return runs.filter((run) => run.app_id === appId && run.name === reviewRoundExceptionCheckName)
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
  input: ApproveReviewRoundExceptionInput,
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
  input: ApproveReviewRoundExceptionInput,
  adapter: ReviewRoundExceptionAdapter,
): Promise<void> {
  const token = await adapter.requestOidcToken(oidcAudience)
  if (typeof token !== 'string' || token.length > 16 * 1024) {
    throw new Error('invalid_oidc_token')
  }
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

export async function approveReviewRoundException(
  rawInput: ApproveReviewRoundExceptionInput,
  adapter: ReviewRoundExceptionAdapter,
): Promise<{ status: 'approved'; max_round: 4 | 5 }> {
  const input = {
    ...requireInput(rawInput),
    runId: rawInput.runId,
    runAttempt: rawInput.runAttempt,
  }
  if (!/^\d+$/.test(input.runId) || !/^\d+$/.test(input.runAttempt)) {
    throw new Error('invalid_workflow_run')
  }
  await verifyProtectedEnvironmentApproval(input, adapter)

  const pullRequest = await adapter.readPullRequest(input.repository, input.proof.pr_number)
  if (!isCurrentPullRequest(pullRequest, input.proof)) {
    throw new Error('stale_review_round_exception')
  }
  const runs = trustedRuns(
    await adapter.readCheckRuns(
      input.repository,
      input.proof.head_sha,
      reviewRoundExceptionCheckName,
    ),
    input.appId,
  )
  if (runs.length > 1) throw new Error('ambiguous_review_round_exception')

  const requestedExternalId = externalId(input.proof)
  const checkId =
    runs[0]?.id ??
    (
      await adapter.createCheckRun(input.repository, {
        name: reviewRoundExceptionCheckName,
        head_sha: input.proof.head_sha,
        external_id: requestedExternalId,
        status: 'in_progress',
        conclusion: null,
      })
    ).id
  if (!Number.isSafeInteger(checkId) || checkId <= 0) throw new Error('invalid_check_id')
  if (runs[0]) {
    await adapter.updateCheckRun(input.repository, checkId, {
      name: reviewRoundExceptionCheckName,
      external_id: requestedExternalId,
      status: 'in_progress',
      conclusion: null,
    })
  }

  const freshPullRequest = await adapter.readPullRequest(input.repository, input.proof.pr_number)
  if (!isCurrentPullRequest(freshPullRequest, input.proof)) {
    await adapter.updateCheckRun(input.repository, checkId, {
      name: reviewRoundExceptionCheckName,
      external_id: requestedExternalId,
      status: 'completed',
      conclusion: 'failure',
    })
    throw new Error('stale_review_round_exception')
  }
  await adapter.updateCheckRun(input.repository, checkId, {
    name: reviewRoundExceptionCheckName,
    external_id: requestedExternalId,
    status: 'completed',
    conclusion: 'success',
  })
  return { status: 'approved', max_round: input.proof.max_round }
}

export async function verifyReviewRoundException(
  rawInput: ReviewRoundExceptionInput,
  adapter: ReviewRoundExceptionAdapter,
): Promise<{ status: 'approved'; max_round: 4 | 5 }> {
  const input = requireInput(rawInput)
  const [pullRequest, allRuns] = await Promise.all([
    adapter.readPullRequest(input.repository, input.proof.pr_number),
    adapter.readCheckRuns(input.repository, input.proof.head_sha, reviewRoundExceptionCheckName),
  ])
  if (!isCurrentPullRequest(pullRequest, input.proof)) {
    throw new Error('stale_review_round_exception')
  }
  const runs = trustedRuns(allRuns, input.appId)
  if (runs.length > 1) throw new Error('ambiguous_review_round_exception')
  const run = runs[0]
  if (
    !run ||
    run.head_sha !== input.proof.head_sha ||
    run.external_id !== externalId(input.proof) ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  ) {
    throw new Error('review_round_exception_not_approved')
  }
  return { status: 'approved', max_round: input.proof.max_round }
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
    const bytes = Buffer.concat(chunks, totalBytes)
    return JSON.parse(bytes.toString('utf8')) as unknown
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

export function createGitHubReviewRoundExceptionAdapter(): ReviewRoundExceptionAdapter {
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
      const response = ghJson<{
        state?: unknown
        draft?: unknown
        base?: { ref?: unknown }
        head?: { sha?: unknown }
        mergeable?: unknown
      }>([`repos/${repository}/pulls/${prNumber}`])
      const mainRef = ghJson<{ object?: { sha?: unknown } }>([
        `repos/${repository}/git/ref/heads/main`,
      ])
      return {
        state: String(response.state),
        draft: response.draft === true,
        base_ref: String(response.base?.ref),
        current_main_sha: String(mainRef.object?.sha),
        head_sha: String(response.head?.sha),
        mergeable: response.mergeable === true,
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
        ['--method', 'POST', `repos/${repository}/check-runs`, '--input', '-'],
        {
          name: input.name,
          head_sha: input.head_sha,
          external_id: input.external_id,
          status: input.status,
          ...(input.conclusion === null ? {} : { conclusion: input.conclusion }),
          output: { title: input.name, summary: 'review_round_exception_in_progress' },
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
              ? 'review_round_exception_approved'
              : input.conclusion === 'failure'
                ? 'review_round_exception_stale'
                : 'review_round_exception_in_progress',
        },
      })
    },
  }
}

async function main(): Promise<void> {
  if (process.argv[2] !== 'approve') throw new Error('invalid_mode')
  const maxRound = requirePositiveInteger(requireEnv('MAX_ROUND'), 'invalid_max_round')
  if (maxRound !== 4 && maxRound !== 5) throw new Error('invalid_max_round')
  await approveReviewRoundException(
    {
      repository: requireEnv('GITHUB_REPOSITORY'),
      appId: requirePositiveInteger(requireEnv('LOOP_ENGINEER_APP_ID'), 'invalid_app_id'),
      runId: requireEnv('GITHUB_RUN_ID'),
      runAttempt: requireEnv('GITHUB_RUN_ATTEMPT'),
      proof: {
        schema_version: 'loop-engineer-review-round-exception/v1',
        issue_id: requireEnv('ISSUE_ID'),
        pr_number: requirePositiveInteger(requireEnv('PR_NUMBER'), 'invalid_pr_number'),
        merge_base_sha: requireEnv('BASE_SHA'),
        head_sha: requireEnv('HEAD_SHA'),
        max_round: maxRound,
      },
    },
    createGitHubReviewRoundExceptionAdapter(),
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
