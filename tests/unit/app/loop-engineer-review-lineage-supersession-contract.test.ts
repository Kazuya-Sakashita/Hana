import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '../../..')

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('ISSUE-174 protected review lineage supersession workflow', () => {
  it('binds one registered successor through the protected Environment and job-scoped OIDC', () => {
    const source = read('.github/workflows/loop-engineer-review-lineage-supersession.yml')
    const workflow = parse(source) as {
      'run-name': string
      on: Record<string, unknown>
      permissions: Record<string, string>
      concurrency: { group: string; 'cancel-in-progress': boolean }
      jobs: Record<
        string,
        {
          needs?: string
          environment?: string
          permissions?: Record<string, string>
          steps?: Array<{
            id?: string
            name?: string
            uses?: string
            run?: string
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const prepare = workflow.jobs.prepare!
    const approval = workflow.jobs.approve_and_publish!
    const prepareSource = prepare.steps?.find(({ id }) => id === 'request')?.run ?? ''
    const approvalSteps = approval.steps ?? []

    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow['run-name']).toBe(
      'loop-engineer-review-lineage-supersession-${{ github.run_id }}',
    )
    expect(workflow.concurrency).toEqual({
      group: 'loop-engineer-review-lineage-supersession-controller',
      'cancel-in-progress': false,
    })
    expect(workflow.permissions).toEqual({
      contents: 'read',
      issues: 'read',
      'pull-requests': 'read',
    })
    expect(prepareSource).toContain('lineage-issue-172')
    expect(prepareSource).toContain('ISSUE-172')
    expect(prepareSource).toContain('ISSUE-175')
    expect(prepareSource).toContain('closingIssuesReferences(first:10)')
    expect(prepareSource).toContain('repository{nameWithOwner}')
    expect(prepareSource).toContain('predecessor_issue_number')
    expect(prepareSource).toContain('successor_issue_number')
    expect(prepareSource).toContain('predecessor PR must be frozen closed and unmerged')
    expect(prepareSource).toContain('gh_cli_pagination_contract')
    expect(prepareSource).toContain('main_sha_race')
    expect(prepareSource).toContain('status_metadata_allowlist')

    expect(approval.needs).toBe('prepare')
    expect(approval.environment).toBe('hana-merge-human-approval')
    expect(approval.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      issues: 'read',
      'pull-requests': 'read',
    })
    expect(
      Object.entries(workflow.jobs)
        .filter(([, job]) => job.permissions?.['id-token'] === 'write')
        .map(([name]) => name),
    ).toEqual(['approve_and_publish'])
    expect(approvalSteps.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      {
        uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
        with: {
          ref: '${{ needs.prepare.outputs.base_sha }}',
          path: 'trusted-control',
          'persist-credentials': false,
        },
      },
    ])
    expect(
      approvalSteps.find(({ uses }) => uses?.startsWith('actions/create-github-app-token@')),
    ).toEqual({
      id: 'app-token',
      uses: 'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349',
      with: {
        'app-id': '${{ vars.LOOP_ENGINEER_APP_ID }}',
        'private-key': '${{ secrets.LOOP_ENGINEER_APP_PRIVATE_KEY }}',
        owner: '${{ github.repository_owner }}',
        repositories: '${{ github.event.repository.name }}',
        'permission-checks': 'write',
        'permission-contents': 'read',
        'permission-pull-requests': 'read',
      },
    })
    const checkoutIndex = approvalSteps.findIndex(({ uses }) =>
      uses?.startsWith('actions/checkout@'),
    )
    const installIndex = approvalSteps.findIndex(
      ({ run }) => run === 'pnpm --dir trusted-control install --frozen-lockfile',
    )
    const tokenIndex = approvalSteps.findIndex(({ id }) => id === 'app-token')
    const publishIndex = approvalSteps.findIndex(
      ({ name }) => name === 'Publish the protected review lineage supersession proof',
    )
    expect(checkoutIndex).toBeLessThan(installIndex)
    expect(installIndex).toBeLessThan(tokenIndex)
    expect(tokenIndex).toBeLessThan(publishIndex)
    expect(approvalSteps.at(-1)?.run).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-review-lineage-supersession.ts approve',
    )
    expect(source).not.toContain('github.event.pull_request.title')
    expect(source).not.toContain('github.event.pull_request.body')
    expect(source).not.toContain('actions/checkout@v4')
  })

  it('keeps dedicated-App Check reads inside the trusted merge gate job', () => {
    const source = read('.github/workflows/loop-engineer-merge-gates.yml')
    const workflow = parse(source) as {
      jobs: Record<string, { permissions?: Record<string, string> }>
    }

    expect(
      Object.entries(workflow.jobs)
        .filter(([, job]) => job.permissions?.checks === 'read')
        .map(([name]) => name),
    ).toEqual(['prepare'])
    expect(workflow.jobs.prepare?.permissions).toMatchObject({
      checks: 'read',
      issues: 'read',
      'pull-requests': 'read',
    })
    expect(source).toContain('GITHUB_STATUS_TOKEN: ${{ github.token }}')
    expect(source).not.toContain('id-token: write')
    expect(source).toContain('git patch-id --stable')
    expect(source).toContain('git diff --name-only')
    expect(source).toContain('review-lineage-registration')
    expect(source).toContain('registered_successor_head')
    expect(source).toContain('original_terminal_match')
    expect(source).toContain("sed '/^docs\\/issues\\//d'")
    expect(source).toContain('The review lineage registration inventory is incomplete.')
    expect(source).toContain('The review lineage registration inventory is ambiguous.')
    expect(source).toContain('The review lineage registration is untrusted or incomplete.')
    expect(source).toContain('base_ref:.base.ref')
    expect(source).toContain('base_repository:.base.repo.full_name')
    expect(source).toContain('== "main"')
    expect(source).toContain('--review-lineage-required="$review_lineage_required"')
    expect(source).toContain('2f0eaf7ee713bfd140269720a7d593e8f007c5a7')
  })
})
