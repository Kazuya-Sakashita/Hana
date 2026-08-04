import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type GitHubAppSecurityPreflightClient = {
  readMainHead(repository: string): Promise<string>
  createCheckRun(
    repository: string,
    input: {
      name: 'app-security-preflight'
      headSha: string
      externalId: string
      status: 'in_progress'
      summary: string
    },
  ): Promise<{ id: number }>
  readApp(slug: string): Promise<{ id: number; permissions: Record<string, string> }>
  listInstallationRepositories(): Promise<string[]>
  updateCheckRun(
    repository: string,
    checkId: number,
    input: {
      name: 'app-security-preflight'
      status: 'completed'
      conclusion: 'success' | 'failure'
      summary: string
    },
  ): Promise<void>
}

export type GitHubAppSecurityPreflightInput = {
  repository: string
  appId: number
  appSlug: string
  trustedMainSha: string
  workflowRunId: number
}

const expectedPermissions = {
  checks: 'write',
  contents: 'read',
  metadata: 'read',
  pull_requests: 'read',
}

function canonical(value: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))),
  )
}

function validateInput(input: GitHubAppSecurityPreflightInput): void {
  if (input.repository !== 'Kazuya-Sakashita/Hana') throw new Error('invalid_repository')
  if (!Number.isSafeInteger(input.appId) || input.appId <= 0 || input.appId === 15368) {
    throw new Error('invalid_app_id')
  }
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(input.appSlug)) {
    throw new Error('invalid_app_slug')
  }
  if (!/^[0-9a-f]{40}$/.test(input.trustedMainSha)) throw new Error('invalid_main_sha')
  if (!Number.isSafeInteger(input.workflowRunId) || input.workflowRunId <= 0) {
    throw new Error('invalid_workflow_run_id')
  }
}

export async function runGitHubAppSecurityPreflight(
  input: GitHubAppSecurityPreflightInput,
  client: GitHubAppSecurityPreflightClient,
): Promise<{ status: 'success'; checkId: number }> {
  validateInput(input)
  const liveMainSha = await client.readMainHead(input.repository)
  if (liveMainSha !== input.trustedMainSha) throw new Error('stale_main_sha')

  const created = await client.createCheckRun(input.repository, {
    name: 'app-security-preflight',
    headSha: input.trustedMainSha,
    externalId: `loop-engineer-app-preflight-${input.workflowRunId}`,
    status: 'in_progress',
    summary: 'app_security_preflight_in_progress',
  })
  if (!Number.isSafeInteger(created.id) || created.id <= 0) throw new Error('invalid_check_id')

  try {
    const [app, repositories] = await Promise.all([
      client.readApp(input.appSlug),
      client.listInstallationRepositories(),
    ])
    if (app.id !== input.appId) throw new Error('dedicated_app_mismatch')
    if (canonical(app.permissions) !== canonical(expectedPermissions)) {
      throw new Error('excessive_app_permission')
    }
    if (repositories.length !== 1 || repositories[0] !== input.repository) {
      throw new Error('app_installation_scope_mismatch')
    }
    await client.updateCheckRun(input.repository, created.id, {
      name: 'app-security-preflight',
      status: 'completed',
      conclusion: 'success',
      summary: 'app_security_preflight_passed',
    })
  } catch (error) {
    await client.updateCheckRun(input.repository, created.id, {
      name: 'app-security-preflight',
      status: 'completed',
      conclusion: 'failure',
      summary: 'app_security_preflight_failed',
    })
    throw error
  }

  return { status: 'success', checkId: created.id }
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

function ghMutation<T>(method: 'POST' | 'PATCH', endpoint: string, input: unknown): T {
  return ghJson<T>(['--method', method, endpoint, '--input', '-'], input)
}

function createGitHubClient(): GitHubAppSecurityPreflightClient {
  return {
    async readMainHead(repository) {
      const response = ghJson<{ object?: { sha?: string } }>([
        `repos/${repository}/git/ref/heads/main`,
      ])
      const sha = response.object?.sha
      if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) {
        throw new Error('invalid_main_response')
      }
      return sha
    },
    async createCheckRun(repository, input) {
      const response = ghMutation<{ id?: number }>('POST', `repos/${repository}/check-runs`, {
        name: input.name,
        head_sha: input.headSha,
        external_id: input.externalId,
        status: input.status,
        output: {
          title: 'App security preflight',
          summary: input.summary,
        },
      })
      if (!Number.isSafeInteger(response.id) || Number(response.id) <= 0) {
        throw new Error('invalid_check_response')
      }
      return { id: Number(response.id) }
    },
    async readApp(slug) {
      const response = ghJson<{ id?: number; permissions?: Record<string, string> }>([
        `apps/${slug}`,
      ])
      if (!Number.isSafeInteger(response.id) || !response.permissions) {
        throw new Error('invalid_app_response')
      }
      return { id: Number(response.id), permissions: response.permissions }
    },
    async listInstallationRepositories() {
      const response = ghJson<{
        total_count?: number
        repositories?: Array<{ full_name?: string }>
      }>(['installation/repositories?per_page=100'])
      const repositories = response.repositories ?? []
      if (
        !Number.isSafeInteger(response.total_count) ||
        response.total_count !== repositories.length
      ) {
        throw new Error('app_repository_inventory_incomplete')
      }
      const names = repositories.map(({ full_name: fullName }) => String(fullName))
      if (names.some((name) => !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(name))) {
        throw new Error('invalid_repository_response')
      }
      return names
    },
    async updateCheckRun(repository, checkId, input) {
      ghMutation('PATCH', `repos/${repository}/check-runs/${checkId}`, {
        name: input.name,
        status: input.status,
        conclusion: input.conclusion,
        output: {
          title: 'App security preflight',
          summary: input.summary,
        },
      })
    },
  }
}

function requiredInteger(name: string): number {
  const value = process.env[name]
  if (!value || !/^[1-9][0-9]*$/.test(value)) throw new Error('invalid_runtime_input')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('invalid_runtime_input')
  return parsed
}

async function main(): Promise<void> {
  await runGitHubAppSecurityPreflight(
    {
      repository: process.env.GITHUB_REPOSITORY ?? '',
      appId: requiredInteger('APP_ID'),
      appSlug: process.env.APP_SLUG ?? '',
      trustedMainSha: process.env.TRUSTED_MAIN_SHA ?? '',
      workflowRunId: requiredInteger('WORKFLOW_RUN_ID'),
    },
    createGitHubClient(),
  )
  process.stdout.write('{"status":"success","reason":"app_security_preflight_passed"}\n')
}

const isDirectExecution =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  void main().catch((error: unknown) => {
    const reason =
      error instanceof Error && /^[a-z0-9_]+$/.test(error.message)
        ? error.message
        : 'app_security_preflight_failed'
    process.stdout.write(`${JSON.stringify({ status: 'failure', reason })}\n`)
    process.exitCode = 1
  })
}
