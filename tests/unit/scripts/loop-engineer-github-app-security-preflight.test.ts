import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  runGitHubAppSecurityPreflight,
  type GitHubAppSecurityPreflightClient,
} from '../../../scripts/loop-engineer/github-app-security-preflight'

const repository = 'Kazuya-Sakashita/Hana'
const mainSha = 'a'.repeat(40)
const appId = 424242
const root = fileURLToPath(new URL('../../..', import.meta.url))
const cliPath = `${root}/scripts/loop-engineer/github-app-security-preflight.ts`

function createClient(
  options: {
    appId?: number
    permissions?: Record<string, string>
    repositories?: string[]
    failSuccessUpdate?: boolean
  } = {},
) {
  const calls: string[] = []
  const client: GitHubAppSecurityPreflightClient = {
    async readMainHead() {
      calls.push('read:main')
      return mainSha
    },
    async createCheckRun(_repository, input) {
      calls.push(`create:${input.name}:${input.status}`)
      return { id: 501 }
    },
    async readApp(_slug) {
      calls.push('read:app')
      return {
        id: options.appId ?? appId,
        permissions:
          options.permissions ??
          ({
            checks: 'write',
            contents: 'read',
            metadata: 'read',
            pull_requests: 'read',
          } as const),
      }
    },
    async listInstallationRepositories() {
      calls.push('list:repositories')
      return options.repositories ?? [repository]
    },
    async updateCheckRun(_repository, id, input) {
      calls.push(`update:${id}:${input.conclusion}`)
      if (options.failSuccessUpdate && input.conclusion === 'success') {
        throw new Error('github_api_failed')
      }
    },
  }
  return { client, calls }
}

describe('ISSUE-168 GitHub App security preflight', () => {
  it('invalidates prior success before checking exact App permissions and repository scope', async () => {
    const { client, calls } = createClient()

    await expect(
      runGitHubAppSecurityPreflight(
        {
          repository,
          appId,
          appSlug: 'hana-merge-controller',
          trustedMainSha: mainSha,
          workflowRunId: 9001,
        },
        client,
      ),
    ).resolves.toEqual({ status: 'success', checkId: 501 })
    expect(calls).toEqual([
      'read:main',
      'create:app-security-preflight:in_progress',
      'read:app',
      'list:repositories',
      'update:501:success',
    ])
  })

  it.each([
    [
      'an App with an extra permission',
      {
        permissions: {
          checks: 'write',
          contents: 'read',
          metadata: 'read',
          pull_requests: 'read',
          administration: 'write',
        },
      },
      'excessive_app_permission',
    ],
    [
      'an installation with another repository',
      { repositories: [repository, 'example/other'] },
      'app_installation_scope_mismatch',
    ],
  ])('publishes failure for %s', async (_name, options, reason) => {
    const { client, calls } = createClient(options)

    await expect(
      runGitHubAppSecurityPreflight(
        {
          repository,
          appId,
          appSlug: 'hana-merge-controller',
          trustedMainSha: mainSha,
          workflowRunId: 9001,
        },
        client,
      ),
    ).rejects.toThrow(reason)
    expect(calls.at(-1)).toBe('update:501:failure')
    expect(calls).not.toContain('update:501:success')
  })

  it('does not leave a successful Check Run after a partial publication failure', async () => {
    const { client, calls } = createClient({ failSuccessUpdate: true })

    await expect(
      runGitHubAppSecurityPreflight(
        {
          repository,
          appId,
          appSlug: 'hana-merge-controller',
          trustedMainSha: mainSha,
          workflowRunId: 9001,
        },
        client,
      ),
    ).rejects.toThrow('github_api_failed')
    expect(calls.slice(-2)).toEqual(['update:501:success', 'update:501:failure'])
  })

  it('prints only a fixed status and reason for invalid runtime input', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        GITHUB_REPOSITORY: '',
        APP_ID: '',
        APP_SLUG: '',
        TRUSTED_MAIN_SHA: '',
        WORKFLOW_RUN_ID: '',
      },
    })

    expect(result.status).toBe(1)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual({
      status: 'failure',
      reason: 'invalid_runtime_input',
    })
  })
})
