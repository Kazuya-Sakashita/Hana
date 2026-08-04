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
      concurrency: { group: string; 'cancel-in-progress': boolean }
      jobs: Record<
        string,
        {
          needs?: string
          environment?: string
          permissions?: Record<string, string>
          steps?: Array<{
            name?: string
            uses?: string
            run?: string
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const approval = workflow.jobs.approve_and_publish!

    expect(Object.keys(workflow.on)).toEqual(['workflow_dispatch'])
    expect(workflow['run-name']).toBe('loop-engineer-review-round-exception-${{ github.run_id }}')
    expect(workflow.concurrency).toEqual({
      group: 'loop-engineer-review-round-exception-controller',
      'cancel-in-progress': true,
    })
    expect(
      JSON.stringify({ runName: workflow['run-name'], concurrency: workflow.concurrency }),
    ).not.toContain('inputs.exception_input')
    expect(approval).toMatchObject({
      needs: 'prepare',
      environment: 'hana-merge-human-approval',
      permissions: {
        contents: 'read',
        'id-token': 'write',
        'pull-requests': 'read',
      },
    })
    expect(Object.values(approval.permissions ?? {}).filter((value) => value === 'write')).toEqual([
      'write',
    ])
    expect(approval.steps?.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
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
      approval.steps?.find(({ uses }) => uses?.startsWith('actions/create-github-app-token@')),
    ).toMatchObject({
      uses: 'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349',
      with: {
        'permission-checks': 'write',
        'permission-contents': 'read',
        'permission-pull-requests': 'read',
      },
    })
    expect(approval.steps?.at(-1)?.run).toBe(
      'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-review-round-exception.ts approve',
    )
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
