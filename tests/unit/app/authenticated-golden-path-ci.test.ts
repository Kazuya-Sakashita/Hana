import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { syntheticE2ePolicy } from '../../e2e/support/playwright-policy'

const runbook = readFileSync('docs/runbooks/authenticated-golden-path-ci.md', 'utf8')

interface WorkflowStep {
  name?: string
  run?: string
  if?: string
  uses?: string
  with?: Record<string, unknown>
}

interface Workflow {
  name?: string
  jobs?: Record<string, { steps?: WorkflowStep[] }>
}

const workflow = parse(readFileSync('.github/workflows/typecheck.yml', 'utf8')) as Workflow
const prGateSteps = workflow.jobs?.['pr-gate']?.steps ?? []

describe('ISSUE-140 authenticated browser CI contract', () => {
  it('runs inside the existing required pr-gate job with a bounded synthetic artifact policy', () => {
    expect(workflow.name).toBe('pr-gate')
    expect(prGateSteps.some((step) => step.run === 'pnpm e2e')).toBe(true)
    expect(prGateSteps).toContainEqual(
      expect.objectContaining({
        if: 'failure()',
        uses: 'actions/upload-artifact@v4',
        with: expect.objectContaining({
          'retention-days': 7,
          path: expect.stringContaining('test-failed-*.png'),
        }),
      }),
    )
  })

  it('serializes Chromium and disables trace/video capture', () => {
    expect(syntheticE2ePolicy).toMatchObject({
      fullyParallel: false,
      workers: 1,
      trace: 'off',
      video: 'off',
      screenshot: 'only-on-failure',
    })
  })

  it('documents real-data prohibitions, flaky accounting, and no bypass rollback', () => {
    expect(runbook).toContain('productionコードへE2E認証バイパスを追加しない')
    expect(runbook).toContain('first-attempt failure')
    expect(runbook).toContain('2%未満')
    expect(runbook).toContain('required checkを管理画面で迂回しない')
    expect(runbook).toContain('専用DB名`hana_ci`')
  })
})
