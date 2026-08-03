import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  applyGitHubMergeControls,
  materializeRuleset,
  type GitHubMergeControlsClient,
  type GitHubMergeControlsSnapshot,
  type RulesetContract,
} from '../../../scripts/loop-engineer/github-merge-controls'

const root = fileURLToPath(new URL('../../..', import.meta.url))
const cliPath = `${root}/scripts/loop-engineer/apply-github-merge-controls.ts`
const appId = 424242
const headSha = 'b'.repeat(40)
const checkNames = [
  'pr-gate',
  'validate',
  'local-registry',
  'specialist-review-gate',
  'merge-eligibility',
]

function readJson(path: string) {
  return JSON.parse(readFileSync(`${root}/${path}`, 'utf8'))
}

const preflight = readJson(
  'docs/api-driven-development/loop-engineer-github-merge-controls/preflight.json',
) as GitHubMergeControlsSnapshot
const activeTemplate = readJson(
  'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset.template.json',
)
const disabledTemplate = readJson(
  'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset-disabled.template.json',
)
const desiredSettings = readJson(
  'docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings.json',
)
const rollbackSettings = readJson(
  'docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings-rollback.json',
)

function createClient(
  options: { failDesiredPatch?: boolean; drift?: boolean; createResponseLost?: boolean } = {},
) {
  const calls: string[] = []
  let ruleset: RulesetContract | null = null
  let settings = { ...rollbackSettings }
  const client: GitHubMergeControlsClient = {
    async readPreflight() {
      calls.push('read:preflight')
      return options.drift
        ? { ...preflight, allow_rebase_merge: false }
        : structuredClone(preflight)
    },
    async readTrustedCheckRuns() {
      calls.push('read:checks')
      return checkNames.map((name) => ({ name, app_id: appId, conclusion: 'success' as const }))
    },
    async findRulesetIdByName(name) {
      calls.push('find:ruleset')
      return ruleset?.name === name ? 7001 : null
    },
    async createRuleset(contract) {
      calls.push(`create:${contract.enforcement}`)
      ruleset = structuredClone(contract)
      if (options.createResponseLost) throw new Error('response_lost')
      return 7001
    },
    async updateRuleset(_rulesetId, contract) {
      calls.push(`update:${contract.enforcement}`)
      ruleset = structuredClone(contract)
    },
    async readRuleset() {
      calls.push('read:ruleset')
      if (!ruleset) throw new Error('missing_ruleset')
      return structuredClone(ruleset)
    },
    async patchRepositorySettings(nextSettings) {
      const target = nextSettings.allow_auto_merge ? 'desired' : 'rollback'
      calls.push(`patch:${target}`)
      if (target === 'desired' && options.failDesiredPatch) throw new Error('settings_patch_failed')
      settings = { ...nextSettings }
    },
    async readRepositorySettings() {
      calls.push('read:settings')
      return { ...settings }
    },
  }

  return { client, calls }
}

describe('ISSUE-166 transactional GitHub merge controls', () => {
  it('materializes all five checks to one dedicated App and rejects the generic Actions App', () => {
    const result = materializeRuleset(activeTemplate, appId)
    const checkRule = result.rules.find(({ type }) => type === 'required_status_checks')!

    expect(checkRule.parameters?.required_status_checks).toEqual(
      checkNames.map((context) => ({ context, integration_id: appId })),
    )
    expect(() => materializeRuleset(activeTemplate, 15368)).toThrow('dedicated_app_required')
    expect(() => materializeRuleset(activeTemplate, 0)).toThrow('invalid_app_id')
  })

  it('creates disabled, exact-readbacks, activates, and changes settings last', async () => {
    const { client, calls } = createClient()

    await expect(
      applyGitHubMergeControls(
        {
          repository: 'Kazuya-Sakashita/Hana',
          appId,
          bootstrapHeadSha: headSha,
          expectedPreflight: preflight,
          activeTemplate,
          disabledTemplate,
          desiredSettings,
          rollbackSettings,
        },
        client,
      ),
    ).resolves.toEqual({ status: 'applied', ruleset_id: 7001 })
    expect(calls).toEqual([
      'read:preflight',
      'read:checks',
      'create:disabled',
      'read:ruleset',
      'update:active',
      'read:ruleset',
      'patch:desired',
      'read:settings',
    ])
  })

  it('automatically disables the Ruleset and restores every repository setting on failure', async () => {
    const { client, calls } = createClient({ failDesiredPatch: true })

    await expect(
      applyGitHubMergeControls(
        {
          repository: 'Kazuya-Sakashita/Hana',
          appId,
          bootstrapHeadSha: headSha,
          expectedPreflight: preflight,
          activeTemplate,
          disabledTemplate,
          desiredSettings,
          rollbackSettings,
        },
        client,
      ),
    ).rejects.toThrow('apply_failed_rollback_complete')
    expect(calls.slice(-4)).toEqual([
      'update:disabled',
      'patch:rollback',
      'read:ruleset',
      'read:settings',
    ])
  })

  it('stops before mutation when the fresh preflight differs', async () => {
    const { client, calls } = createClient({ drift: true })

    await expect(
      applyGitHubMergeControls(
        {
          repository: 'Kazuya-Sakashita/Hana',
          appId,
          bootstrapHeadSha: headSha,
          expectedPreflight: preflight,
          activeTemplate,
          disabledTemplate,
          desiredSettings,
          rollbackSettings,
        },
        client,
      ),
    ).rejects.toThrow('preflight_drift')
    expect(calls).toEqual(['read:preflight'])
  })

  it('discovers and disables a created Ruleset when the create response is lost', async () => {
    const { client, calls } = createClient({ createResponseLost: true })

    await expect(
      applyGitHubMergeControls(
        {
          repository: 'Kazuya-Sakashita/Hana',
          appId,
          bootstrapHeadSha: headSha,
          expectedPreflight: preflight,
          activeTemplate,
          disabledTemplate,
          desiredSettings,
          rollbackSettings,
        },
        client,
      ),
    ).rejects.toThrow('apply_failed_rollback_complete')
    expect(calls.slice(-5)).toEqual([
      'find:ruleset',
      'update:disabled',
      'patch:rollback',
      'read:ruleset',
      'read:settings',
    ])
  })

  it('rejects an unconfirmed real mutation scope with JSON-only output', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath], {
      cwd: root,
      encoding: 'utf8',
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toMatchObject({
      issue_id: 'ISSUE-166',
      status: 'hold',
      reason: 'invalid_apply_scope',
      ruleset_id: null,
      evidence_policy: 'status-only',
    })
  })
})
