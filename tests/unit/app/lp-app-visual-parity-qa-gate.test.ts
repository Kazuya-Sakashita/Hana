import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(
  new URL('../../../scripts/qa/issue-082-lp-app-visual-parity-contract.cjs', import.meta.url),
)
const qaDoc = readFileSync(
  new URL('../../../docs/design/lp-app-visual-parity-qa.md', import.meta.url),
  'utf8',
)
const qaV2Doc = readFileSync(
  new URL('../../../docs/design/product-design-qa-v2.md', import.meta.url),
  'utf8',
)
const designReadme = readFileSync(
  new URL('../../../docs/design/README.md', import.meta.url),
  'utf8',
)
const packageSource = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
const scriptSource = readFileSync(
  new URL('../../../scripts/qa/issue-082-lp-app-visual-parity-contract.cjs', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-082-lp-app-visual-parity-qa-gate.md', import.meta.url),
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
  required_files: string[]
  design_docs: { id: string; file: string; checks: number }[]
  source_contracts: { id: string; file: string; checks: number }[]
  visual_system_contracts: { id: string; file: string; checks: number }[]
  screen_matrix: { id: string; states: string[]; viewports: string[] }[]
  checks: string[]
  unsafe_claim_guard: { source_files: string[]; blocked_claims: number }
}

describe('ISSUE-082 LP-App visual parity QA gate', () => {
  it('runs a read-only contract gate for LP-App visual parity', () => {
    expect(contract).toMatchObject({
      issue: 'ISSUE-082',
      mode: 'contract',
      result: 'pass',
    })
    expect(packageSource).toContain('qa:issue082:lp-app-visual-parity')
    expect(packageSource).toContain('pnpm qa:issue082:lp-app-visual-parity -- --mode=contract')
    expect(contract.artifact_policy).toContain('read-only')
    expect(contract.artifact_policy).toContain('no screenshot')
    expect(scriptSource).not.toContain('writeFile')
    expect(scriptSource).not.toContain('.screenshot(')
    expect(scriptSource).not.toContain('accessibility.snapshot')
    expect(scriptSource).not.toContain('createWriteStream')
  })

  it('keeps LP artifact and app surface bridge files in scope', () => {
    expect(contract.required_files).toEqual(
      expect.arrayContaining([
        'docs/design/artifacts/current-lp/index.html',
        'docs/design/artifacts/current-lp/hana-quiet-heirloom-concept-lp.webp',
        'src/app/page.tsx',
        'src/app/record/page.tsx',
        'src/app/album/page.tsx',
        'src/app/memory/[memoryId]/page.tsx',
        'src/app/sign-in/page.tsx',
        'src/app/onboarding/page.tsx',
        'src/app/settings/page.tsx',
        'src/app/globals.css',
        'src/components/ui/button.tsx',
        'src/components/product/surfaces.tsx',
        'src/components/product/icons.tsx',
      ]),
    )

    expect(contract.source_contracts.map((surface) => surface.id)).toEqual(
      expect.arrayContaining([
        'home',
        'record',
        'album',
        'memory-detail',
        'memory-actions',
        'sign-in',
        'onboarding',
        'settings',
        'surfaces',
        'icons',
      ]),
    )
  })

  it('asserts implemented tokens, sage pill buttons, surfaces, and quiet icon language', () => {
    expect(contract.visual_system_contracts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'design-tokens',
          file: 'src/app/globals.css',
        }),
        expect.objectContaining({
          id: 'sage-pill-button',
          file: 'src/components/ui/button.tsx',
        }),
        expect.objectContaining({
          id: 'keepsake-surfaces',
          file: 'src/components/product/surfaces.tsx',
        }),
        expect.objectContaining({
          id: 'quiet-icon-language',
          file: 'src/components/product/icons.tsx',
        }),
      ]),
    )
    expect(scriptSource).toContain('--success-leaf: #5f6c57')
    expect(scriptSource).toContain('--radius-photo-mat: 1rem')
    expect(scriptSource).toContain('rounded-full bg-primary text-primary-foreground shadow-soft')
    expect(scriptSource).toContain('photo-mat rounded-[var(--radius-photo-mat)] p-2')
    expect(scriptSource).toContain('strokeWidth={active ? 1.9 : iconStrokeWidth[size]}')
    expect(scriptSource).toContain('tap-target inline-flex size-11')
  })

  it('documents the screenshot matrix, evaluation framework, and evidence safety policy', () => {
    expect(contract.screen_matrix.map((target) => target.id)).toEqual([
      'lp',
      'home',
      'record',
      'album',
      'memory-detail',
      'entry-settings',
    ])
    expect(contract.screen_matrix.find((target) => target.id === 'lp')?.viewports).toContain(
      '1280x900',
    )
    expect(contract.screen_matrix.find((target) => target.id === 'record')?.states).toContain(
      'ai-consent',
    )

    expect(contract.checks).toEqual(
      expect.arrayContaining([
        'token-parity',
        'surface-parity',
        'icon-parity',
        'cta-parity',
        'accessibility-targets',
        'contrast',
        'evidence-safety',
        'trust-copy',
        'read-only-artifact-policy',
      ]),
    )
    expect(qaDoc).toContain('Evaluation Framework')
    expect(qaDoc).toContain('Concept fit')
    expect(qaDoc).toContain('Visual system')
    expect(qaDoc).toContain('Trust safety')
    expect(qaDoc).toContain('実写真、子ども / 親の実名、生年月日、メール')
    expect(qaDoc).toContain('画像 URL、signed URL、`storage_key`、prompt、AI 生成本文')
  })

  it('connects ISSUE-082 to design docs and PR gate documentation', () => {
    expect(contract.design_docs.map((doc) => doc.id)).toEqual(
      expect.arrayContaining([
        'lp-app-visual-parity-qa',
        'lp-app-visual-grammar',
        'product-design-qa-v2',
      ]),
    )
    expect(qaV2Doc).toContain('ISSUE-082')
    expect(qaV2Doc).toContain('qa:issue082:lp-app-visual-parity')
    expect(designReadme).toContain('lp-app-visual-parity-qa.md')
  })

  it('guards active UI copy against unreviewed trust claims', () => {
    expect(contract.unsafe_claim_guard.source_files).toEqual(
      expect.arrayContaining([
        'src/app/sign-in/page.tsx',
        'src/app/onboarding/page.tsx',
        'src/app/settings/page.tsx',
        'src/lib/ui/settings-trust-center-copy.ts',
      ]),
    )
    expect(contract.unsafe_claim_guard.blocked_claims).toBeGreaterThanOrEqual(8)
    expect(issueSource).toContain('github_issue: 183')
    expect(issueSource).toMatch(/status: (in_progress|review|done)/)
    expect(issueSource).toContain('read-only contract')
    expect(issueSource).toContain('専門サブエージェント 3 名')
  })
})
