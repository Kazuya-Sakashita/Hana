import { generateKeyPairSync, sign } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  approveReviewRoundException,
  createGitHubReviewRoundExceptionAdapter,
  verifyReviewRoundException,
  type ReviewRoundExceptionAdapter,
  type ReviewRoundExceptionCheckRun,
  type ReviewRoundExceptionPullRequest,
} from '../../../scripts/loop-engineer/github-review-round-exception'

const repository = 'Kazuya-Sakashita/Hana'
const appId = 424242
const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const runId = '7001'
const runAttempt = '1'
const now = 1_786_000_000
const audience = 'hana-review-round-exception/v1'
const keyId = 'test-key'
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'RS256', use: 'sig' }
const proof = {
  schema_version: 'loop-engineer-review-round-exception/v1' as const,
  issue_id: 'ISSUE-172',
  pr_number: 355,
  merge_base_sha: mergeBaseSha,
  head_sha: headSha,
  max_round: 5 as const,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function oidcToken(overrides: Record<string, unknown> = {}): string {
  const header = encode({ alg: 'RS256', kid: keyId, typ: 'JWT' })
  const payload = encode({
    iss: 'https://token.actions.githubusercontent.com',
    aud: audience,
    sub: 'repo:Kazuya-Sakashita/Hana:environment:hana-merge-human-approval',
    repository: repository,
    repository_id: '1238189306',
    repository_owner: 'Kazuya-Sakashita',
    repository_owner_id: '64903209',
    actor: 'Kazuya-Sakashita',
    actor_id: '64903209',
    ref: 'refs/heads/main',
    ref_protected: 'true',
    sha: mergeBaseSha,
    workflow_ref:
      'Kazuya-Sakashita/Hana/.github/workflows/loop-engineer-review-round-exception.yml@refs/heads/main',
    workflow_sha: mergeBaseSha,
    environment: 'hana-merge-human-approval',
    event_name: 'workflow_dispatch',
    run_id: runId,
    run_attempt: runAttempt,
    runner_environment: 'github-hosted',
    jti: 'synthetic-jti',
    iat: now - 5,
    nbf: now - 5,
    exp: now + 300,
    ...overrides,
  })
  const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString(
    'base64url',
  )
  return `${header}.${payload}.${signature}`
}

function currentPullRequest(): ReviewRoundExceptionPullRequest {
  return {
    state: 'open',
    draft: false,
    base_ref: 'main',
    current_main_sha: mergeBaseSha,
    head_sha: headSha,
    mergeable: true,
  }
}

function createClient(
  options: {
    oidcOverrides?: Record<string, unknown>
    invalidSignature?: boolean
    moveMainAfterFirstRead?: boolean
    initialRuns?: ReviewRoundExceptionCheckRun[]
    pullRequestOverrides?: Partial<ReviewRoundExceptionPullRequest>
  } = {},
) {
  let pullRequest = { ...currentPullRequest(), ...options.pullRequestOverrides }
  let nextId = 1
  let pullRequestReads = 0
  const runs: ReviewRoundExceptionCheckRun[] = structuredClone(options.initialRuns ?? [])
  const client: ReviewRoundExceptionAdapter = {
    async requestOidcToken(requestedAudience) {
      if (requestedAudience !== audience) throw new Error('invalid_oidc_audience')
      const token = oidcToken(options.oidcOverrides)
      if (!options.invalidSignature) return token
      const parts = token.split('.')
      parts[2] = `${parts[2]?.startsWith('a') ? 'b' : 'a'}${parts[2]?.slice(1)}`
      return parts.join('.')
    },
    async readOidcJwks() {
      return { keys: [publicJwk] }
    },
    nowUnixSeconds() {
      return now
    },
    async readPullRequest() {
      pullRequestReads += 1
      if (options.moveMainAfterFirstRead && pullRequestReads > 1) {
        pullRequest = { ...pullRequest, current_main_sha: 'c'.repeat(40) }
      }
      return structuredClone(pullRequest)
    },
    async readCheckRuns() {
      return structuredClone(runs)
    },
    async createCheckRun(_repository, input) {
      const run = { id: nextId++, app_id: appId, ...input }
      runs.push(run)
      return { id: run.id }
    },
    async updateCheckRun(_repository, checkId, input) {
      const run = runs.find(({ id }) => id === checkId)
      if (!run) throw new Error('github_api_failed')
      Object.assign(run, input)
    },
  }
  return {
    client,
    moveMain() {
      pullRequest = { ...pullRequest, current_main_sha: 'c'.repeat(40) }
    },
    runs,
  }
}

function approvedCheckRun(
  overrides: Partial<ReviewRoundExceptionCheckRun> = {},
): ReviewRoundExceptionCheckRun {
  return {
    id: 11,
    app_id: appId,
    name: 'review-round-exception',
    head_sha: headSha,
    external_id: `loop-engineer-review-round-exception/v1|ISSUE-172|355|${mergeBaseSha}|${headSha}|5`,
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  }
}

describe('ISSUE-173 GitHub review-round exception controller', () => {
  it('publishes and verifies one dedicated-App proof bound to the live PR and main SHA', async () => {
    const { client } = createClient()

    await expect(
      approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
    ).resolves.toEqual({ status: 'approved', max_round: 5 })
    await expect(verifyReviewRoundException({ repository, appId, proof }, client)).resolves.toEqual(
      { status: 'approved', max_round: 5 },
    )
  })

  it('rejects a signed token from any job outside the protected approval Environment', async () => {
    const { client } = createClient({ oidcOverrides: { environment: 'unprotected' } })

    await expect(
      approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
    ).rejects.toThrow('oidc_claim_mismatch')
    await expect(verifyReviewRoundException({ repository, appId, proof }, client)).rejects.toThrow(
      'review_round_exception_not_approved',
    )
  })

  it.each([
    ['issuer', { iss: 'https://example.invalid' }],
    ['audience', { aud: 'another-audience' }],
    ['repository', { repository: 'Kazuya-Sakashita/Other' }],
    ['repository ID', { repository_id: '1' }],
    ['owner', { repository_owner: 'Other' }],
    ['owner ID', { repository_owner_id: '1' }],
    ['actor', { actor: 'Other' }],
    ['actor ID', { actor_id: '1' }],
    ['ref', { ref: 'refs/heads/feature' }],
    ['workflow SHA', { workflow_sha: 'c'.repeat(40) }],
    ['event SHA', { sha: 'c'.repeat(40) }],
    [
      'workflow ref',
      {
        workflow_ref: 'Kazuya-Sakashita/Hana/.github/workflows/other.yml@refs/heads/main',
      },
    ],
    ['environment', { environment: 'unprotected' }],
    ['event', { event_name: 'pull_request' }],
    ['run ID', { run_id: '8001' }],
    ['run attempt', { run_attempt: '2' }],
    ['runner', { runner_environment: 'self-hosted' }],
    ['subject', { sub: 'repo:Kazuya-Sakashita/Hana:ref:refs/heads/main' }],
    ['protected ref', { ref_protected: 'false' }],
    ['token ID', { jti: '' }],
  ])(
    'rejects a signed OIDC token with mismatched %s before publishing a Check',
    async (_name, overrides) => {
      const { client, runs } = createClient({ oidcOverrides: overrides })

      await expect(
        approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
      ).rejects.toThrow('oidc_claim_mismatch')
      expect(runs).toEqual([])
    },
  )

  it.each([
    ['future issued-at', { iat: now + 31 }],
    ['stale issued-at', { iat: now - 601 }],
    ['future not-before', { nbf: now + 31 }],
    ['expired', { exp: now - 31 }],
    ['overlong lifetime', { iat: now, exp: now + 601 }],
  ])('rejects a token with %s before publishing a Check', async (_name, overrides) => {
    const { client, runs } = createClient({ oidcOverrides: overrides })

    await expect(
      approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
    ).rejects.toThrow('oidc_token_expired')
    expect(runs).toEqual([])
  })

  it('rejects a token whose GitHub OIDC signature does not verify', async () => {
    const { client } = createClient({ invalidSignature: true })

    await expect(
      approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
    ).rejects.toThrow('invalid_oidc_signature')
  })

  it('publishes failure instead of approval when main moves during issuance', async () => {
    const { client, runs } = createClient({ moveMainAfterFirstRead: true })

    await expect(
      approveReviewRoundException({ repository, appId, runId, runAttempt, proof }, client),
    ).rejects.toThrow('stale_review_round_exception')
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ status: 'completed', conclusion: 'failure' })
  })

  it('rejects ambiguous same-App exception checks instead of choosing one', async () => {
    const approvedRun = approvedCheckRun()
    const { client } = createClient({ initialRuns: [approvedRun, { ...approvedRun, id: 12 }] })

    await expect(verifyReviewRoundException({ repository, appId, proof }, client)).rejects.toThrow(
      'ambiguous_review_round_exception',
    )
  })

  it.each([
    [
      'wrong App',
      [approvedCheckRun({ app_id: appId + 1 })],
      {},
      'review_round_exception_not_approved',
    ],
    [
      'head drift',
      [approvedCheckRun()],
      { head_sha: 'c'.repeat(40) },
      'stale_review_round_exception',
    ],
    [
      'main drift',
      [approvedCheckRun()],
      { current_main_sha: 'c'.repeat(40) },
      'stale_review_round_exception',
    ],
    [
      'in progress',
      [approvedCheckRun({ status: 'in_progress', conclusion: null })],
      {},
      'review_round_exception_not_approved',
    ],
    [
      'failed',
      [approvedCheckRun({ conclusion: 'failure' })],
      {},
      'review_round_exception_not_approved',
    ],
    [
      'missing conclusion',
      [approvedCheckRun({ conclusion: null })],
      {},
      'review_round_exception_not_approved',
    ],
    [
      'wrong external ID',
      [approvedCheckRun({ external_id: 'wrong' })],
      {},
      'review_round_exception_not_approved',
    ],
    ['missing Check', [], {}, 'review_round_exception_not_approved'],
  ] as const)(
    'fails closed while verifying a %s proof',
    async (_name, initialRuns, pullRequestOverrides, reason) => {
      const { client } = createClient({
        initialRuns: [...initialRuns],
        pullRequestOverrides,
      })

      await expect(
        verifyReviewRoundException({ repository, appId, proof }, client),
      ).rejects.toThrow(reason)
    },
  )

  it('stops reading an oversized chunked OIDC response as soon as the limit is exceeded', async () => {
    let pulls = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(128 * 1024))
        if (pulls === 6) controller.close()
      },
      cancel() {
        cancelled = true
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

    await expect(createGitHubReviewRoundExceptionAdapter().readOidcJwks()).rejects.toThrow(
      'oidc_response_too_large',
    )
    expect(pulls).toBeLessThan(6)
    expect(cancelled).toBe(true)
  })
})
