import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-075-lp-public-qa.cjs', import.meta.url),
)
const contractOutput = execFileSync(process.execPath, [scriptPath, '--mode=contract'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
const contract = JSON.parse(contractOutput) as {
  issue: string
  mode: string
  result: string
  artifact_policy: string
  target_surfaces: { id: string; path: string; requiredSelectors: string[] }[]
  viewports: { id: string; width: number; height: number }[]
  interactive_selector: string
  checks: string[]
}

const scriptSource = readFileSync(scriptPath, 'utf8')
const qaDoc = readFileSync(
  new URL('../../../docs/design/lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-075-lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')

describe('ISSUE-075 LP public QA and trust gate', () => {
  it('defines public LP and privacy browser QA surfaces', () => {
    expect(contract).toMatchObject({
      issue: 'ISSUE-075',
      mode: 'contract',
      result: 'pass',
    })

    expect(contract.target_surfaces).toEqual([
      {
        id: 'lp',
        path: '/lp',
        requiredSelectors: ['[data-public-lp="waitlist"]', '#waitlist-form', 'a[href="/privacy"]'],
      },
      {
        id: 'privacy',
        path: '/privacy',
        requiredSelectors: [
          '[data-public-privacy="waitlist"]',
          'main h1',
          'section[aria-label="待機リスト登録情報の扱い"]',
        ],
      },
    ])
  })

  it('covers the required public launch viewport matrix and checks', () => {
    expect(contract.viewports.map((viewport) => viewport.width)).toEqual([390, 430, 768, 1280])
    expect(contract.interactive_selector).toContain('summary')
    expect(contract.interactive_selector).toContain('[role="button"]')
    expect(contract.interactive_selector).toContain('[tabindex]:not([tabindex="-1"])')
    expect(contract.checks).toEqual(
      expect.arrayContaining([
        'tap-targets',
        'interactive-overlap',
        'visible-focus',
        'horizontal-overflow',
        'reduced-motion',
        'no-js-fallback',
        'image-payload',
        'lcp-timing',
        'evidence-safety',
      ]),
    )
  })

  it('keeps the QA gate read-only and safe for evidence', () => {
    expect(packageSource).toContain('qa:issue075:lp-public')
    expect(packageSource).toContain('pnpm qa:issue075:lp-public -- --mode=contract')
    expect(contract.artifact_policy).toContain('read-only')
    expect(contract.artifact_policy).toContain('no screenshot')
    expect(scriptSource).not.toContain('writeFileSync')
    expect(scriptSource).not.toContain('.screenshot(')
    expect(scriptSource).not.toContain('accessibility.snapshot')
    expect(scriptSource).not.toContain('.tracing')
    expect(scriptSource).not.toContain('routeFromHAR')
    expect(scriptSource).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)
    expect(scriptSource).toContain('safeFailureMessage')
    expect(scriptSource).toContain('redacted-failure-output')
  })

  it('records machine QA evidence and the human trust review boundary', () => {
    expect(qaDoc).toContain('390x844 / 430x932 / 768x1024 / 1280x900')
    expect(qaDoc).toContain('JavaScript 無効時は form を非表示')
    expect(qaDoc).toContain('AI は同意後だけ')
    expect(qaDoc).toContain('Do Not Publish Without Human Review')
    expect(qaDoc).toContain('zero data retention')
    expect(qaDoc).toContain('Human Review Questions')
    expect(qaDoc).toContain('機械 QA は pass')
  })

  it('keeps ISSUE-075 blocked until human review resolves trust copy', () => {
    expect(issueSource).toContain('status: blocked')
    expect(issueSource).toContain('公開 copy の privacy / legal review')
    expect(issueSource).toContain('- [ ] privacy / legal review 済みの trust copy')
  })
})
