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
  no_js_fallback: {
    path: string
    viewport: { id: string; width: number; height: number }
    requiredSelectors: string[]
    hiddenSelectors: string[]
  }
  viewports: { id: string; width: number; height: number }[]
  interactive_selector: string
  ignored_interactive_selector: string
  checks: string[]
}

const scriptSource = readFileSync(scriptPath, 'utf8')
const qaDoc = readFileSync(
  new URL('../../../docs/design/lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)
const lpLoadingSource = readFileSync(
  new URL('../../../src/app/lp/loading.tsx', import.meta.url),
  'utf8',
)
const waitlistFormSource = readFileSync(
  new URL('../../../src/components/waitlist-signup-form.tsx', import.meta.url),
  'utf8',
)
const privacySource = readFileSync(
  new URL('../../../src/app/privacy/page.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-075-lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)
const issue086Source = readFileSync(
  new URL('../../../docs/issues/ISSUE-086-public-surface-visual-qa-gate.md', import.meta.url),
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
        requiredSelectors: [
          '[data-public-lp="waitlist"]',
          '[data-lp-keepsake-journey="photo-to-memory"]',
          '[data-lp-trust-bridge="waitlist"]',
          '#waitlist-form',
          '#waitlist-purpose',
          'a[href="/privacy"]',
        ],
      },
      {
        id: 'privacy',
        path: '/privacy',
        requiredSelectors: [
          '[data-public-privacy="waitlist"]',
          '[data-public-privacy-summary="waitlist"]',
          '[data-public-privacy-details="waitlist"]',
          '[data-public-privacy-footer="waitlist"]',
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
    expect(contract.ignored_interactive_selector).toContain('Open Next.js Dev Tools')
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
    expect(contract.no_js_fallback).toMatchObject({
      path: '/lp',
      viewport: { width: 390, height: 844 },
      requiredSelectors: [
        '[data-public-lp="waitlist"]',
        '[data-public-lp-fallback="no-js-shell"]',
        'text=待機リスト登録には JavaScript が必要です',
        'a[href="/privacy"]',
      ],
      hiddenSelectors: ['#waitlist-form'],
    })
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
    expect(scriptSource).toContain('data-waitlist-accepted-guidance="prelaunch"')
    expect(scriptSource).toContain('waitlist_guidance_copy_missing')
    expect(scriptSource).toContain('waitlist_guidance_contact_missing')
  })

  it('anchors the public warmth selectors in the actual public routes', () => {
    expect(lpLoadingSource).toContain('data-public-lp-fallback="no-js-shell"')
    expect(lpLoadingSource).toContain('待機リスト登録には JavaScript が必要です')
    expect(lpLoadingSource).toContain('href="/privacy"')
    expect(privacySource).toContain('data-public-privacy-summary="waitlist"')
    expect(privacySource).toContain('data-public-privacy-details="waitlist"')
    expect(privacySource).toContain('data-public-privacy-footer="waitlist"')
    expect(waitlistFormSource).toContain('data-waitlist-accepted-guidance="prelaunch"')
    expect(waitlistFormSource).toContain('任意のインタビューやフィードバック協力のお願い')
    expect(waitlistFormSource).toContain('案内停止や登録情報の削除を希望する場合')
  })

  it('records machine QA evidence and the human trust review boundary', () => {
    expect(qaDoc).toContain('390x844 / 430x932 / 768x1024 / 1280x900')
    expect(qaDoc).toContain('data-public-lp-fallback="no-js-shell"')
    expect(qaDoc).toContain('Next DevTools の 32px button')
    expect(qaDoc).toContain('AI は同意後だけ')
    expect(qaDoc).toContain('Human Review Result')
    expect(qaDoc).toContain('privacy@hana.app')
    expect(qaDoc).toContain('Do Not Add As Claims Without Final Review')
    expect(qaDoc).toContain('zero data retention')
    expect(qaDoc).toContain('機械 QA と human review は pass')
  })

  it('records ISSUE-075 human review clearance without adding unsafe claims', () => {
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('external_blockers: []')
    expect(issueSource).toContain('- [x] privacy / legal review 済みの trust copy')
    expect(issueSource).toContain('Privacy / Legal Human Review 済み')
    expect(issueSource).toContain('privacy@hana.app')
    expect(issue086Source).toContain('status: done')
    expect(issue086Source).toContain('visual 改善が `ISSUE-075`')
  })
})
