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
  it('defines an active no-bypass main ruleset with only squash and five pinned checks', () => {
    const ruleset = readJson(
      'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset.json',
    )
    const pullRequestRule = ruleset.rules.find(
      ({ type }: { type: string }) => type === 'pull_request',
    )
    const checkRule = ruleset.rules.find(
      ({ type }: { type: string }) => type === 'required_status_checks',
    )

    expect(ruleset).toMatchObject({
      name: 'Hana main merge controls',
      target: 'branch',
      enforcement: 'active',
      bypass_actors: [],
      conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    })
    expect(ruleset.rules.map(({ type }: { type: string }) => type)).toEqual([
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
        (context) => ({ context, integration_id: 15368 }),
      ),
    )
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

  it('records the redacted preflight and reversible rollback target', () => {
    const activeRuleset = readJson(
      'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset.json',
    )
    const disabledRuleset = readJson(
      'docs/api-driven-development/loop-engineer-github-merge-controls/main-ruleset-disabled.json',
    )
    expect(
      readJson('docs/api-driven-development/loop-engineer-github-merge-controls/preflight.json'),
    ).toEqual({
      schema_version: 'loop-engineer-github-controls-snapshot/v1',
      repository: 'Kazuya-Sakashita/Hana',
      default_branch: 'main',
      allow_auto_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
      delete_branch_on_merge: false,
      repository_rulesets: [],
      main_branch_protected: false,
    })
    expect(
      readJson('docs/api-driven-development/loop-engineer-github-merge-controls/rollback.json'),
    ).toEqual({
      ruleset_enforcement: 'disabled',
      repository_settings: {
        allow_auto_merge: false,
        allow_squash_merge: true,
        allow_merge_commit: true,
        allow_rebase_merge: true,
      },
    })
    expect(disabledRuleset).toEqual({ ...activeRuleset, enforcement: 'disabled' })
    expect(
      readJson(
        'docs/api-driven-development/loop-engineer-github-merge-controls/repository-settings-rollback.json',
      ),
    ).toEqual({
      allow_auto_merge: false,
      allow_squash_merge: true,
      allow_merge_commit: true,
      allow_rebase_merge: true,
    })
  })

  it('defines two SHA-bound manual checks with read-only workflow permissions', () => {
    const source = read('.github/workflows/loop-engineer-merge-gates.yml')

    expect(source).toContain('workflow_dispatch:')
    expect(source).toContain('permissions:\n  contents: read')
    expect(source).toContain('  specialist-review-gate:')
    expect(source).toContain('  merge-eligibility:')
    expect(source).toContain('--expected-head-sha="$GITHUB_SHA" --check=specialist')
    expect(source).toContain('--expected-head-sha="$GITHUB_SHA" --check=merge')
    expect(source).not.toContain('secrets.')
    expect(source).not.toContain('pull-requests: write')
    expect(source).not.toContain('administration:')
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

  it('documents approval, least privilege, activation hold, postflight, and rollback', () => {
    const runbook = read(
      'docs/api-driven-development/loop-engineer-github-merge-controls/README.md',
    )

    for (const statement of [
      'Rulesetとrepository settingsの変更は`HUMAN_REQUIRED`',
      'Actions: write',
      'Contents: read',
      'Administration: none',
      'Secrets: none',
      'bypass actorは0件',
      'ISSUE-167の5 PR dry-runと人間GOまではauto-mergeを予約しない',
      '追加commit後は新しい`GITHUB_SHA`で再dispatch',
      'main-ruleset-disabled.json',
      'repository-settings-rollback.json',
      'production deployと実DB migrationは別の人間承認',
    ]) {
      expect(runbook).toContain(statement)
    }
  })
})
