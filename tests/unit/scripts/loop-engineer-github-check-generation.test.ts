import { describe, expect, it } from 'vitest'

import {
  approveCheckGeneration,
  beginCheckGeneration,
  createGitHubClient,
  finalizeCheckGeneration,
  revokeBreakingWaiver,
  toPullRequestSnapshot,
  type FinalizeCheckGenerationInput,
  type GitHubApiTransport,
  type GitHubCheckGenerationClient,
  type PullRequestSnapshot,
} from '../../../scripts/loop-engineer/github-check-generation'

const repository = 'Kazuya-Sakashita/Hana'
const headSha = 'a'.repeat(40)
const baseSha = 'b'.repeat(40)
const appId = 424242
const checkIds = {
  merge_eligibility_check_id: 101,
  specialist_review_check_id: 102,
  pr_gate_check_id: 103,
  validate_check_id: 104,
  local_registry_check_id: 105,
}

type ClientOptions = {
  pullRequest?: Partial<PullRequestSnapshot>
  pullRequests?: Array<Partial<PullRequestSnapshot>>
  latestIds?: number[]
  latestIdsSequence?: number[][]
  failUpdateId?: number
}

function currentPullRequest(overrides: Partial<PullRequestSnapshot> = {}): PullRequestSnapshot {
  return {
    state: 'open',
    draft: false,
    base_ref: 'main',
    base_sha: baseSha,
    head_sha: headSha,
    mergeable: true,
    breaking_approval_label_present: true,
    ...overrides,
  }
}

function createClient(options: ClientOptions = {}) {
  const calls: string[] = []
  const summaries: string[] = []
  let nextId = 101
  let pullRequestReadIndex = 0
  let latestIdsReadIndex = 0
  const client: GitHubCheckGenerationClient = {
    async readPullRequest() {
      calls.push('read:pull-request')
      const pullRequest =
        options.pullRequests?.[Math.min(pullRequestReadIndex, options.pullRequests.length - 1)] ??
        options.pullRequest
      pullRequestReadIndex += 1
      return currentPullRequest(pullRequest)
    },
    async readLatestCheckRunIds(_repository, _headSha, name, _appId) {
      calls.push(`read:latest:${name}`)
      const latestIds =
        options.latestIdsSequence?.[
          Math.min(latestIdsReadIndex, options.latestIdsSequence.length - 1)
        ] ?? options.latestIds
      latestIdsReadIndex += 1
      return latestIds ?? [checkIds.merge_eligibility_check_id]
    },
    async createCheckRun(_repository, input) {
      calls.push(`create:${input.name}:${input.status}:${input.conclusion ?? 'none'}`)
      return { id: nextId++ }
    },
    async updateCheckRun(_repository, id, input) {
      calls.push(`update:${id}:${input.name}:${input.conclusion}`)
      summaries.push(input.summary)
      if (options.failUpdateId === id) throw new Error('github_api_failed')
    },
  }
  return { client, calls, summaries }
}

const pullRequestBaseSnapshotSha = 'c'.repeat(40)

function createProductionTransport() {
  const calls: string[] = []
  let nextCheckId = checkIds.merge_eligibility_check_id
  const transport: GitHubApiTransport = {
    requestJson<T>(args: string[], input?: unknown): T {
      const endpoint = args.find((arg) => arg.startsWith(`repos/${repository}/`))
      calls.push(`${args.includes('POST') ? 'POST' : 'GET'}:${endpoint}`)
      if (endpoint === `repos/${repository}/pulls/338`) {
        return {
          state: 'open',
          draft: false,
          base: { ref: 'main', sha: pullRequestBaseSnapshotSha },
          head: { sha: headSha },
          mergeable: true,
          labels: [{ name: 'openapi-breaking-approved' }],
        } as T
      }
      if (endpoint === `repos/${repository}/git/ref/heads/main`) {
        return { object: { sha: baseSha } } as T
      }
      if (endpoint?.includes('/check-runs?')) {
        return {
          total_count: 1,
          check_runs: [{ id: checkIds.merge_eligibility_check_id }],
        } as T
      }
      if (args.includes('POST') && endpoint === `repos/${repository}/check-runs`) {
        expect(input).toBeDefined()
        return { id: nextCheckId++ } as T
      }
      throw new Error(`unexpected_request:${endpoint}`)
    },
    requestVoid(args: string[], input: unknown) {
      const endpoint = args.find((arg) => arg.startsWith(`repos/${repository}/`))
      calls.push(`PATCH:${endpoint}`)
      expect(input).toBeDefined()
    },
  }
  return { transport, calls }
}

const beginInput = {
  repository,
  prNumber: 338,
  headSha,
  baseSha,
  runId: '5001',
}

function finalizeInput(
  overrides: Partial<FinalizeCheckGenerationInput> = {},
): FinalizeCheckGenerationInput {
  return {
    repository,
    appId,
    prNumber: 338,
    headSha,
    baseSha,
    checkIds,
    specialistStatus: 'success',
    mergeDecision: 'AUTO_MERGE_ELIGIBLE',
    mergeReason: 'low_risk_all_gates_passed',
    prGateResult: 'success',
    openapiResult: 'success',
    openapiBreakingResult: 'success',
    openapiBreakingDetected: false,
    registryResult: 'success',
    ...overrides,
  }
}

const staleCases: Array<[string, ClientOptions, boolean, string]> = [
  ['a moved head SHA', { pullRequest: { head_sha: 'c'.repeat(40) } }, false, 'stale_generation'],
  [
    'a moved main SHA',
    { pullRequest: { base_sha: 'd'.repeat(40) } },
    false,
    'current_main_sha_mismatch',
  ],
  ['a newer generation', { latestIds: [999] }, false, 'stale_generation'],
  [
    'a removed breaking waiver',
    { pullRequest: { breaking_approval_label_present: false } },
    true,
    'stale_generation',
  ],
]

describe('ISSUE-166 dedicated-App check generation controller', () => {
  it('starts merge-eligibility first so prior same-SHA success is invalidated immediately', async () => {
    const { client, calls } = createClient()

    await expect(beginCheckGeneration(beginInput, client)).resolves.toEqual(checkIds)
    expect(calls).toEqual([
      'read:pull-request',
      'create:merge-eligibility:in_progress:none',
      'create:specialist-review-gate:in_progress:none',
      'create:pr-gate:in_progress:none',
      'create:validate:in_progress:none',
      'create:local-registry:in_progress:none',
    ])
  })

  it('does not start a check generation after main moves', async () => {
    const { client, calls } = createClient({
      pullRequest: { base_sha: 'd'.repeat(40) },
    })

    await expect(beginCheckGeneration(beginInput, client)).rejects.toThrow('stale_generation')
    expect(calls).toEqual(['read:pull-request'])
  })

  it('maps the current main ref SHA instead of the pull request base snapshot', () => {
    expect(
      toPullRequestSnapshot(
        {
          state: 'open',
          draft: false,
          base: { ref: 'main', sha: 'c'.repeat(40) },
          head: { sha: headSha },
          mergeable: true,
          labels: [],
        },
        { object: { sha: baseSha } },
      ).base_sha,
    ).toBe(baseSha)
  })

  it('uses the production main-ref readback for begin, finalize, and approve', async () => {
    const beginTransport = createProductionTransport()
    await expect(
      beginCheckGeneration(beginInput, createGitHubClient(beginTransport.transport)),
    ).resolves.toEqual(checkIds)

    const finalizeTransport = createProductionTransport()
    await expect(
      finalizeCheckGeneration(finalizeInput(), createGitHubClient(finalizeTransport.transport)),
    ).resolves.toEqual({ status: 'completed', conclusion: 'success' })

    const approveTransport = createProductionTransport()
    await expect(
      approveCheckGeneration(
        {
          repository,
          appId,
          prNumber: 338,
          headSha,
          baseSha,
          checkIds,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        createGitHubClient(approveTransport.transport),
      ),
    ).resolves.toEqual({ status: 'completed', conclusion: 'success' })

    expect(pullRequestBaseSnapshotSha).not.toBe(baseSha)
    expect(
      beginTransport.calls.filter((call) => call.endsWith('/git/ref/heads/main')),
    ).toHaveLength(1)
    expect(
      finalizeTransport.calls.filter((call) => call.endsWith('/git/ref/heads/main')),
    ).toHaveLength(2)
    expect(
      approveTransport.calls.filter((call) => call.endsWith('/git/ref/heads/main')),
    ).toHaveLength(2)
    const currentGenerationRead =
      `GET:repos/${repository}/commits/${headSha}/check-runs?` +
      `filter=latest&check_name=merge-eligibility&app_id=${appId}&per_page=100`
    expect(finalizeTransport.calls.filter((call) => call === currentGenerationRead)).toHaveLength(2)
    expect(approveTransport.calls.filter((call) => call === currentGenerationRead)).toHaveLength(2)
    expect(finalizeTransport.calls.some((call) => call.startsWith('POST:'))).toBe(false)
    expect(approveTransport.calls.some((call) => call.startsWith('POST:'))).toBe(false)
    expect(approveTransport.calls.at(-1)).toBe(
      `PATCH:repos/${repository}/check-runs/${checkIds.merge_eligibility_check_id}`,
    )
  })

  it('publishes AUTO success only after all four evidence checks succeed', async () => {
    const { client, calls } = createClient()

    await expect(finalizeCheckGeneration(finalizeInput(), client)).resolves.toEqual({
      status: 'completed',
      conclusion: 'success',
    })
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:success',
      'update:104:validate:success',
      'update:105:local-registry:success',
      'update:102:specialist-review-gate:success',
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:101:merge-eligibility:success',
    ])
  })

  it('fails the current AUTO generation when main moves immediately before success', async () => {
    const { client, calls, summaries } = createClient({
      pullRequests: [{}, { base_sha: 'd'.repeat(40) }],
      latestIdsSequence: [
        [checkIds.merge_eligibility_check_id],
        [checkIds.merge_eligibility_check_id],
      ],
    })

    await expect(finalizeCheckGeneration(finalizeInput(), client)).rejects.toThrow(
      'current_main_sha_mismatch',
    )
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:success',
      'update:104:validate:success',
      'update:105:local-registry:success',
      'update:102:specialist-review-gate:success',
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:failure',
      'update:104:validate:failure',
      'update:105:local-registry:failure',
      'update:102:specialist-review-gate:failure',
      'update:101:merge-eligibility:failure',
    ])
    expect(calls).not.toContain('update:101:merge-eligibility:success')
    expect(summaries.slice(-5)).toEqual(Array(5).fill('current_main_sha_mismatch'))
  })

  it('keeps HOLD fail-closed even when every candidate check succeeds', async () => {
    const { client, calls } = createClient()

    await expect(
      finalizeCheckGeneration(
        finalizeInput({ mergeDecision: 'HOLD', mergeReason: 'manual_hold' }),
        client,
      ),
    ).resolves.toEqual({ status: 'completed', conclusion: 'failure' })
    expect(calls.at(-1)).toBe('update:101:merge-eligibility:failure')
    expect(calls).not.toContain('update:101:merge-eligibility:success')
  })

  it('leaves HUMAN_REQUIRED pending until approval updates the same check id', async () => {
    const { client, calls } = createClient()

    await expect(
      finalizeCheckGeneration(
        finalizeInput({ mergeDecision: 'HUMAN_REQUIRED', mergeReason: 'human_gate_required' }),
        client,
      ),
    ).resolves.toEqual({ status: 'in_progress', conclusion: null })
    expect(calls.filter((call) => call.includes('merge-eligibility'))).toEqual([
      'read:latest:merge-eligibility',
    ])

    await expect(
      approveCheckGeneration(
        {
          repository,
          appId,
          prNumber: 338,
          headSha,
          baseSha,
          checkIds,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).resolves.toEqual({ status: 'completed', conclusion: 'success' })
    expect(calls.at(-1)).toBe('update:101:merge-eligibility:success')
  })

  it('fails HUMAN_REQUIRED without awaiting approval when a candidate check fails', async () => {
    const { client, calls } = createClient()

    await expect(
      finalizeCheckGeneration(
        finalizeInput({
          mergeDecision: 'HUMAN_REQUIRED',
          mergeReason: 'human_gate_required',
          registryResult: 'failure',
        }),
        client,
      ),
    ).resolves.toEqual({ status: 'completed', conclusion: 'failure' })
    expect(calls.at(-1)).toBe('update:101:merge-eligibility:failure')
  })

  it('never publishes merge success after a partial evidence publication failure', async () => {
    const { client, calls } = createClient({ failUpdateId: checkIds.validate_check_id })

    await expect(finalizeCheckGeneration(finalizeInput(), client)).rejects.toThrow(
      'github_api_failed',
    )
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:success',
      'update:104:validate:success',
    ])
    expect(calls).not.toContain('update:101:merge-eligibility:success')
  })

  it.each(staleCases)(
    'fails every current check for %s and never publishes success',
    async (_name, options, breakingDetected, expectedReason) => {
      const { client, calls } = createClient(options)

      await expect(
        finalizeCheckGeneration(
          finalizeInput({ openapiBreakingDetected: breakingDetected }),
          client,
        ),
      ).rejects.toThrow(expectedReason)
      expect(calls.filter((call) => call.startsWith('update:'))).toEqual([
        'update:103:pr-gate:failure',
        'update:104:validate:failure',
        'update:105:local-registry:failure',
        'update:102:specialist-review-gate:failure',
        'update:101:merge-eligibility:failure',
      ])
      expect(calls.some((call) => call.endsWith(':success'))).toBe(false)
    },
  )

  it('fails stale human approval instead of completing it successfully', async () => {
    const { client, calls } = createClient({ latestIds: [999] })

    await expect(
      approveCheckGeneration(
        {
          repository,
          appId,
          prNumber: 338,
          headSha,
          baseSha,
          checkIds,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).rejects.toThrow('stale_human_approval')
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:failure',
      'update:104:validate:failure',
      'update:105:local-registry:failure',
      'update:102:specialist-review-gate:failure',
      'update:101:merge-eligibility:failure',
    ])
  })

  it('fails human approval after main moves', async () => {
    const { client, calls, summaries } = createClient({
      pullRequest: { base_sha: 'd'.repeat(40) },
    })

    await expect(
      approveCheckGeneration(
        {
          repository,
          appId,
          prNumber: 338,
          headSha,
          baseSha,
          checkIds,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).rejects.toThrow('current_main_sha_mismatch')
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:failure',
      'update:104:validate:failure',
      'update:105:local-registry:failure',
      'update:102:specialist-review-gate:failure',
      'update:101:merge-eligibility:failure',
    ])
    expect(summaries.at(-1)).toBe('current_main_sha_mismatch')
  })

  it('fails human approval when main moves immediately before success', async () => {
    const { client, calls, summaries } = createClient({
      pullRequests: [{}, { base_sha: 'd'.repeat(40) }],
      latestIdsSequence: [
        [checkIds.merge_eligibility_check_id],
        [checkIds.merge_eligibility_check_id],
      ],
    })

    await expect(
      approveCheckGeneration(
        {
          repository,
          appId,
          prNumber: 338,
          headSha,
          baseSha,
          checkIds,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).rejects.toThrow('current_main_sha_mismatch')
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:103:pr-gate:failure',
      'update:104:validate:failure',
      'update:105:local-registry:failure',
      'update:102:specialist-review-gate:failure',
      'update:101:merge-eligibility:failure',
    ])
    expect(calls).not.toContain('update:101:merge-eligibility:success')
    expect(summaries.at(-1)).toBe('current_main_sha_mismatch')
  })

  it('revokes merge-eligibility before validate when the waiver label is removed', async () => {
    const { client, calls } = createClient({
      pullRequest: { draft: true, breaking_approval_label_present: false },
    })

    await expect(
      revokeBreakingWaiver(
        { repository, prNumber: 338, eventHeadSha: headSha, runId: '5002' },
        client,
      ),
    ).resolves.toEqual({ revoked: true })
    expect(calls).toEqual([
      'read:pull-request',
      'create:merge-eligibility:completed:failure',
      'create:validate:completed:failure',
    ])
  })
})
