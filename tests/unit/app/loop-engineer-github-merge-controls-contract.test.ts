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
    expect(source).toContain('ref: ${{ github.sha }}')
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
    expect(source).toContain('.base.sha')
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

  it('pins every controller action to an immutable commit SHA', () => {
    const workflow = parse(read('.github/workflows/loop-engineer-merge-gates.yml')) as {
      jobs: Record<string, { steps?: Array<{ uses?: string }> }>
    }
    const actionReferences = Object.values(workflow.jobs).flatMap((job) =>
      (job.steps ?? []).flatMap(({ uses }) => (uses ? [uses] : [])),
    )

    expect(actionReferences.length).toBeGreaterThan(0)
    for (const actionReference of actionReferences) {
      expect(actionReference).toMatch(/^[^@\s]+@[0-9a-f]{40}$/)
    }
  })

  it('requires exact-head PostgreSQL evidence for database change areas', () => {
    const workflow = parse(read('.github/workflows/loop-engineer-merge-gates.yml')) as {
      jobs: Record<
        string,
        {
          'timeout-minutes'?: number
          outputs?: Record<string, string>
          services?: Record<
            string,
            {
              image?: string
              env?: Record<string, string>
              options?: string
            }
          >
          env?: Record<string, string>
          steps?: Array<{
            id?: string
            name?: string
            uses?: string
            run?: string
            if?: string
            env?: Record<string, string>
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const prepare = workflow.jobs.prepare!
    const gateScript = prepare.steps?.find(({ id }) => id === 'gate')?.run ?? ''
    const candidate = workflow.jobs.candidate_pr_gate!
    const steps = candidate.steps ?? []
    const publisher = workflow.jobs.publish_required_checks!
    const databaseCondition = "needs.prepare.outputs.database_evidence_required == 'true'"
    const databaseRuns = [
      'pnpm qa:issue123:db-bootstrap',
      'pnpm qa:issue151:db-bootstrap',
      'pnpm db:migrate:deploy',
      'pnpm qa:issue151:child-rls-db',
    ]
    const classificationGuard = steps.find(
      ({ name }) => name === 'Require trusted database evidence classification',
    )
    const trustedPrepareCheckout = {
      uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      with: {
        ref: '${{ github.sha }}',
        'persist-credentials': false,
      },
    }

    expect(prepare.steps?.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      trustedPrepareCheckout,
    ])
    expect(prepare.outputs?.database_evidence_required).toBe(
      '${{ steps.gate.outputs.database_evidence_required }}',
    )
    expect(gateScript).toContain(
      'any(.review_attestation.change_areas[]; . == "database" or . == "migration-code" or . == "real-db-migration")',
    )
    expect(gateScript).toContain(
      'echo "database_evidence_required=$database_evidence_required" >> "$GITHUB_OUTPUT"',
    )
    expect(gateScript.indexOf('pnpm --silent loop-engineer:github-gate')).toBeLessThan(
      gateScript.indexOf('database_evidence_required='),
    )
    expect(gateScript).toContain('git/trees/${live_base_sha}?recursive=1')
    expect(gateScript).toContain('git/trees/${live_head_sha}?recursive=1')
    expect(gateScript).toContain('loop-engineer-database-evidence-tree-input/v1')
    expect(gateScript).not.toContain('/pulls/${pr_number}/files')
    expect(gateScript).toContain('evaluate-database-evidence-paths.ts')
    expect(gateScript).toContain('"$GITHUB_SHA" != "$live_base_sha"')
    expect(gateScript).toContain(
      '"$trusted_database_diff_required" == "true" || "$attested_database_area_required" == "true"',
    )
    expect(gateScript.indexOf('pnpm --silent loop-engineer:github-gate')).toBeLessThan(
      gateScript.indexOf('git/trees/${live_base_sha}?recursive=1'),
    )
    expect(gateScript.indexOf('git/trees/${live_head_sha}?recursive=1')).toBeLessThan(
      gateScript.indexOf('evaluate-database-evidence-paths.ts'),
    )
    expect(candidate['timeout-minutes']).toBe(25)
    expect(candidate.services?.postgres?.image).toBe(
      'postgres:16.14@sha256:95206741a5b214807675e14165369d05b93a9cf692223b616d07cca227e74b0b',
    )
    expect(candidate.services?.postgres?.env).toEqual({
      POSTGRES_DB: 'hana_ci',
      POSTGRES_PASSWORD: 'hana-admin',
      POSTGRES_USER: 'hana_admin',
    })
    expect(candidate.services?.postgres?.options).toContain('pg_isready -U hana_admin -d hana_ci')
    expect(candidate.env).toMatchObject({
      DATABASE_URL: 'postgresql://hana_admin:hana-admin@localhost:5432/hana_ci',
      DIRECT_URL: 'postgresql://hana_admin:hana-admin@localhost:5432/hana_ci',
      CHILD_DATABASE_URL:
        'postgresql://hana_child_runtime:synthetic-runtime@localhost:5432/hana_ci',
      CHILD_OWNER_SCOPE_MODE: 'route',
    })
    expect(classificationGuard).toMatchObject({
      env: {
        DATABASE_EVIDENCE_REQUIRED: '${{ needs.prepare.outputs.database_evidence_required }}',
      },
    })
    expect(classificationGuard?.run).toContain('true|false')
    expect(classificationGuard?.run).toContain('exit 1')

    const candidateCheckout = {
      uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      with: {
        ref: '${{ needs.prepare.outputs.head_sha }}',
        'persist-credentials': false,
      },
    }
    expect(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      candidateCheckout,
    ])

    const databaseIndexes = databaseRuns.map((run) => steps.findIndex((step) => step.run === run))
    for (const [index, run] of databaseRuns.entries()) {
      expect(steps[databaseIndexes[index]!]).toMatchObject({ run, if: databaseCondition })
    }
    for (const run of ['pnpm db:migrate:deploy', 'pnpm qa:issue151:child-rls-db']) {
      expect(steps.find((step) => step.run === run)?.env).toEqual({
        DIRECT_URL: 'postgresql://postgres:synthetic-schema-owner@localhost:5432/hana_ci',
      })
    }
    expect(databaseIndexes.every((index) => index >= 0)).toBe(true)
    expect(databaseIndexes).toEqual([...databaseIndexes].sort((left, right) => left - right))
    const installIndex = steps.findIndex(({ run }) => run === 'pnpm install --frozen-lockfile')
    const prGateIndex = steps.findIndex(({ run }) => run === 'pnpm pr:gate')
    const checkoutIndex = steps.findIndex(({ uses }) => uses === candidateCheckout.uses)
    expect(checkoutIndex).toBeLessThan(installIndex)
    expect(installIndex).toBeLessThan(databaseIndexes[0]!)
    expect(databaseIndexes.at(-1)).toBeLessThan(prGateIndex)
    expect(steps[prGateIndex]?.if).toBeUndefined()
    expect(
      publisher.steps?.find(
        ({ name }) => name === 'Finalize status-only checks from the dedicated App',
      )?.env?.PR_GATE_RESULT,
    ).toBe('${{ needs.candidate_pr_gate.result }}')
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
