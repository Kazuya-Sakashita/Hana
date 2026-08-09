import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../../..', import.meta.url))

function read(path: string): string {
  return readFileSync(`${root}/${path}`, 'utf8')
}

function readJson(path: string) {
  return JSON.parse(read(path))
}

describe('ISSUE-166 GitHub merge controls repository contract', () => {
  it('defines no-bypass main Ruleset templates with five dedicated-app checks', () => {
    const activeRuleset = readJson(
      'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset.template.json',
    )
    const disabledRuleset = readJson(
      'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset-disabled.template.json',
    )
    const pullRequestRule = activeRuleset.rules.find(
      ({ type }: { type: string }) => type === 'pull_request',
    )
    const checkRule = activeRuleset.rules.find(
      ({ type }: { type: string }) => type === 'required_status_checks',
    )

    expect(activeRuleset).toMatchObject({
      name: 'Hana main merge controls',
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    })
    expect(activeRuleset.rules.map(({ type }: { type: string }) => type)).toEqual([
      'deletion',
      'non_fast_forward',
      'pull_request',
      'required_status_checks',
    ])
    expect(pullRequestRule.parameters).toMatchObject({
      required_approving_review_count: 0,
      required_review_thread_resolution: true,
      allowed_merge_methods: ['squash'],
    })
    expect(checkRule.parameters.strict_required_status_checks_policy).toBe(true)
    expect(checkRule.parameters.required_status_checks).toEqual(
      ['pr-gate', 'validate', 'local-registry', 'specialist-review-gate', 'merge-eligibility'].map(
        (context) => ({ context, integration_id: 0 }),
      ),
    )
    expect(JSON.stringify(activeRuleset)).not.toContain('15368')
    expect(disabledRuleset).toEqual({ ...activeRuleset, enforcement: 'disabled' })
  })

  it('enables native auto-merge while disabling merge commit and rebase methods', () => {
    expect(
      readJson(
        'docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings.json',
      ),
    ).toEqual({
      allow_auto_merge: true,
      allow_squash_merge: true,
      allow_merge_commit: false,
      allow_rebase_merge: false,
      squash_merge_commit_title: 'PR_TITLE',
      squash_merge_commit_message: 'PR_BODY',
    })
  })

  it('records an exact redacted preflight and reversible rollback target', () => {
    const expectedRollback = {
      allow_auto_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
      squash_merge_commit_title: 'COMMIT_OR_PR_TITLE',
      squash_merge_commit_message: 'COMMIT_MESSAGES',
    }

    expect(
      readJson('docs/api-driven-development/loop-engineer-github-merge-controls/preflight.json'),
    ).toEqual({
      schema_version: 'loop-engineer-github-controls-snapshot/v2',
      repository: 'Kazuya-Sakashita/Hana',
      default_branch: 'main',
      ...expectedRollback,
      delete_branch_on_merge: false,
      repository_rulesets: [],
      main_branch_protected: false,
    })
    expect(
      readJson(
        'docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings-rollback.json',
      ),
    ).toEqual(expectedRollback)
    expect(
      readJson('docs/api-driven-development/loop-engineer-github-merge-controls/rollback.json'),
    ).toEqual({
      ruleset_enforcement: 'disabled',
      repository_settings: expectedRollback,
    })
  })

  it('runs only trusted main workflow code and publishes dedicated-app check runs', () => {
    const source = read('.github/workflows/loop-engineer-merge-gates.yml')
    const controller = read('scripts/loop-engineer/github-check-generation.ts')

    expect(source).toContain('workflow_dispatch:')
    expect(source).toContain('ref: main')
    expect(source).toContain('LOOP_ENGINEER_DISPATCHER_LOGIN')
    expect(source).toContain('github.event.sender.type')
    expect(source).toContain('LOOP_ENGINEER_APP_ID')
    expect(source).toContain('LOOP_ENGINEER_APP_PRIVATE_KEY')
    expect(source).toContain(
      'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349',
    )
    expect(source).toContain('actions/checkout@11d5960a326750d5838078e36cf38b85af677262')
    expect(source).toContain('actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020')
    expect(source).toContain('pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1')
    expect(source).not.toContain('permission-actions: write')
    expect(source).toContain('candidate_pr_gate:')
    expect(source).toContain('candidate_openapi_validate:')
    expect(source).toContain('trusted_openapi_breaking:')
    expect(source).toContain('candidate_issue_registry:')
    expect(source).toContain('pnpm --silent loop-engineer:github-gate')
    expect(source).not.toContain('| pnpm loop-engineer:github-gate')
    expect(source).toContain('environment: hana-merge-publisher')
    expect(controller).toContain('repos/${repository}/check-runs')
    expect(source).toContain('environment: hana-merge-human-approval')
    expect(source).toContain("merge_decision == 'HUMAN_REQUIRED'")
    expect(source).toContain('run-name: loop-engineer-merge-gates-${{ github.run_id }}')
    expect(source).toContain('cancel-in-progress: true')
    expect(source).not.toContain('workflow_runs[]')
    expect(source).not.toContain('/actions/workflows/')
    expect(controller).toContain('const currentGeneration')
    expect(source).toContain('OPENAPI_BREAKING_DETECTED')
    expect(controller).toContain('external_id: input.externalId')
    expect(source).toContain('BASE_SHA')
    expect(source).not.toContain('base_sha:.base.sha')
    expect(controller).toContain('git/ref/heads/main')
    expect(controller).not.toContain('base_sha: String(response.base?.sha)')
    expect(source).toContain(
      'oasdiff/oasdiff-action/breaking@1c611ffb1253a72924624aa4fb662e302b3565d3',
    )
    expect(source).toContain('check-openapi-breaking-waiver.mjs')
    expect(source).not.toContain('actions/checkout@v4')
    expect(source).not.toContain('actions/setup-node@v4')
    expect(source).not.toContain('pnpm/action-setup@v4')
    expect(source).not.toContain('integration_id: 15368')
    expect(source).not.toContain('OPENAPI_BREAKING_APPROVAL_LABEL_PRESENT: ${{ contains(')
  })

  it('flows the prepare main ref SHA through attestation comparison and base_sha output', () => {
    const workflow = parse(read('.github/workflows/loop-engineer-merge-gates.yml')) as {
      jobs: Record<
        string,
        {
          outputs?: Record<string, string>
          steps?: Array<{ id?: string; run?: string }>
        }
      >
    }
    const prepare = workflow.jobs.prepare!
    const gateScript = prepare.steps?.find(({ id }) => id === 'gate')?.run ?? ''
    const readMainRef =
      'live_base_sha="$(gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq \'.object.sha\')"'
    const compareDeclaredMergeBase = '"$declared_merge_base_sha" != "$live_base_sha"'
    const publishBaseSha = 'echo "base_sha=$live_base_sha" >> "$GITHUB_OUTPUT"'
    const readIndex = gateScript.indexOf(readMainRef)
    const compareIndex = gateScript.indexOf(compareDeclaredMergeBase)
    const publishIndex = gateScript.indexOf(publishBaseSha)

    expect(prepare.outputs?.base_sha).toBe('${{ steps.gate.outputs.base_sha }}')
    expect(readIndex).toBeGreaterThanOrEqual(0)
    expect(compareIndex).toBeGreaterThan(readIndex)
    expect(publishIndex).toBeGreaterThan(compareIndex)
  })

  it('accepts an OpenAPI waiver only for a freshly generated non-empty report', () => {
    const workflow = parse(read('.github/workflows/loop-engineer-merge-gates.yml')) as {
      jobs: Record<
        string,
        {
          steps?: Array<{
            name?: string
            id?: string
            uses?: string
            run?: string
            if?: string
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const steps = workflow.jobs.trusted_openapi_breaking?.steps ?? []
    const resetIndex = steps.findIndex(
      ({ name }) => name === 'Remove any untrusted breaking report',
    )
    const detectIndex = steps.findIndex(({ id }) => id === 'breaking')
    const verifyIndex = steps.findIndex(
      ({ name }) => name === 'Require a freshly generated non-empty breaking report',
    )
    const waiverIndex = steps.findIndex(
      ({ name }) => name === 'Require approved exact-report waiver',
    )

    expect(resetIndex).toBeGreaterThanOrEqual(0)
    expect(detectIndex).toBeGreaterThan(resetIndex)
    expect(verifyIndex).toBeGreaterThan(detectIndex)
    expect(waiverIndex).toBeGreaterThan(verifyIndex)
    expect(steps[resetIndex]?.run).toBe('rm -f -- oasdiff-breaking.txt')
    expect(steps[verifyIndex]).toMatchObject({
      if: "steps.breaking.outcome == 'failure'",
      run: 'test -s oasdiff-breaking.txt',
    })
    expect(steps.find(({ uses }) => uses?.startsWith('pnpm/action-setup@'))?.with).toMatchObject({
      package_json_file: 'trusted-control/package.json',
    })
  })

  it('invalidates prior same-SHA success before evaluating a new generation', () => {
    const source = read('.github/workflows/loop-engineer-merge-gates.yml')
    const workflow = parse(source) as {
      'run-name': string
      concurrency: { group: string; 'cancel-in-progress': boolean }
      jobs: Record<
        string,
        {
          needs?: string | string[]
          outputs?: Record<string, string>
          environment?: string
          steps?: Array<{
            name?: string
            run?: string
            uses?: string
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const begin = workflow.jobs.begin_required_checks!
    const beginScript = begin.steps?.find(
      ({ name }) => name === 'Begin current check generation',
    )?.run
    const publishScript = workflow.jobs.publish_required_checks!.steps?.find(
      ({ name }) => name === 'Finalize status-only checks from the dedicated App',
    )?.run
    const humanScript = workflow.jobs.publish_human_approved_gate!.steps?.find(
      ({ name }) => name === 'Approve the current merge gate generation',
    )?.run

    expect(workflow['run-name']).toBe('loop-engineer-merge-gates-${{ github.run_id }}')
    expect(workflow.concurrency).toEqual({
      group: 'loop-engineer-merge-gates-main-controller',
      'cancel-in-progress': true,
    })
    expect(
      JSON.stringify({ runName: workflow['run-name'], concurrency: workflow.concurrency }),
    ).not.toContain('inputs.gate_input')
    expect(begin.environment).toBe('hana-merge-publisher')
    expect(Object.keys(begin.outputs ?? {}).sort()).toEqual(
      [
        'local_registry_check_id',
        'merge_eligibility_check_id',
        'pr_gate_check_id',
        'specialist_review_check_id',
        'validate_check_id',
      ].sort(),
    )
    expect(beginScript).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-check-generation.ts begin',
    )
    for (const job of [
      'candidate_pr_gate',
      'candidate_openapi_validate',
      'trusted_openapi_breaking',
      'candidate_issue_registry',
    ]) {
      expect(workflow.jobs[job]?.needs).toEqual(['prepare', 'begin_required_checks'])
    }
    expect(publishScript).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-check-generation.ts finalize',
    )
    expect(humanScript).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-check-generation.ts approve',
    )
    for (const job of [
      begin,
      workflow.jobs.publish_required_checks!,
      workflow.jobs.publish_human_approved_gate!,
    ]) {
      const checkout = {
        uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
        with: {
          ref: '${{ needs.prepare.outputs.base_sha }}',
          path: 'trusted-control',
          'persist-credentials': false,
        },
      }
      expect(job.steps?.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
        checkout,
      ])
      const checkoutIndex = job.steps?.findIndex(({ uses }) => uses === checkout.uses) ?? -1
      const pnpmSetup = job.steps?.find(({ uses }) => uses?.startsWith('pnpm/action-setup@'))
      const installIndex =
        job.steps?.findIndex(
          ({ run }) => run === 'pnpm --dir trusted-control install --frozen-lockfile',
        ) ?? -1
      const tokenIndex =
        job.steps?.findIndex(({ uses }) => uses?.startsWith('actions/create-github-app-token@')) ??
        -1
      const controllerIndex =
        job.steps?.findIndex(({ run }) => run?.includes('github-check-generation.ts')) ?? -1
      expect(pnpmSetup?.with).toMatchObject({
        package_json_file: 'trusted-control/package.json',
      })
      expect(checkoutIndex).toBeLessThan(installIndex)
      expect(installIndex).toBeLessThan(tokenIndex)
      expect(tokenIndex).toBeLessThan(controllerIndex)
    }
  })

  it('revokes dedicated-App success when a breaking waiver label is removed', () => {
    const source = read('.github/workflows/loop-engineer-breaking-waiver-revoked.yml')
    const workflow = parse(source) as {
      on: { pull_request_target: { types: string[] } }
      jobs: Record<
        string,
        {
          if?: string
          environment?: string
          steps?: Array<{
            name?: string
            uses?: string
            run?: string
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const invalidate = workflow.jobs.invalidate_breaking_waiver!
    const script = invalidate.steps?.find(
      ({ name }) => name === 'Revoke checks bound to the removed waiver',
    )?.run

    expect(workflow.on.pull_request_target.types).toEqual(['unlabeled'])
    expect(invalidate.if).toContain("github.event.label.name == 'openapi-breaking-approved'")
    expect(invalidate.environment).toBe('hana-merge-publisher')
    const checkout = {
      uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      with: {
        ref: '${{ github.event.pull_request.base.sha }}',
        path: 'trusted-control',
        'persist-credentials': false,
      },
    }
    expect(invalidate.steps?.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      checkout,
    ])
    expect(
      invalidate.steps?.find(({ uses }) => uses?.startsWith('pnpm/action-setup@'))?.with,
    ).toMatchObject({
      package_json_file: 'trusted-control/package.json',
    })
    expect(script).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-check-generation.ts revoke-waiver',
    )
    expect(source).not.toContain('github.event.pull_request.title')
    expect(source).not.toContain('github.event.pull_request.body')
  })

  it('ships a scope-confirmed transactional apply command', () => {
    const source = read('scripts/loop-engineer/apply-github-merge-controls.ts')
    const packageJson = readJson('package.json')

    expect(packageJson.scripts['loop-engineer:apply-github-controls']).toContain(
      'apply-github-merge-controls.ts',
    )
    expect(source).toContain("repository !== 'Kazuya-Sakashita/Hana'")
    expect(source).toContain("approval !== 'ISSUE-166'")
    expect(source).toContain('applyGitHubMergeControls')
    expect(source).toContain('validateGitHubAutomationSecurityConfiguration')
    expect(source).toContain('readAutoMergeReservationCount')
    expect(source).not.toContain('console.log')
  })

  it('emits OpenAPI and Issue Registry job names on every main pull request', () => {
    const openapi = read('.github/workflows/openapi-validate.yml')
    const issueRegistry = read('.github/workflows/issue-registry.yml')
    const openapiPullRequest = openapi.slice(
      openapi.indexOf('  pull_request:'),
      openapi.indexOf('  push:'),
    )
    const registryPullRequest = issueRegistry.slice(
      issueRegistry.indexOf('  pull_request:'),
      issueRegistry.indexOf('  schedule:'),
    )

    expect(openapiPullRequest).toContain('branches: [main]')
    expect(openapiPullRequest).not.toContain('paths:')
    expect(registryPullRequest).not.toContain('paths:')
    expect(openapi).toContain('  validate:')
    expect(issueRegistry).toContain('  local-registry:')
  })

  it('documents least privilege, protected human approval, staged activation, and rollback', () => {
    const runbook = read(
      'docs/api-driven-development/loop-engineer-github-merge-controls/README.md',
    )

    for (const statement of [
      'Rulesetとrepository settingsの変更は`HUMAN_REQUIRED`',
      'Actions: none',
      'Checks: write',
      'Contents: read',
      'Pull requests: read',
      'Administration: none',
      'bypass actorは0件',
      '専用GitHub App',
      'hana-merge-human-approval',
      'hana-merge-publisher',
      'Environment secret',
      'can_admins_bypass',
      'repository secretへ置かない',
      'main-ruleset-disabled.template.json',
      'fresh preflight',
      'exact readback',
      'automatic rollback',
      'ISSUE-167の5 PR dry-runと人間GOまではauto-mergeを予約しない',
      'production deployと実DB migrationは別の人間承認',
    ]) {
      expect(runbook).toContain(statement)
    }
  })
})
