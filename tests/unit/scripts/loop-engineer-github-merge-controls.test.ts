import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  applyGitHubMergeControls,
  materializeRuleset,
  validateGitHubAutomationSecurityConfiguration,
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
  options: {
    failDesiredPatch?: boolean
    drift?: boolean
    createResponseLost?: boolean
    invalidCreateId?: boolean
    postflightReservations?: number
  } = {},
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
    async readAutoMergeReservationCount() {
      const count = calls.includes('patch:desired') ? (options.postflightReservations ?? 0) : 0
      calls.push(`read:auto-merge:${count}`)
      return count
    },
    async findRulesetIdByName(name) {
      calls.push('find:ruleset')
      return ruleset?.name === name ? 7001 : null
    },
    async createRuleset(contract) {
      calls.push(`create:${contract.enforcement}`)
      ruleset = structuredClone(contract)
      if (options.createResponseLost) throw new Error('response_lost')
      if (options.invalidCreateId) return Number.NaN
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
      'read:auto-merge:0',
      'read:checks',
      'create:disabled',
      'read:ruleset',
      'update:active',
      'read:ruleset',
      'patch:desired',
      'read:settings',
      'read:auto-merge:0',
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
    expect(calls.slice(-5)).toEqual([
      'update:disabled',
      'patch:rollback',
      'read:ruleset',
      'read:settings',
      'read:auto-merge:0',
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
    expect(calls.slice(-6)).toEqual([
      'find:ruleset',
      'update:disabled',
      'patch:rollback',
      'read:ruleset',
      'read:settings',
      'read:auto-merge:0',
    ])
  })

  it('recovers by name when create succeeds but returns an invalid ID', async () => {
    const { client, calls } = createClient({ invalidCreateId: true })

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
    expect(calls).toContain('find:ruleset')
    expect(calls).toContain('update:disabled')
  })

  it('rolls back when postflight finds an auto-merge reservation', async () => {
    const { client, calls } = createClient({ postflightReservations: 1 })

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
    ).rejects.toThrow('apply_failed_rollback_failed')
    expect(calls).toContain('patch:rollback')
  })

  it('accepts only fresh App security preflight evidence bound to main, workflow run, and App', () => {
    const observedAt = Date.parse('2026-08-04T10:00:00.000Z')
    const valid = {
      repository: 'Kazuya-Sakashita/Hana',
      app_id: appId,
      app_security_preflight: {
        main_sha: headSha,
        latest_workflow_run_id: 9001,
        workflow_run: {
          id: 9001,
          path: '.github/workflows/loop-engineer-app-security-preflight.yml',
          event: 'workflow_dispatch',
          head_branch: 'main',
          head_sha: headSha,
          status: 'completed',
          conclusion: 'success',
          updated_at: '2026-08-04T09:55:00.000Z',
        },
        check_runs: [
          {
            id: 501,
            name: 'app-security-preflight',
            app_id: appId,
            head_sha: headSha,
            external_id: 'loop-engineer-app-preflight-9001',
            status: 'completed',
            conclusion: 'success',
            completed_at: '2026-08-04T09:54:00.000Z',
          },
        ],
      },
      repository_secret_names: [],
      private_key_environment_names: ['hana-merge-human-approval', 'hana-merge-publisher'],
      variables: {
        LOOP_ENGINEER_APP_ID: String(appId),
        LOOP_ENGINEER_DISPATCHER_LOGIN: 'Kazuya-Sakashita',
        LOOP_ENGINEER_HUMAN_REVIEWER_LOGIN: 'Kazuya-Sakashita',
      },
      publisher_environment: {
        name: 'hana-merge-publisher',
        can_admins_bypass: false,
        branch_policies: ['main'],
        required_reviewers: [],
        prevent_self_review: null,
        secret_names: ['LOOP_ENGINEER_APP_PRIVATE_KEY'],
      },
      human_environment: {
        name: 'hana-merge-human-approval',
        can_admins_bypass: false,
        branch_policies: ['main'],
        required_reviewers: [{ login: 'Kazuya-Sakashita', type: 'User' as const }],
        prevent_self_review: false,
        secret_names: ['LOOP_ENGINEER_APP_PRIVATE_KEY'],
      },
    }

    expect(() => validateGitHubAutomationSecurityConfiguration(valid, observedAt)).not.toThrow()
    const withCheck = (
      check: Partial<(typeof valid.app_security_preflight.check_runs)[number]>,
    ) => ({
      ...valid,
      app_security_preflight: {
        ...valid.app_security_preflight,
        check_runs: [{ ...valid.app_security_preflight.check_runs[0]!, ...check }],
      },
    })

    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          app_security_preflight: {
            ...valid.app_security_preflight,
            latest_workflow_run_id: 9002,
          },
        },
        observedAt,
      ),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          app_security_preflight: {
            ...valid.app_security_preflight,
            workflow_run: {
              ...valid.app_security_preflight.workflow_run,
              updated_at: '2026-08-04T09:30:00.000Z',
            },
          },
        },
        observedAt,
      ),
    ).toThrow('stale_app_security_preflight')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(withCheck({ app_id: appId + 1 }), observedAt),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        withCheck({ head_sha: 'c'.repeat(40) }),
        observedAt,
      ),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        withCheck({ conclusion: 'failure' }),
        observedAt,
      ),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        withCheck({ external_id: 'loop-engineer-app-preflight-9000' }),
        observedAt,
      ),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          app_security_preflight: {
            ...valid.app_security_preflight,
            check_runs: [
              ...valid.app_security_preflight.check_runs,
              { ...valid.app_security_preflight.check_runs[0]!, id: 502 },
            ],
          },
        },
        observedAt,
      ),
    ).toThrow('app_security_preflight_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          human_environment: { ...valid.human_environment, can_admins_bypass: true },
        },
        observedAt,
      ),
    ).toThrow('environment_admin_bypass_enabled')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          human_environment: { ...valid.human_environment, required_reviewers: [] },
        },
        observedAt,
      ),
    ).toThrow('human_reviewer_mismatch')
    expect(() =>
      validateGitHubAutomationSecurityConfiguration(
        {
          ...valid,
          private_key_environment_names: [...valid.private_key_environment_names, 'production'],
        },
        observedAt,
      ),
    ).toThrow('private_key_environment_scope_mismatch')
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
