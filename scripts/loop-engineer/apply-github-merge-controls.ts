import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import {
  applyGitHubMergeControls,
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

function createClient(repository: string): GitHubMergeControlsClient {
  return {
    async readPreflight() {
      const repo = ghJson<Record<string, unknown>>([`repos/${repository}`])
      const rulesets = ghJson<Array<Record<string, unknown>>>([
        `repos/${repository}/rulesets`,
        '--paginate',
      ])
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
      const response = ghJson<{ check_runs: Array<Record<string, unknown>> }>([
        `repos/${repository}/commits/${headSha}/check-runs?filter=latest&per_page=100`,
      ])
      const names = new Set([
        'pr-gate',
        'validate',
        'local-registry',
        'specialist-review-gate',
        'merge-eligibility',
      ])
      return response.check_runs
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
    async findRulesetIdByName(name) {
      const rulesets = ghJson<Array<Record<string, unknown>>>([
        `repos/${repository}/rulesets?per_page=100`,
      ])
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

function verifyConfigurationNames(repository: string, appId: number): void {
  const variables = ghJson<{ variables: Array<{ name: string; value: string }> }>([
    `repos/${repository}/actions/variables?per_page=100`,
  ])
  const secrets = ghJson<{ secrets: Array<{ name: string }> }>([
    `repos/${repository}/actions/secrets?per_page=100`,
  ])
  const environment = ghJson<{ protection_rules?: Array<Record<string, unknown>> }>([
    `repos/${repository}/environments/hana-merge-human-approval`,
  ])
  const configuredAppId = variables.variables.find(({ name }) => name === 'LOOP_ENGINEER_APP_ID')
  const dispatcher = variables.variables.find(
    ({ name }) => name === 'LOOP_ENGINEER_DISPATCHER_LOGIN',
  )
  const privateKey = secrets.secrets.some(({ name }) => name === 'LOOP_ENGINEER_APP_PRIVATE_KEY')
  const requiredReviewers = environment.protection_rules?.find(
    ({ type }) => type === 'required_reviewers',
  )?.reviewers
  if (
    Number(configuredAppId?.value) !== appId ||
    !dispatcher?.value ||
    !privateKey ||
    !Array.isArray(requiredReviewers) ||
    requiredReviewers.length === 0
  ) {
    throw new Error('github_app_or_environment_incomplete')
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
  const bootstrapHeadSha = argValue(args, 'bootstrap-head-sha')
  if (
    args.length !== 5 ||
    repository !== 'Kazuya-Sakashita/Hana' ||
    confirmation !== repository ||
    approval !== 'ISSUE-166' ||
    !Number.isSafeInteger(appId) ||
    appId <= 0 ||
    bootstrapHeadSha === null ||
    !/^[0-9a-f]{40}$/.test(bootstrapHeadSha)
  ) {
    writeStatus('hold', 'invalid_apply_scope')
    process.exitCode = 1
    return
  }

  verifyConfigurationNames(repository, appId)
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
