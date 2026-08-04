import { describe, expect, it } from 'vitest'

import {
  approveCheckGeneration,
  beginCheckGeneration,
  finalizeCheckGeneration,
  revokeBreakingWaiver,
  toPullRequestSnapshot,
  type FinalizeCheckGenerationInput,
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
  latestIds?: number[]
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
  let nextId = 101
  const client: GitHubCheckGenerationClient = {
    async readPullRequest() {
      calls.push('read:pull-request')
      return currentPullRequest(options.pullRequest)
    },
    async readLatestCheckRunIds(_repository, _headSha, name, _appId) {
      calls.push(`read:latest:${name}`)
      return options.latestIds ?? [checkIds.merge_eligibility_check_id]
    },
    async createCheckRun(_repository, input) {
      calls.push(`create:${input.name}:${input.status}:${input.conclusion ?? 'none'}`)
      return { id: nextId++ }
    },
    async updateCheckRun(_repository, id, input) {
      calls.push(`update:${id}:${input.name}:${input.conclusion}`)
      if (options.failUpdateId === id) throw new Error('github_api_failed')
    },
  }
  return { client, calls }
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

const staleCases: Array<[string, ClientOptions, boolean]> = [
  ['a moved head SHA', { pullRequest: { head_sha: 'c'.repeat(40) } }, false],
  ['a moved main SHA', { pullRequest: { base_sha: 'd'.repeat(40) } }, false],
  ['a newer generation', { latestIds: [999] }, false],
  ['a removed breaking waiver', { pullRequest: { breaking_approval_label_present: false } }, true],
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
      'update:101:merge-eligibility:success',
    ])
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
          mergeEligibilityCheckId: checkIds.merge_eligibility_check_id,
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
    async (_name, options, breakingDetected) => {
      const { client, calls } = createClient(options)

      await expect(
        finalizeCheckGeneration(
          finalizeInput({ openapiBreakingDetected: breakingDetected }),
          client,
        ),
      ).rejects.toThrow('stale_generation')
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
          mergeEligibilityCheckId: checkIds.merge_eligibility_check_id,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).rejects.toThrow('stale_human_approval')
    expect(calls).toEqual([
      'read:pull-request',
      'read:latest:merge-eligibility',
      'update:101:merge-eligibility:failure',
    ])
  })

  it('fails human approval after main moves', async () => {
    const { client, calls } = createClient({
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
          mergeEligibilityCheckId: checkIds.merge_eligibility_check_id,
          openapiBreakingDetected: false,
          mergeReason: 'human_gate_required',
        },
        client,
      ),
    ).rejects.toThrow('stale_human_approval')
    expect(calls.at(-1)).toBe('update:101:merge-eligibility:failure')
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
