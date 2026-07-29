import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-064-design-dom-smoke.cjs', import.meta.url),
)
const qaDoc = readFileSync(
  new URL('../../../docs/design/product-design-qa-v2.md', import.meta.url),
  'utf8',
)
const qaReadme = readFileSync(new URL('../../../docs/design/README.md', import.meta.url), 'utf8')
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const scriptSource = readFileSync(
  new URL('../../../scripts/qa/issue-064-design-dom-smoke.cjs', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-064-product-design-qa-v2.md', import.meta.url),
  'utf8',
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
  target_surfaces: {
    id: string
    path: string
    auth_required: boolean
    auth_mode: string
    required_selectors: string[]
  }[]
  viewports: { id: string; width: number; height: number }[]
  interactive_selector: string
  checks: string[]
}

describe('ISSUE-064 Product Design QA v2', () => {
  it('defines the required real-route DOM smoke targets', () => {
    expect(contract).toMatchObject({
      issue: 'ISSUE-064',
      mode: 'contract',
      result: 'pass',
    })

    const paths = contract.target_surfaces.map((surface) => surface.path)
    expect(paths).toContain('/')
    expect(paths).toContain('/record')
    expect(paths).toContain('/album')
    expect(paths).toContain('/memory/:memoryId?saved=1')
    expect(paths).toContain('/settings')
    expect(paths).toContain('/onboarding')

    expect(qaDoc).toContain('/memory/[memoryId]')
    expect(qaDoc).toContain('server session required')
    expect(qaDoc).toContain('synthetic client API mock')
    expect(qaDoc).toContain('production data ではなく synthetic QA account')

    expect(contract.target_surfaces.find((surface) => surface.id === 'home')).toMatchObject({
      auth_required: true,
      auth_mode: 'server-session',
      required_selectors: ['#home-primary-action'],
    })
    expect(contract.target_surfaces.find((surface) => surface.id === 'record')).toMatchObject({
      auth_required: true,
      auth_mode: 'client-api-mockable',
      required_selectors: ['[data-testid="record-bottom-sheet"]'],
    })
    expect(
      contract.target_surfaces.find((surface) => surface.id === 'memory-detail'),
    ).toMatchObject({
      auth_required: true,
      auth_mode: 'server-session',
      required_selectors: ['#memory-saved-moment-title', 'article'],
    })
  })

  it('covers compact, short-height, large-phone, and tablet DOM states', () => {
    expect(contract.viewports).toEqual([
      { id: 'compact-narrow', width: 320, height: 700 },
      { id: 'compact-short', width: 390, height: 640 },
      { id: 'compact-tall', width: 390, height: 844 },
      { id: 'large-phone', width: 430, height: 932 },
      { id: 'tablet', width: 768, height: 1024 },
    ])
    expect(qaDoc).toContain('AppShell')
    expect(qaDoc).toContain('FocusedShell')
  })

  it('checks interactive target, heading, focus, overflow, and reduced motion contracts', () => {
    expect(contract.interactive_selector).toContain('summary')
    expect(contract.interactive_selector).toContain('[role="button"]')
    expect(contract.interactive_selector).toContain('[tabindex]:not([tabindex="-1"])')
    expect(contract.interactive_selector).toContain('input:not([type="hidden"])')
    expect(contract.interactive_selector).toContain('textarea')
    expect(contract.interactive_selector).toContain('select')

    expect(contract.checks).toEqual(
      expect.arrayContaining([
        'heading-order',
        'tap-targets',
        'focus-order',
        'visible-focus',
        'horizontal-overflow',
        'reduced-motion',
        'pressure-copy',
        'redacted-evidence-output',
      ]),
    )
    expect(scriptSource).toContain('assertHeadingOrder')
    expect(scriptSource).toContain('assertTapTargets')
    expect(scriptSource).toContain('assertHorizontalOverflow')
    expect(scriptSource).toContain('assertVisibleFocus')
    expect(scriptSource).toContain('assertReducedMotion')
    expect(scriptSource).toContain('routeContracts')
    expect(scriptSource).toContain('expectedPathname')
    expect(scriptSource).toContain('requiredSelectors')
  })

  it('keeps the CI gate read-only and artifact-free', () => {
    expect(packageSource).toContain('qa:issue064:design-dom-smoke')
    expect(packageSource).toContain('pnpm qa:issue064:design-dom-smoke -- --mode=contract')
    expect(contract.artifact_policy).toContain('read-only')
    expect(contract.artifact_policy).toContain('no screenshot')
    expect(scriptSource).not.toContain('writeFileSync')
    expect(scriptSource).not.toContain('.screenshot(')
    expect(scriptSource).not.toContain('accessibility.snapshot')
    expect(scriptSource).not.toContain('textContent?.trim().slice')
    expect(scriptSource).not.toContain('textContent.trim().replace')
    expect(scriptSource).not.toContain('label:')
    expect(scriptSource).toContain('safeFailureMessage')
    expect(scriptSource).toContain('redacted-failure-output')
    expect(qaDoc).toContain('CI は artifact を上書きしない')
  })

  it('records evidence safety and manual snapshot boundaries', () => {
    expect(qaDoc).toContain('実写真、production account、画像 URL、signed URL')
    expect(qaDoc).toContain('`storage_key` 実値、prompt、AI 生成本文は保存しない')
    expect(qaDoc).toContain('redacted summary')
    expect(qaDoc).toContain('ISSUE-041')
    expect(qaDoc).toContain('未認証で `/sign-in` に redirect された場合')
    expect(qaDoc).toContain('404 / notFound の場合は')
    expect(qaDoc).toContain('CODEX_RUNTIME_NODE_MODULES=<node_modules-with-playwright>')
    expect(qaDoc).toContain('--surfaces=record,settings,onboarding')
    expect(qaReadme).toContain('product-design-qa-v2.md')
  })

  it('keeps ISSUE-064 at review or done only after the QA v2 acceptance criteria are covered', () => {
    expect(issueSource).toMatch(/status: (review|done)/)
    expect(issueSource).toContain('- [x] 実 DOM の design / a11y smoke が定義されている')
    expect(issueSource).toContain(
      '- [x] interactive target の対象に `summary`, `[role="button"]`, focusable element が含まれる',
    )
    expect(issueSource).toContain(
      '- [x] heading 階層、tap target、focus order、horizontal overflow を実 DOM で検査する',
    )
    expect(issueSource).toContain('- [x] CI で artifact を上書きしない read-only 検査になっている')
    expect(issueSource).toContain(
      '- [x] Evidence に PII / image URL / `storage_key` / prompt / AI 生成本文がない',
    )
  })
})
