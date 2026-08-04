import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

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
    expect(source).toContain('environment: hana-merge-publisher')
    expect(source).toContain('repos/${GITHUB_REPOSITORY}/check-runs')
    expect(source).toContain('environment: hana-merge-human-approval')
    expect(source).toContain("merge_decision == 'HUMAN_REQUIRED'")
    expect(source).toContain('run-name: merge-gate-pr-')
    expect(source).toContain('cancel-in-progress: true')
    expect(source).toContain('workflow_runs[]')
    expect(source).toContain('assert_current_generation')
    expect(source).toContain('OPENAPI_BREAKING_DETECTED')
    expect(source).toContain('external_id=')
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
