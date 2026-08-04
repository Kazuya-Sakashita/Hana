import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  applyGitHubMergeControls,
  validateGitHubAutomationSecurityConfiguration,
  type GitHubAutomationSecurityConfiguration,
  type GitHubMergeControlsClient,
  type GitHubMergeControlsSnapshot,
  type RepositoryMergeSettings,
  type RulesetContract,
} from './github-merge-controls'

const root = fileURLToPath(new URL('../..', import.meta.url))
const controlsDirectory = `${root}/docs/api-driven-development/loop-engineer-github-merge-controls`

function writeStatus(status: string, reason: string, rulesetId: number | null = null): void {
  process.stdout.write(
    `${JSON.stringify({
      schema_version: 'loop-engineer-github-controls-apply/v1',
      issue_id: 'ISSUE-166',
      status,
      reason,
      ruleset_id: rulesetId,
      evidence_policy: 'status-only',
    })}\n`,
  )
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function ghJson<T>(args: string[], input?: unknown): T {
  const output = execFileSync('gh', ['api', ...args], {
    cwd: root,
    encoding: 'utf8',
    input: input === undefined ? undefined : JSON.stringify(input),
    stdio: ['pipe', 'pipe', 'pipe'],
    maxBuffer: 2 * 1024 * 1024,
  })
  return JSON.parse(output) as T
}

function ghMutation<T>(method: 'POST' | 'PUT' | 'PATCH', endpoint: string, input: unknown): T {
  return ghJson<T>(['--method', method, endpoint, '--input', '-'], input)
}

function requireCompleteInventory<T>(
  totalCount: number | undefined,
  items: T[],
  reason: string,
): T[] {
  if (!Number.isSafeInteger(totalCount) || totalCount !== items.length) throw new Error(reason)
  return items
}

function readAllRulesets(repository: string): Array<Record<string, unknown>> {
  return ghJson<Array<Array<Record<string, unknown>>>>([
    `repos/${repository}/rulesets?per_page=100`,
    '--paginate',
    '--slurp',
  ]).flat()
}

function normalizeSettings(raw: Record<string, unknown>): RepositoryMergeSettings {
  return {
    allow_auto_merge: raw.allow_auto_merge === true,
    allow_squash_merge: raw.allow_squash_merge === true,
    allow_merge_commit: raw.allow_merge_commit === true,
    allow_rebase_merge: raw.allow_rebase_merge === true,
    squash_merge_commit_title: String(raw.squash_merge_commit_title),
    squash_merge_commit_message: String(raw.squash_merge_commit_message),
  }
}

function normalizeRuleset(raw: Record<string, unknown>): RulesetContract {
  if (raw.enforcement !== 'active' && raw.enforcement !== 'disabled') {
    throw new Error('invalid_ruleset_response')
  }
  const rules = Array.isArray(raw.rules)
    ? raw.rules.map((rule) => {
        if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
          throw new Error('invalid_ruleset_response')
        }
        const value = rule as Record<string, unknown>
        const type = String(value.type)
        if (type === 'deletion' || type === 'non_fast_forward') return { type }
        if (typeof value.parameters !== 'object' || value.parameters === null) {
          throw new Error('invalid_ruleset_response')
        }
        const parameters = value.parameters as Record<string, unknown>
        if (type === 'pull_request') {
          return {
            type,
            parameters: {
              dismiss_stale_reviews_on_push: parameters.dismiss_stale_reviews_on_push,
              require_code_owner_review: parameters.require_code_owner_review,
              require_last_push_approval: parameters.require_last_push_approval,
              required_approving_review_count: parameters.required_approving_review_count,
              required_review_thread_resolution: parameters.required_review_thread_resolution,
              allowed_merge_methods: parameters.allowed_merge_methods,
            },
          }
        }
        if (type === 'required_status_checks') {
          if (!Array.isArray(parameters.required_status_checks)) {
            throw new Error('invalid_ruleset_response')
          }
          const requiredStatusChecks = parameters.required_status_checks.map((check) => {
            if (typeof check !== 'object' || check === null || Array.isArray(check)) {
              throw new Error('invalid_ruleset_response')
            }
            const value = check as Record<string, unknown>
            return { context: String(value.context), integration_id: Number(value.integration_id) }
          })
          return {
            type,
            parameters: {
              strict_required_status_checks_policy: parameters.strict_required_status_checks_policy,
              do_not_enforce_on_create: parameters.do_not_enforce_on_create,
              required_status_checks: requiredStatusChecks,
            },
          }
        }
        throw new Error('unexpected_ruleset_rule')
      })
    : []
  return {
    name: String(raw.name),
    target: String(raw.target),
    enforcement: raw.enforcement,
    bypass_actors: Array.isArray(raw.bypass_actors) ? raw.bypass_actors : [],
    conditions: {
      ref_name: (raw.conditions as { ref_name?: unknown } | undefined)?.ref_name,
    },
    rules,
  }
}

function branchIsProtected(repository: string): boolean {
  const result = spawnSync('gh', ['api', `repos/${repository}/branches/main/protection`], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status === 0) return true
  if (result.stderr.includes('HTTP 404')) return false
  throw new Error('branch_protection_read_failed')
}

function readAutoMergeReservationCount(repository: string): number {
  const [owner, name] = repository.split('/')
  const query = `query { repository(owner: "${owner}", name: "${name}") { pullRequests(first: 100, states: OPEN) { nodes { autoMergeRequest { enabledAt } } pageInfo { hasNextPage } } } }`
  const response = ghJson<{
    data?: {
      repository?: {
        pullRequests?: {
          nodes?: Array<{ autoMergeRequest?: unknown }>
          pageInfo?: { hasNextPage?: boolean }
        }
      }
    }
  }>(['graphql', '-f', `query=${query}`])
  const pullRequests = response.data?.repository?.pullRequests
  if (!pullRequests?.nodes || pullRequests.pageInfo?.hasNextPage) {
    throw new Error('auto_merge_reservation_read_incomplete')
  }
  return pullRequests.nodes.filter(({ autoMergeRequest }) => autoMergeRequest != null).length
}

function createClient(repository: string): GitHubMergeControlsClient {
  return {
    async readPreflight() {
      const repo = ghJson<Record<string, unknown>>([`repos/${repository}`])
      const rulesets = readAllRulesets(repository)
      return {
        schema_version: 'loop-engineer-github-controls-snapshot/v2',
        repository,
        default_branch: String(repo.default_branch),
        ...normalizeSettings(repo),
        delete_branch_on_merge: repo.delete_branch_on_merge === true,
        repository_rulesets: rulesets.map((ruleset) => ({
          id: Number(ruleset.id),
          name: String(ruleset.name),
          enforcement: String(ruleset.enforcement),
        })),
        main_branch_protected: branchIsProtected(repository),
      }
    },
    async readTrustedCheckRuns(headSha) {
      const responses = ghJson<Array<{ check_runs?: Array<Record<string, unknown>> }>>([
        `repos/${repository}/commits/${headSha}/check-runs?filter=latest&per_page=100`,
        '--paginate',
        '--slurp',
      ])
      const checkRuns = responses.flatMap(({ check_runs: page }) => page ?? [])
      const names = new Set([
        'pr-gate',
        'validate',
        'local-registry',
        'specialist-review-gate',
        'merge-eligibility',
      ])
      return checkRuns
        .filter(({ name }) => typeof name === 'string' && names.has(name))
        .map((run) => {
          const app = run?.app
          return {
            name: String(run.name),
            app_id:
              typeof app === 'object' && app !== null && !Array.isArray(app)
                ? Number((app as Record<string, unknown>).id)
                : 0,
            conclusion:
              run?.conclusion === 'success'
                ? 'success'
                : run?.conclusion === null
                  ? 'pending'
                  : 'failure',
          }
        })
    },
    async readAutoMergeReservationCount() {
      return readAutoMergeReservationCount(repository)
    },
    async findRulesetIdByName(name) {
      const rulesets = readAllRulesets(repository)
      const matches = rulesets.filter((ruleset) => ruleset.name === name)
      if (matches.length > 1) throw new Error('duplicate_ruleset_name')
      return matches.length === 1 ? Number(matches[0]!.id) : null
    },
    async createRuleset(contract) {
      const response = ghMutation<Record<string, unknown>>(
        'POST',
        `repos/${repository}/rulesets`,
        contract,
      )
      return Number(response.id)
    },
    async updateRuleset(rulesetId, contract) {
      ghMutation('PUT', `repos/${repository}/rulesets/${rulesetId}`, contract)
    },
    async readRuleset(rulesetId) {
      return normalizeRuleset(
        ghJson<Record<string, unknown>>([`repos/${repository}/rulesets/${rulesetId}`]),
      )
    },
    async patchRepositorySettings(settings) {
      ghMutation('PATCH', `repos/${repository}`, settings)
    },
    async readRepositorySettings() {
      return normalizeSettings(ghJson<Record<string, unknown>>([`repos/${repository}`]))
    },
  }
}

function readEnvironmentSecurityStatus(repository: string, name: string) {
  const environment = ghJson<{
    can_admins_bypass?: boolean
    deployment_branch_policy?: { custom_branch_policies?: boolean }
    protection_rules?: Array<Record<string, unknown>>
  }>([`repos/${repository}/environments/${name}`])
  let branchPolicies: string[] = []
  if (environment.deployment_branch_policy?.custom_branch_policies) {
    const response = ghJson<{
      total_count?: number
      branch_policies?: Array<{ name?: string }>
    }>([`repos/${repository}/environments/${name}/deployment-branch-policies?per_page=100`])
    branchPolicies = requireCompleteInventory(
      response.total_count,
      (response.branch_policies ?? []).map(({ name: branchName }) => String(branchName)),
      'environment_branch_policy_inventory_incomplete',
    )
  }
  const environmentSecrets = ghJson<{
    total_count?: number
    secrets?: Array<{ name?: string }>
  }>([`repos/${repository}/environments/${name}/secrets?per_page=100`])
  const reviewerRule = environment.protection_rules?.find(
    ({ type }) => type === 'required_reviewers',
  )
  if (reviewerRule !== undefined && typeof reviewerRule.prevent_self_review !== 'boolean') {
    throw new Error('invalid_environment_self_review_policy')
  }
  const rawReviewers = Array.isArray(reviewerRule?.reviewers) ? reviewerRule.reviewers : []
  const requiredReviewers = rawReviewers.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error('invalid_environment_reviewer')
    }
    const value = entry as Record<string, unknown>
    const reviewer = value.reviewer
    if (typeof reviewer !== 'object' || reviewer === null || Array.isArray(reviewer)) {
      throw new Error('invalid_environment_reviewer')
    }
    return {
      login: String((reviewer as Record<string, unknown>).login),
      type: value.type === 'User' ? ('User' as const) : ('Team' as const),
    }
  })
  return {
    name,
    can_admins_bypass: environment.can_admins_bypass !== false,
    branch_policies: branchPolicies,
    required_reviewers: requiredReviewers,
    prevent_self_review:
      reviewerRule === undefined ? null : (reviewerRule.prevent_self_review as boolean),
    secret_names: requireCompleteInventory(
      environmentSecrets.total_count,
      (environmentSecrets.secrets ?? []).map(({ name: secretName }) => String(secretName)),
      'environment_secret_inventory_incomplete',
    ),
  }
}

function readPrivateKeyEnvironmentNames(repository: string): string[] {
  const response = ghJson<{
    total_count?: number
    environments?: Array<{ name?: string }>
  }>([`repos/${repository}/environments?per_page=100`])
  const environments = response.environments ?? []
  if (response.total_count !== environments.length) {
    throw new Error('environment_inventory_incomplete')
  }
  return environments
    .map(({ name }) => String(name))
    .filter((name) => {
      const environmentSecrets = ghJson<{
        total_count?: number
        secrets?: Array<{ name?: string }>
      }>([`repos/${repository}/environments/${encodeURIComponent(name)}/secrets?per_page=100`])
      const secrets = environmentSecrets.secrets ?? []
      if (environmentSecrets.total_count !== secrets.length) {
        throw new Error('environment_secret_inventory_incomplete')
      }
      return secrets.some(({ name: secretName }) => secretName === 'LOOP_ENGINEER_APP_PRIVATE_KEY')
    })
}

function readAutomationSecurityConfiguration(
  repository: string,
  appId: number,
  preflightRunId: number,
): GitHubAutomationSecurityConfiguration {
  const variables = ghJson<{
    total_count?: number
    variables?: Array<{ name: string; value: string }>
  }>([`repos/${repository}/actions/variables?per_page=100`])
  const repositorySecrets = ghJson<{
    total_count?: number
    secrets?: Array<{ name: string }>
  }>([`repos/${repository}/actions/secrets?per_page=100`])
  const mainRef = ghJson<{ object?: { sha?: string } }>([`repos/${repository}/git/ref/heads/main`])
  const latestWorkflowRuns = ghJson<{
    total_count?: number
    workflow_runs?: Array<{ id?: number }>
  }>([
    `repos/${repository}/actions/workflows/loop-engineer-app-security-preflight.yml/runs?branch=main&event=workflow_dispatch&per_page=1`,
  ])
  if (
    !Number.isSafeInteger(latestWorkflowRuns.total_count) ||
    Number(latestWorkflowRuns.total_count) < 1 ||
    latestWorkflowRuns.workflow_runs?.length !== 1
  ) {
    throw new Error('app_security_preflight_run_inventory_incomplete')
  }
  const workflowRun = ghJson<{
    id?: number
    path?: string
    event?: string
    head_branch?: string
    head_sha?: string
    status?: string
    conclusion?: string | null
    updated_at?: string
  }>([`repos/${repository}/actions/runs/${preflightRunId}`])
  const checkRunResponse = ghJson<{
    total_count?: number
    check_runs?: Array<Record<string, unknown>>
  }>([
    `repos/${repository}/commits/${String(mainRef.object?.sha)}/check-runs?filter=latest&check_name=app-security-preflight&app_id=${appId}&per_page=100`,
  ])
  const checkRuns = requireCompleteInventory(
    checkRunResponse.total_count,
    checkRunResponse.check_runs ?? [],
    'app_security_preflight_inventory_incomplete',
  )
  const allVariables = requireCompleteInventory(
    variables.total_count,
    variables.variables ?? [],
    'repository_variable_inventory_incomplete',
  )
  const allRepositorySecrets = requireCompleteInventory(
    repositorySecrets.total_count,
    repositorySecrets.secrets ?? [],
    'repository_secret_inventory_incomplete',
  )
  return {
    repository,
    app_id: appId,
    app_security_preflight: {
      main_sha: String(mainRef.object?.sha),
      latest_workflow_run_id: Number(latestWorkflowRuns.workflow_runs[0]?.id),
      workflow_run: {
        id: Number(workflowRun.id),
        path: String(workflowRun.path),
        event: String(workflowRun.event),
        head_branch: String(workflowRun.head_branch),
        head_sha: String(workflowRun.head_sha),
        status: String(workflowRun.status),
        conclusion: workflowRun.conclusion ?? null,
        updated_at: String(workflowRun.updated_at),
      },
      check_runs: checkRuns.map((run) => {
        const app = run.app
        return {
          id: Number(run.id),
          name: String(run.name),
          app_id:
            typeof app === 'object' && app !== null && !Array.isArray(app)
              ? Number((app as Record<string, unknown>).id)
              : 0,
          head_sha: String(run.head_sha),
          external_id: String(run.external_id),
          status: String(run.status),
          conclusion: typeof run.conclusion === 'string' ? run.conclusion : null,
          completed_at: typeof run.completed_at === 'string' ? run.completed_at : null,
        }
      }),
    },
    repository_secret_names: allRepositorySecrets.map(({ name }) => name),
    private_key_environment_names: readPrivateKeyEnvironmentNames(repository),
    variables: Object.fromEntries(allVariables.map(({ name, value }) => [name, value])),
    publisher_environment: readEnvironmentSecurityStatus(repository, 'hana-merge-publisher'),
    human_environment: readEnvironmentSecurityStatus(repository, 'hana-merge-human-approval'),
  }
}

function argValue(args: string[], name: string): string | null {
  const prefix = `--${name}=`
  return args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ?? null
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const repository = argValue(args, 'repository')
  const confirmation = argValue(args, 'confirm-repository')
  const approval = argValue(args, 'human-approval')
  const appId = Number(argValue(args, 'app-id'))
  const appPreflightRunId = Number(argValue(args, 'app-preflight-run-id'))
  const bootstrapHeadSha = argValue(args, 'bootstrap-head-sha')
  if (
    args.length !== 6 ||
    repository !== 'Kazuya-Sakashita/Hana' ||
    confirmation !== repository ||
    approval !== 'ISSUE-166' ||
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    !Number.isSafeInteger(appPreflightRunId) ||
    appPreflightRunId <= 0 ||
    bootstrapHeadSha === null ||
    !/^[0-9a-f]{40}$/.test(bootstrapHeadSha)
  ) {
    writeStatus('hold', 'invalid_apply_scope')
    process.exitCode = 1
    return
  }

  validateGitHubAutomationSecurityConfiguration(
    readAutomationSecurityConfiguration(repository, appId, appPreflightRunId),
  )
  const result = await applyGitHubMergeControls(
    {
      repository,
      appId,
      bootstrapHeadSha,
      expectedPreflight: readJson<GitHubMergeControlsSnapshot>(
        `${controlsDirectory}/preflight.json`,
      ),
      activeTemplate: readJson(`${controlsDirectory}/main-ruleset.template.json`),
      disabledTemplate: readJson(`${controlsDirectory}/main-ruleset-disabled.template.json`),
      desiredSettings: readJson(`${controlsDirectory}/repository-settings.json`),
      rollbackSettings: readJson(`${controlsDirectory}/repository-settings-rollback.json`),
    },
    createClient(repository),
  )
  writeStatus(result.status, 'all_postflight_checks_passed', result.ruleset_id)
}

void main().catch((error: unknown) => {
  const reason =
    error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : 'unknown'
  writeStatus('hold', reason)
  process.exitCode = 1
})
