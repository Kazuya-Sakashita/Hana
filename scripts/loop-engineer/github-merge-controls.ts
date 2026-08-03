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
  readTrustedCheckRuns(headSha: string): Promise<TrustedCheckRun[]>
  findRulesetIdByName(name: string): Promise<number | null>
  createRuleset(contract: RulesetContract): Promise<number>
  updateRuleset(rulesetId: number, contract: RulesetContract): Promise<void>
  readRuleset(rulesetId: number): Promise<RulesetContract>
  patchRepositorySettings(settings: RepositoryMergeSettings): Promise<void>
  readRepositorySettings(): Promise<RepositoryMergeSettings>
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

  const trustedChecks = await client.readTrustedCheckRuns(options.bootstrapHeadSha)
  validateTrustedChecks(trustedChecks, options.appId)

  const activeRuleset = materializeRuleset(options.activeTemplate, options.appId)
  const disabledRuleset = materializeRuleset(options.disabledTemplate, options.appId)
  if (activeRuleset.enforcement !== 'active' || disabledRuleset.enforcement !== 'disabled') {
    throw new Error('invalid_ruleset_enforcement')
  }

  let rulesetId: number | null = null
  try {
    rulesetId = await client.createRuleset(disabledRuleset)
    if (!Number.isSafeInteger(rulesetId) || rulesetId <= 0) throw new Error('invalid_ruleset_id')
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
      if (
        !sameContract(rolledBackRuleset, disabledRuleset) ||
        !sameContract(rolledBackSettings, options.rollbackSettings)
      ) {
        throw new Error('rollback_readback_mismatch')
      }
    } catch {
      throw new Error('apply_failed_rollback_failed')
    }
    throw new Error('apply_failed_rollback_complete')
  }
}
