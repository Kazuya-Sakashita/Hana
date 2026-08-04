import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const root = fileURLToPath(new URL('../../..', import.meta.url))

function read(path: string): string {
  return readFileSync(`${root}/${path}`, 'utf8')
}

describe('ISSUE-168 GitHub App security preflight repository contract', () => {
  it('runs only trusted main code with an all-installation repository token', () => {
    const source = read('.github/workflows/loop-engineer-app-security-preflight.yml')
    const workflow = parse(source) as {
      on: { workflow_dispatch: unknown }
      permissions: Record<string, string>
      concurrency: { group: string; 'cancel-in-progress': boolean }
      jobs: Record<
        string,
        {
          if?: string
          environment?: string
          steps?: Array<{
            id?: string
            name?: string
            uses?: string
            run?: string
            env?: Record<string, string>
            with?: Record<string, string | boolean>
          }>
        }
      >
    }
    const job = workflow.jobs.preflight!
    const steps = job.steps ?? []
    const checkoutIndex = steps.findIndex(({ uses }) => uses?.startsWith('actions/checkout@'))
    const installIndex = steps.findIndex(
      ({ run }) => run === 'pnpm --dir trusted-control install --frozen-lockfile',
    )
    const tokenIndex = steps.findIndex(({ id }) => id === 'app-token')
    const controllerIndex = steps.findIndex(
      ({ run }) =>
        run ===
        'pnpm --dir trusted-control exec tsx scripts/loop-engineer/github-app-security-preflight.ts',
    )
    const token = steps[tokenIndex]!
    const controller = steps[controllerIndex]!

    expect(workflow.on.workflow_dispatch).toEqual({})
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.concurrency).toEqual({
      group: 'loop-engineer-app-security-preflight',
      'cancel-in-progress': true,
    })
    expect(job.if).toContain("github.ref == 'refs/heads/main'")
    expect(job.environment).toBe('hana-merge-publisher')
    expect(steps.filter(({ uses }) => uses?.startsWith('actions/checkout@'))).toEqual([
      {
        uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
        with: {
          ref: '${{ github.sha }}',
          path: 'trusted-control',
          'persist-credentials': false,
        },
      },
    ])
    expect(checkoutIndex).toBeLessThan(installIndex)
    expect(installIndex).toBeLessThan(tokenIndex)
    expect(tokenIndex).toBeLessThan(controllerIndex)
    expect(token.uses).toBe(
      'actions/create-github-app-token@fee1f7d63c2ff003460e3d139729b119787bc349',
    )
    expect(token.with).toMatchObject({
      'app-id': '${{ vars.LOOP_ENGINEER_APP_ID }}',
      'private-key': '${{ secrets.LOOP_ENGINEER_APP_PRIVATE_KEY }}',
      owner: '${{ github.repository_owner }}',
      'permission-checks': 'write',
      'permission-contents': 'read',
      'permission-metadata': 'read',
      'permission-pull-requests': 'read',
    })
    expect(token.with).not.toHaveProperty('repositories')
    expect(controller.env).toMatchObject({
      GH_TOKEN: '${{ steps.app-token.outputs.token }}',
      APP_SLUG: '${{ steps.app-token.outputs.app-slug }}',
      APP_ID: '${{ vars.LOOP_ENGINEER_APP_ID }}',
      TRUSTED_MAIN_SHA: '${{ github.sha }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
    })
    expect(source).not.toContain('actions/upload-artifact')
    expect(source).not.toContain('github.event.pull_request')
    const applySource = read('scripts/loop-engineer/apply-github-merge-controls.ts')
    expect(applySource).not.toContain('user/installations')
    expect(applySource).toContain(
      'actions/workflows/loop-engineer-app-security-preflight.yml/runs?branch=main&event=workflow_dispatch&per_page=1',
    )
    expect(applySource).toContain('actions/runs/${preflightRunId}')
    expect(applySource).toContain('check_name=app-security-preflight&app_id=${appId}&per_page=100')
    expect(applySource).toContain("argValue(args, 'app-preflight-run-id')")
  })
})
