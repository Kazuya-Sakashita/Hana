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
  permissions?: Record<string, string>
  jobs?: Record<
    string,
    {
      services?: Record<string, { image?: string }>
      steps?: WorkflowStep[]
    }
  >
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
        uses: 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
        with: expect.objectContaining({
          'retention-days': 7,
          path: expect.stringContaining('test-failed-*.png'),
        }),
      }),
    )
  })

  it('pins CI dependencies and does not persist checkout credentials', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs?.['pr-gate']?.services?.postgres?.image).toBe(
      'postgres:16.14@sha256:95206741a5b214807675e14165369d05b93a9cf692223b616d07cca227e74b0b',
    )
    expect(prGateSteps).toContainEqual({
      uses: 'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      with: { 'persist-credentials': false },
    })
    expect(
      prGateSteps.some(
        ({ uses }) => uses === 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
      ),
    ).toBe(true)
    expect(
      prGateSteps.some(
        ({ uses }) => uses === 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
      ),
    ).toBe(true)
    expect(
      prGateSteps.some(
        ({ uses }) => uses === 'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
      ),
    ).toBe(true)
    expect(prGateSteps.some(({ uses }) => uses?.endsWith('@v4'))).toBe(false)
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
