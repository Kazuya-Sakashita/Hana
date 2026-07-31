import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/typecheck.yml', 'utf8')
const config = readFileSync('playwright.config.ts', 'utf8')
const runbook = readFileSync('docs/runbooks/authenticated-golden-path-ci.md', 'utf8')

describe('ISSUE-140 authenticated browser CI contract', () => {
  it('runs inside the existing required pr-gate job with a bounded synthetic artifact policy', () => {
    expect(workflow).toContain('name: pr-gate')
    expect(workflow).toContain('run: pnpm e2e')
    expect(workflow).toContain('if: failure()')
    expect(workflow).toContain('retention-days: 7')
    expect(workflow).toContain('test-failed-*.png')
  })

  it('serializes Chromium and disables trace/video capture', () => {
    expect(config).toContain('workers: 1')
    expect(config).toContain("trace: 'off'")
    expect(config).toContain("video: 'off'")
    expect(config).toContain("screenshot: 'only-on-failure'")
  })

  it('documents real-data prohibitions, flaky accounting, and no bypass rollback', () => {
    expect(runbook).toContain('productionコードへE2E認証バイパスを追加しない')
    expect(runbook).toContain('first-attempt failure')
    expect(runbook).toContain('2%未満')
    expect(runbook).toContain('required checkを管理画面で迂回しない')
    expect(runbook).toContain('専用DB名`hana_ci`')
  })
})
