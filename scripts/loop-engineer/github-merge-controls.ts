export type RepositoryMergeSettings = {
  allow_auto_merge: boolean
  allow_squash_merge: boolean
  allow_merge_commit: boolean
  allow_rebase_merge: boolean
  squash_merge_commit_title: string
  squash_merge_commit_message: string
}

export type GitHubMergeControlsSnapshot = RepositoryMergeSettings & {
  schema_version: 'loop-engineer-github-controls-snapshot/v2'
  repository: string
  default_branch: string
  delete_branch_on_merge: boolean
  repository_rulesets: Array<{ id: number; name: string; enforcement: string }>
  main_branch_protected: boolean
}

type RequiredStatusCheck = {
  context: string
  integration_id: number
}

type RulesetRule = {
  type: string
  parameters?: Record<string, unknown> & {
    required_status_checks?: RequiredStatusCheck[]
  }
}

export type RulesetContract = {
  name: string
  target: string
  enforcement: 'active' | 'disabled'
  bypass_actors: unknown[]
  conditions: Record<string, unknown>
  rules: RulesetRule[]
}

export type TrustedCheckRun = {
  name: string
  app_id: number
  conclusion: 'success' | 'failure' | 'pending'
}

export type GitHubMergeControlsClient = {
  readPreflight(): Promise<GitHubMergeControlsSnapshot>
  readAutoMergeReservationCount(): Promise<number>
  readTrustedCheckRuns(headSha: string): Promise<TrustedCheckRun[]>
  findRulesetIdByName(name: string): Promise<number | null>
  createRuleset(contract: RulesetContract): Promise<number>
  updateRuleset(rulesetId: number, contract: RulesetContract): Promise<void>
  readRuleset(rulesetId: number): Promise<RulesetContract>
  patchRepositorySettings(settings: RepositoryMergeSettings): Promise<void>
  readRepositorySettings(): Promise<RepositoryMergeSettings>
}

type EnvironmentSecurityStatus = {
  name: string
  can_admins_bypass: boolean
  branch_policies: string[]
  required_reviewers: Array<{ login: string; type: 'User' | 'Team' }>
  prevent_self_review: boolean | null
  secret_names: string[]
}

export type GitHubAutomationSecurityConfiguration = {
  repository: string
  app_id: number
  app_security_preflight: {
    main_sha: string
    latest_workflow_run_id: number
    workflow_run: {
      id: number
      path: string
      event: string
      head_branch: string
      head_sha: string
      status: string
      conclusion: string | null
      updated_at: string
    }
    check_runs: Array<{
      id: number
      name: string
      app_id: number
      head_sha: string
      external_id: string
      status: string
      conclusion: string | null
      completed_at: string | null
    }>
  }
  repository_secret_names: string[]
  private_key_environment_names: string[]
  variables: Record<string, string>
  publisher_environment: EnvironmentSecurityStatus
  human_environment: EnvironmentSecurityStatus
}

type ApplyOptions = {
  repository: string
  appId: number
  bootstrapHeadSha: string
  expectedPreflight: GitHubMergeControlsSnapshot
  activeTemplate: unknown
  disabledTemplate: unknown
  desiredSettings: RepositoryMergeSettings
  rollbackSettings: RepositoryMergeSettings
}

const requiredCheckNames = [
  'pr-gate',
  'validate',
  'local-registry',
  'specialist-review-gate',
  'merge-eligibility',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!isRecord(value)) return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  )
}

function sameContract(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

export function validateGitHubAutomationSecurityConfiguration(
  configuration: GitHubAutomationSecurityConfiguration,
  observedAt = Date.now(),
): void {
  const privateKeyName = 'LOOP_ENGINEER_APP_PRIVATE_KEY'
  if (
    !Number.isSafeInteger(configuration.app_id) ||
    configuration.app_id <= 0 ||
    configuration.app_id === 15368 ||
    configuration.variables.LOOP_ENGINEER_APP_ID !== String(configuration.app_id)
  ) {
    throw new Error('dedicated_app_mismatch')
  }
  const preflight = configuration.app_security_preflight
  const workflow = preflight.workflow_run
  const check = preflight.check_runs[0]
  if (
    !/^[0-9a-f]{40}$/.test(preflight.main_sha) ||
    !Number.isSafeInteger(workflow.id) ||
    workflow.id <= 0 ||
    preflight.latest_workflow_run_id !== workflow.id ||
    workflow.path !== '.github/workflows/loop-engineer-app-security-preflight.yml' ||
    workflow.event !== 'workflow_dispatch' ||
    workflow.head_branch !== 'main' ||
    workflow.head_sha !== preflight.main_sha ||
    workflow.status !== 'completed' ||
    workflow.conclusion !== 'success' ||
    preflight.check_runs.length !== 1 ||
    check === undefined ||
    !Number.isSafeInteger(check.id) ||
    check.id <= 0 ||
    check.name !== 'app-security-preflight' ||
    check.app_id !== configuration.app_id ||
    check.head_sha !== preflight.main_sha ||
    check.external_id !== `loop-engineer-app-preflight-${workflow.id}` ||
    check.status !== 'completed' ||
    check.conclusion !== 'success'
  ) {
    throw new Error('app_security_preflight_mismatch')
  }
  const workflowUpdatedAt = Date.parse(workflow.updated_at)
  const checkCompletedAt = check.completed_at === null ? Number.NaN : Date.parse(check.completed_at)
  const maxAgeMs = 15 * 60 * 1000
  if (
    !Number.isFinite(observedAt) ||
    !Number.isFinite(workflowUpdatedAt) ||
    !Number.isFinite(checkCompletedAt) ||
    observedAt < workflowUpdatedAt ||
    observedAt < checkCompletedAt ||
    observedAt - workflowUpdatedAt > maxAgeMs ||
    observedAt - checkCompletedAt > maxAgeMs
  ) {
    throw new Error('stale_app_security_preflight')
  }
  if (configuration.repository_secret_names.includes(privateKeyName)) {
    throw new Error('repository_private_key_forbidden')
  }
  if (
    !sameStringArray(configuration.private_key_environment_names, [
      'hana-merge-human-approval',
      'hana-merge-publisher',
    ])
  ) {
    throw new Error('private_key_environment_scope_mismatch')
  }
  const dispatcher = configuration.variables.LOOP_ENGINEER_DISPATCHER_LOGIN
  const humanReviewer = configuration.variables.LOOP_ENGINEER_HUMAN_REVIEWER_LOGIN
  if (
    typeof dispatcher !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(dispatcher) ||
    typeof humanReviewer !== 'string' ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(humanReviewer)
  ) {
    throw new Error('automation_identity_mismatch')
  }

  for (const environment of [
    configuration.publisher_environment,
    configuration.human_environment,
  ]) {
    if (environment.can_admins_bypass) throw new Error('environment_admin_bypass_enabled')
    if (!sameStringArray(environment.branch_policies, ['main'])) {
      throw new Error('environment_branch_policy_mismatch')
    }
    if (!sameStringArray(environment.secret_names, [privateKeyName])) {
      throw new Error('environment_secret_mismatch')
    }
  }
  if (
    configuration.publisher_environment.name !== 'hana-merge-publisher' ||
    configuration.publisher_environment.required_reviewers.length !== 0 ||
    configuration.publisher_environment.prevent_self_review !== null
  ) {
    throw new Error('publisher_environment_mismatch')
  }
  const humanEnvironment = configuration.human_environment
  if (
    humanEnvironment.name !== 'hana-merge-human-approval' ||
    humanEnvironment.prevent_self_review !== false ||
    humanEnvironment.required_reviewers.length !== 1 ||
    humanEnvironment.required_reviewers[0]?.type !== 'User' ||
    humanEnvironment.required_reviewers[0]?.login !== humanReviewer
  ) {
    throw new Error('human_reviewer_mismatch')
  }
}

function sameStringArray(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  )
}

function cloneRuleset(value: unknown): RulesetContract {
  if (!isRecord(value) || !Array.isArray(value.rules)) throw new Error('invalid_ruleset_template')
  return structuredClone(value) as RulesetContract
}

export function materializeRuleset(template: unknown, appId: number): RulesetContract {
  if (!Number.isSafeInteger(appId) || appId <= 0) throw new Error('invalid_app_id')
  if (appId === 15368) throw new Error('dedicated_app_required')

  const ruleset = cloneRuleset(template)
  if (
    ruleset.name !== 'Hana main merge controls' ||
    ruleset.target !== 'branch' ||
    !['active', 'disabled'].includes(ruleset.enforcement) ||
    !Array.isArray(ruleset.bypass_actors) ||
    ruleset.bypass_actors.length !== 0
  ) {
    throw new Error('invalid_ruleset_template')
  }

  const checkRules = ruleset.rules.filter(({ type }) => type === 'required_status_checks')
  const checks = checkRules[0]?.parameters?.required_status_checks
  if (
    checkRules.length !== 1 ||
    !Array.isArray(checks) ||
    checks.length !== requiredCheckNames.length ||
    checks.some(
      (check, index) =>
        !isRecord(check) ||
        check.context !== requiredCheckNames[index] ||
        check.integration_id !== 0,
    )
  ) {
    throw new Error('invalid_ruleset_check_template')
  }

  checkRules[0]!.parameters!.required_status_checks = checks.map(({ context }) => ({
    context,
    integration_id: appId,
  }))
  return ruleset
}

function validateTrustedChecks(checks: TrustedCheckRun[], appId: number): void {
  const trusted = requiredCheckNames.map((name) =>
    checks.filter((check) => check.name === name && check.app_id === appId),
  )
  if (trusted.some((runs) => runs.length !== 1 || runs[0]?.conclusion !== 'success')) {
    throw new Error('trusted_check_bootstrap_incomplete')
  }
}

export async function applyGitHubMergeControls(
  options: ApplyOptions,
  client: GitHubMergeControlsClient,
): Promise<{ status: 'applied'; ruleset_id: number }> {
  if (
    options.repository !== options.expectedPreflight.repository ||
    !/^[0-9a-f]{40}$/.test(options.bootstrapHeadSha)
  ) {
    throw new Error('invalid_apply_scope')
  }

  const livePreflight = await client.readPreflight()
  if (!sameContract(livePreflight, options.expectedPreflight)) throw new Error('preflight_drift')
  if ((await client.readAutoMergeReservationCount()) !== 0) {
    throw new Error('auto_merge_reservations_present')
  }

  const trustedChecks = await client.readTrustedCheckRuns(options.bootstrapHeadSha)
  validateTrustedChecks(trustedChecks, options.appId)

  const activeRuleset = materializeRuleset(options.activeTemplate, options.appId)
  const disabledRuleset = materializeRuleset(options.disabledTemplate, options.appId)
  if (activeRuleset.enforcement !== 'active' || disabledRuleset.enforcement !== 'disabled') {
    throw new Error('invalid_ruleset_enforcement')
  }

  let rulesetId: number | null = null
  try {
    const createdRulesetId = await client.createRuleset(disabledRuleset)
    if (!Number.isSafeInteger(createdRulesetId) || createdRulesetId <= 0) {
      throw new Error('invalid_ruleset_id')
    }
    rulesetId = createdRulesetId
    if (!sameContract(await client.readRuleset(rulesetId), disabledRuleset)) {
      throw new Error('disabled_ruleset_readback_mismatch')
    }

    await client.updateRuleset(rulesetId, activeRuleset)
    if (!sameContract(await client.readRuleset(rulesetId), activeRuleset)) {
      throw new Error('active_ruleset_readback_mismatch')
    }

    await client.patchRepositorySettings(options.desiredSettings)
    if (!sameContract(await client.readRepositorySettings(), options.desiredSettings)) {
      throw new Error('repository_settings_readback_mismatch')
    }
    if ((await client.readAutoMergeReservationCount()) !== 0) {
      throw new Error('postflight_auto_merge_reservations_present')
    }

    return { status: 'applied', ruleset_id: rulesetId }
  } catch {
    if (rulesetId === null) {
      try {
        rulesetId = await client.findRulesetIdByName(disabledRuleset.name)
      } catch {
        throw new Error('apply_failed_mutation_state_unknown')
      }
      if (rulesetId === null) throw new Error('apply_failed_before_mutation')
    }
    try {
      await client.updateRuleset(rulesetId, disabledRuleset)
      await client.patchRepositorySettings(options.rollbackSettings)
      const rolledBackRuleset = await client.readRuleset(rulesetId)
      const rolledBackSettings = await client.readRepositorySettings()
      const rolledBackAutoMergeReservations = await client.readAutoMergeReservationCount()
      if (
        !sameContract(rolledBackRuleset, disabledRuleset) ||
        !sameContract(rolledBackSettings, options.rollbackSettings) ||
        rolledBackAutoMergeReservations !== 0
      ) {
        throw new Error('rollback_readback_mismatch')
      }
    } catch {
      throw new Error('apply_failed_rollback_failed')
    }
    throw new Error('apply_failed_rollback_complete')
  }
}
