import { generateKeyPairSync, sign } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  approveReviewLineageSupersession,
  issue172Lineage,
  parseReviewLineageSupersessionProof,
  reviewLineageRegistrationExternalId,
  reviewLineageSupersessionExternalId,
  verifyReviewLineageSupersession,
  type ReviewLineageCheckRun,
  type ReviewLineagePullRequest,
  type ReviewLineageSupersessionAdapter,
} from '../../../scripts/loop-engineer/github-review-lineage-supersession'

const repository = 'Kazuya-Sakashita/Hana'
const appId = 424242
const mergeBaseSha = 'a'.repeat(40)
const headSha = 'b'.repeat(40)
const runId = '9001'
const runAttempt = '1'
const now = 1_786_000_000
const audience = 'hana-review-lineage-supersession/v1'
const keyId = 'lineage-test-key'
const successorPrNumber = 361
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 })
const publicJwk = { ...publicKey.export({ format: 'jwk' }), kid: keyId, alg: 'RS256', use: 'sig' }

const proof = {
  schema_version: 'loop-engineer-review-lineage-supersession/v1' as const,
  review_lineage_id: issue172Lineage.review_lineage_id,
  predecessor_issue_id: issue172Lineage.predecessor_issue_id,
  predecessor_issue_number: issue172Lineage.predecessor_issue_number,
  predecessor_pr_number: issue172Lineage.predecessor_pr_number,
  predecessor_head_sha: issue172Lineage.predecessor_head_sha,
  successor_issue_id: issue172Lineage.successor_issue_id,
  successor_issue_number: issue172Lineage.successor_issue_number,
  successor_pr_number: successorPrNumber,
  merge_base_sha: mergeBaseSha,
  head_sha: headSha,
  finding_ids: [...issue172Lineage.finding_ids],
  succession: 1 as const,
  review_round: 1 as const,
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function oidcToken(overrides: Record<string, unknown> = {}): string {
  const header = encode({ alg: 'RS256', kid: keyId, typ: 'JWT' })
  const payload = encode({
    iss: 'https://token.actions.githubusercontent.com',
    aud: audience,
    sub: 'repo:Kazuya-Sakashita/Hana:environment:hana-merge-human-approval',
    repository,
    repository_id: '1238189306',
    repository_owner: 'Kazuya-Sakashita',
    repository_owner_id: '64903209',
    actor: 'Kazuya-Sakashita',
    actor_id: '64903209',
    ref: 'refs/heads/main',
    ref_protected: 'true',
    sha: mergeBaseSha,
    workflow_ref:
      'Kazuya-Sakashita/Hana/.github/workflows/loop-engineer-review-lineage-supersession.yml@refs/heads/main',
    workflow_sha: mergeBaseSha,
    environment: 'hana-merge-human-approval',
    event_name: 'workflow_dispatch',
    run_id: runId,
    run_attempt: runAttempt,
    runner_environment: 'github-hosted',
    jti: 'synthetic-lineage-jti',
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

function predecessor(): ReviewLineagePullRequest {
  return {
    state: 'closed',
    draft: false,
    base_ref: 'main',
    current_main_sha: mergeBaseSha,
    head_sha: issue172Lineage.predecessor_head_sha,
    mergeable: false,
    merged: false,
    closing_issues: [{ repository, number: issue172Lineage.predecessor_issue_number }],
  }
}

function successor(): ReviewLineagePullRequest {
  return {
    state: 'open',
    draft: false,
    base_ref: 'main',
    current_main_sha: mergeBaseSha,
    head_sha: headSha,
    mergeable: true,
    merged: false,
    closing_issues: [{ repository, number: issue172Lineage.successor_issue_number }],
  }
}

function createAdapter(
  options: {
    oidcOverrides?: Record<string, unknown>
    predecessorOverrides?: Partial<ReviewLineagePullRequest>
    successorOverrides?: Partial<ReviewLineagePullRequest>
    moveSuccessorAfterFirstPair?: boolean
    initialRuns?: ReviewLineageCheckRun[]
  } = {},
) {
  let oldPullRequest = { ...predecessor(), ...options.predecessorOverrides }
  let newPullRequest = { ...successor(), ...options.successorOverrides }
  let pullRequestReads = 0
  let nextId = 1
  const runs = structuredClone(options.initialRuns ?? [])
  const adapter: ReviewLineageSupersessionAdapter = {
    async requestOidcToken(requestedAudience) {
      if (requestedAudience !== audience) throw new Error('invalid_oidc_audience')
      return oidcToken(options.oidcOverrides)
    },
    async readOidcJwks() {
      return { keys: [publicJwk] }
    },
    nowUnixSeconds() {
      return now
    },
    async readPullRequest(_repository, prNumber) {
      pullRequestReads += 1
      if (options.moveSuccessorAfterFirstPair && pullRequestReads > 2) {
        newPullRequest = { ...newPullRequest, current_main_sha: 'c'.repeat(40) }
      }
      if (prNumber === issue172Lineage.predecessor_pr_number) {
        return structuredClone(oldPullRequest)
      }
      if (prNumber === successorPrNumber) return structuredClone(newPullRequest)
      throw new Error('unexpected_pr')
    },
    async readCheckRuns(_repository, requestedHeadSha, name) {
      return structuredClone(
        runs.filter((run) => run.head_sha === requestedHeadSha && run.name === name),
      )
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
    adapter,
    runs,
    reopenPredecessor() {
      oldPullRequest = { ...oldPullRequest, state: 'open' }
    },
  }
}

function approvedRun(overrides: Partial<ReviewLineageCheckRun> = {}): ReviewLineageCheckRun {
  return {
    id: 11,
    app_id: appId,
    name: 'review-lineage-supersession',
    head_sha: headSha,
    external_id: reviewLineageSupersessionExternalId(proof),
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  }
}

function approvedRegistration(
  overrides: Partial<ReviewLineageCheckRun> = {},
): ReviewLineageCheckRun {
  return {
    id: 21,
    app_id: appId,
    name: 'review-lineage-registration',
    head_sha: issue172Lineage.predecessor_head_sha,
    external_id: reviewLineageRegistrationExternalId(proof),
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  }
}

describe('ISSUE-174 review lineage supersession controller', () => {
  it('publishes and verifies one protected proof for a frozen predecessor and live successor', async () => {
    const { adapter } = createAdapter()

    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).resolves.toEqual({ status: 'approved', succession: 1 })
    await expect(
      verifyReviewLineageSupersession({ repository, appId, proof }, adapter),
    ).resolves.toEqual({ status: 'approved', succession: 1 })
  })

  it('rejects an open or merged predecessor before publishing a Check', async () => {
    for (const predecessorOverrides of [{ state: 'open' }, { merged: true }]) {
      const { adapter, runs } = createAdapter({ predecessorOverrides })
      await expect(
        approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
      ).rejects.toThrow('stale_review_lineage_supersession')
      expect(runs).toEqual([])
    }
  })

  it('publishes failure when main moves after the protected proof starts', async () => {
    const { adapter, runs } = createAdapter({ moveSuccessorAfterFirstPair: true })

    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).rejects.toThrow('stale_review_lineage_supersession')
    expect(runs).toHaveLength(2)
    expect(runs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'completed', conclusion: 'failure' }),
      ]),
    )
  })

  it('rejects OIDC from outside the protected Environment without publishing a Check', async () => {
    const { adapter, runs } = createAdapter({ oidcOverrides: { environment: 'unprotected' } })

    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).rejects.toThrow('oidc_claim_mismatch')
    expect(runs).toEqual([])
  })

  it.each([
    ['second succession', { ...proof, succession: 2 }],
    ['missing finding', { ...proof, finding_ids: proof.finding_ids.slice(1) }],
    ['unknown field', { ...proof, human_approved: true }],
    ['different predecessor head', { ...proof, predecessor_head_sha: 'c'.repeat(40) }],
    ['different successor issue', { ...proof, successor_issue_number: 360 }],
    ['reused predecessor head', { ...proof, head_sha: proof.predecessor_head_sha }],
  ])('rejects %s as an unregistered lineage proof', (_name, candidate) => {
    expect(parseReviewLineageSupersessionProof(candidate)).toBeNull()
  })

  it('requires exact GitHub Issue closing relations before publishing', async () => {
    const { adapter, runs } = createAdapter({
      successorOverrides: { closing_issues: [{ repository: 'other/repo', number: 359 }] },
    })
    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).rejects.toThrow('stale_review_lineage_supersession')
    expect(runs).toEqual([])
  })

  it('rejects a second successor PR after the lineage is registered', async () => {
    const otherProof = { ...proof, successor_pr_number: 362 }
    const { adapter } = createAdapter({
      initialRuns: [
        approvedRegistration({
          external_id: reviewLineageRegistrationExternalId(otherProof),
        }),
      ],
    })
    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).rejects.toThrow('review_lineage_already_superseded')
  })

  it('starts at round one and only advances one round on a new head', async () => {
    const roundTwoWithoutRegistration = { ...proof, review_round: 2 as const }
    const first = createAdapter()
    await expect(
      approveReviewLineageSupersession(
        { repository, appId, runId, runAttempt, proof: roundTwoWithoutRegistration },
        first.adapter,
      ),
    ).rejects.toThrow('review_lineage_must_start_at_round_one')

    const nextHead = 'c'.repeat(40)
    const roundTwo = { ...proof, head_sha: nextHead, review_round: 2 as const }
    const second = createAdapter({
      successorOverrides: { head_sha: nextHead },
      initialRuns: [approvedRegistration()],
    })
    await expect(
      approveReviewLineageSupersession(
        { repository, appId, runId, runAttempt, proof: roundTwo },
        second.adapter,
      ),
    ).resolves.toEqual({ status: 'approved', succession: 1 })
  })

  it('rejects ambiguous or wrong-App Checks instead of reusing them', async () => {
    const run = approvedRun()
    const ambiguous = createAdapter({
      initialRuns: [approvedRegistration(), run, { ...run, id: 12 }],
    })
    await expect(
      verifyReviewLineageSupersession({ repository, appId, proof }, ambiguous.adapter),
    ).rejects.toThrow('ambiguous_review_lineage_supersession')

    const wrongApp = createAdapter({
      initialRuns: [approvedRegistration(), approvedRun({ app_id: appId + 1 })],
    })
    await expect(
      verifyReviewLineageSupersession({ repository, appId, proof }, wrongApp.adapter),
    ).rejects.toThrow('review_lineage_check_app_mismatch')

    const mixedApps = createAdapter({
      initialRuns: [
        approvedRegistration(),
        approvedRun(),
        approvedRun({ id: 13, app_id: appId + 1 }),
      ],
    })
    await expect(
      verifyReviewLineageSupersession({ repository, appId, proof }, mixedApps.adapter),
    ).rejects.toThrow('review_lineage_check_app_mismatch')
  })

  it('does not republish a successful proof for the same round and head', async () => {
    const { adapter } = createAdapter({ initialRuns: [approvedRegistration(), approvedRun()] })
    await expect(
      approveReviewLineageSupersession({ repository, appId, runId, runAttempt, proof }, adapter),
    ).rejects.toThrow('invalid_review_lineage_round_progression')
  })

  it('stores only a schema and digest in the Check external ID', () => {
    const externalId = reviewLineageSupersessionExternalId(proof)
    expect(externalId).toMatch(/^loop-engineer-review-lineage-supersession\/v1\|[0-9a-f]{64}$/)
    expect(externalId).not.toContain(proof.head_sha)
    expect(externalId).not.toContain(proof.predecessor_issue_id)
  })
})
