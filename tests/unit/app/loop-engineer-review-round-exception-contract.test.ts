import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = resolve(import.meta.dirname, '../../..')

function read(path: string): string {
  return readFileSync(resolve(root, path), 'utf8')
}

describe('ISSUE-173 protected review-round exception workflow', () => {
  it('issues an exception proof only from the protected main workflow with job-scoped OIDC', () => {
    const source = read('.github/workflows/loop-engineer-review-round-exception.yml')
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
    const approval = workflow.jobs.approve_and_publish!
    const steps = approval.steps ?? []

    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow['run-name']).toBe('loop-engineer-review-round-exception-${{ github.run_id }}')
    expect(workflow.concurrency).toEqual({
      group: 'loop-engineer-review-round-exception-controller',
      'cancel-in-progress': true,
    })
    expect(
      JSON.stringify({ runName: workflow['run-name'], concurrency: workflow.concurrency }),
    ).not.toContain('inputs.exception_input')
    expect(workflow.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
    })
    expect(approval.needs).toBe('prepare')
    expect(approval.environment).toBe('hana-merge-human-approval')
    expect(approval.permissions).toEqual({
      contents: 'read',
      'id-token': 'write',
      'pull-requests': 'read',
    })
    expect(Object.values(approval.permissions ?? {}).filter((value) => value === 'write')).toEqual([
      'write',
    ])
    expect(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      {
        uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
        with: {
          ref: '${{ needs.prepare.outputs.base_sha }}',
          path: 'trusted-control',
          'persist-credentials': false,
        },
      },
    ])
    expect(steps.find(({ uses }) => uses?.startsWith('actions/create-github-app-token@'))).toEqual({
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
    const checkoutIndex = steps.findIndex(({ uses }) => uses?.startsWith('actions/checkout@'))
    const pnpmIndex = steps.findIndex(({ uses }) => uses?.startsWith('pnpm/action-setup@'))
    const nodeIndex = steps.findIndex(({ uses }) => uses?.startsWith('actions/setup-node@'))
    const installIndex = steps.findIndex(
      ({ run }) => run === 'pnpm --dir trusted-control install --frozen-lockfile',
    )
    const tokenIndex = steps.findIndex(({ id }) => id === 'app-token')
    const publishIndex = steps.findIndex(
      ({ name }) => name === 'Publish the protected review-round exception proof',
    )
    expect([checkoutIndex, pnpmIndex, nodeIndex, installIndex, tokenIndex, publishIndex]).toEqual([
      0, 1, 2, 3, 4, 5,
    ])
    expect(steps.at(-1)?.run).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-review-round-exception.ts approve',
    )
    expect(
      Object.entries(workflow.jobs)
        .filter(([, job]) => job.permissions?.['id-token'] === 'write')
        .map(([name]) => name),
    ).toEqual(['approve_and_publish'])
    expect(source).not.toContain('github.event.pull_request.title')
    expect(source).not.toContain('github.event.pull_request.body')
    expect(source).not.toContain('actions/checkout@v4')
  })

  it('lets only the trusted merge-gate controller read the dedicated-App proof', () => {
    const source = read('.github/workflows/loop-engineer-merge-gates.yml')
    const workflow = parse(source) as {
      permissions: Record<string, string>
      jobs: Record<
        string,
        {
          permissions?: Record<string, string>
          steps?: Array<{ id?: string; env?: Record<string, string> }>
        }
      >
    }
    const prepare = workflow.jobs.prepare!
    const gate = prepare.steps?.find(({ id }) => id === 'gate')

    expect(workflow.permissions).toEqual({ contents: 'read', 'pull-requests': 'read' })
    expect(prepare.permissions).toEqual({
      checks: 'read',
      contents: 'read',
      'pull-requests': 'read',
    })
    expect(gate?.env).toMatchObject({
      LOOP_ENGINEER_APP_ID: '${{ vars.LOOP_ENGINEER_APP_ID }}',
    })
    expect(
      Object.entries(workflow.jobs)
        .filter(([, job]) => job.permissions?.checks === 'read')
        .map(([name]) => name),
    ).toEqual(['prepare'])
    expect(source).not.toContain('id-token: write')
  })
})
