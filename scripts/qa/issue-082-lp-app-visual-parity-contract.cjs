const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const issue = 'ISSUE-082'
const repoRoot = process.cwd()

const requiredFiles = [
  'docs/design/artifacts/current-lp/index.html',
  'docs/design/artifacts/current-lp/hana-quiet-heirloom-concept-lp.webp',
  'docs/design/lp-app-visual-grammar.md',
  'docs/design/lp-app-visual-parity-qa.md',
  'docs/design/product-design-qa-v2.md',
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
]

const designDocContracts = [
  {
    id: 'lp-app-visual-parity-qa',
    file: 'docs/design/lp-app-visual-parity-qa.md',
    needles: [
      'Gate Policy',
      'Screenshot Matrix',
      'CI Contract',
      'Evidence Policy',
      'token parity',
      'surface parity',
      'icon parity',
      'contrast',
      'tap target',
      'trust copy',
      'read-only',
      'PhotoMat',
      'PaperSlip',
      'QuietIcon',
      'QuietIconButton',
    ],
  },
  {
    id: 'lp-app-visual-grammar',
    file: 'docs/design/lp-app-visual-grammar.md',
    needles: ['ISSUE-082', 'screenshot matrix', 'contrast', 'tap target', 'evidence safety'],
  },
  {
    id: 'product-design-qa-v2',
    file: 'docs/design/product-design-qa-v2.md',
    needles: ['ISSUE-082', 'qa:issue082:lp-app-visual-parity', 'LP-App visual parity'],
  },
]

const sourceContracts = [
  {
    id: 'home',
    file: 'src/app/page.tsx',
    needles: ['id="home-primary-action"', 'data-testid="home-first-view-photo-mat"'],
  },
  {
    id: 'record',
    file: 'src/app/record/page.tsx',
    needles: ['data-testid="record-bottom-sheet"', 'PhotoMat', 'PaperSlip', 'QuietIcon'],
  },
  {
    id: 'album',
    file: 'src/features/memories/client/album-list.tsx',
    needles: ['data-testid="album-shelf-heading"', 'QuietIconButton', 'BookOpen'],
  },
  {
    id: 'memory-detail',
    file: 'src/app/memory/[memoryId]/page.tsx',
    needles: ['data-testid="memory-saved-notice"', 'PaperSlip', 'QuietIcon'],
  },
  {
    id: 'memory-actions',
    file: 'src/components/memory-actions.tsx',
    needles: ['QuietIconButton', 'aria-describedby="memory-edit-note"', 'Trash2'],
  },
  {
    id: 'sign-in',
    file: 'src/app/sign-in/page.tsx',
    needles: ['data-testid="signin-trust-bridge"', 'QuietIcon', 'ShieldCheck'],
  },
  {
    id: 'onboarding',
    file: 'src/app/onboarding/page.tsx',
    needles: ['data-testid="onboarding-trust-bridge"', 'QuietIcon', 'ShieldCheck'],
  },
  {
    id: 'settings',
    file: 'src/app/settings/page.tsx',
    needles: ['data-testid="settings-trust-overview"', 'TrustSection'],
  },
  {
    id: 'surfaces',
    file: 'src/components/product/surfaces.tsx',
    needles: [
      'export function PhotoMat',
      'export function PaperSlip',
      'export function TrustSection',
    ],
  },
  {
    id: 'icons',
    file: 'src/components/product/icons.tsx',
    needles: ['export function QuietIcon', 'export function QuietIconButton', 'strokeWidth'],
  },
]

const visualSystemContracts = [
  {
    id: 'design-tokens',
    file: 'src/app/globals.css',
    needles: [
      '--bg-canvas: #fbf7f2',
      '--bg-paper-slip: #fffdf9',
      '--bg-photo-mat: #f8f1e8',
      '--success-leaf: #5f6c57',
      '--success-leaf-deep: #4d5a47',
      '--accent-sakura: #c57a83',
      '--shadow-soft:',
      '--radius-photo-inner: 0.75rem',
      '--radius-photo-mat: 1rem',
      '--radius-paper-slip: 1.125rem',
      '--radius-sheet: 1.5rem',
      '.paper-surface',
      'background: var(--bg-paper-slip)',
      '.photo-mat',
      'background: var(--bg-photo-mat)',
      '.tap-target',
      'min-height: 44px',
      'min-width: 44px',
    ],
  },
  {
    id: 'sage-pill-button',
    file: 'src/components/ui/button.tsx',
    needles: [
      'ease-organic tap-target inline-flex',
      'rounded-full bg-primary text-primary-foreground shadow-soft',
      'hover:bg-leaf-deep hover:text-white',
      'active:bg-leaf-deep active:text-white',
      "lg: 'h-12 px-8 text-base'",
      "icon: 'size-11 rounded-full'",
    ],
  },
  {
    id: 'keepsake-surfaces',
    file: 'src/components/product/surfaces.tsx',
    needles: [
      'paper-surface rounded-[var(--radius-paper-slip)]',
      'photo-mat rounded-[var(--radius-photo-mat)] p-2',
      'rounded-[var(--radius-photo-inner)] bg-paper-slip',
      'inline-flex size-11 shrink-0 items-center justify-center rounded-full',
      '<QuietIcon icon={icon} tone={iconTone} />',
    ],
  },
  {
    id: 'quiet-icon-language',
    file: 'src/components/product/icons.tsx',
    needles: [
      "primary: 'text-leaf-deep dark:text-leaf'",
      'const iconStrokeWidth',
      'sm: 1.75',
      'md: 1.75',
      'lg: 1.65',
      'display: 1.55',
      'strokeWidth={active ? 1.9 : iconStrokeWidth[size]}',
      "tone === 'favorite' && active ? 'currentColor' : 'none'",
      'ease-organic tap-target inline-flex size-11 shrink-0 items-center justify-center rounded-full border shadow-soft',
      'border-leaf/30 bg-primary text-primary-foreground',
    ],
  },
]

const activeUiSourceFiles = [
  'src/app/page.tsx',
  'src/app/record/page.tsx',
  'src/app/album/page.tsx',
  'src/app/memory/[memoryId]/page.tsx',
  'src/app/sign-in/page.tsx',
  'src/app/onboarding/page.tsx',
  'src/app/settings/page.tsx',
  'src/components/memory-actions.tsx',
  'src/features/memories/client/album-list.tsx',
  'src/lib/ui/settings-trust-center-copy.ts',
]

const unsafeActiveClaims = [
  'zero data retention',
  '完全に削除されます',
  '復元できます',
  '近日対応',
  'ちかぢか',
  'Apple での サインイン',
  'Storeからダウンロード',
  '通常30日以内に削除されます',
  '人間のレビュー',
]

const screenMatrix = [
  {
    id: 'lp',
    states: ['hero', 'before-after', 'product-preview', 'trust-final-cta'],
    viewports: ['390x844', '430x932', '768x1024', '1280x900'],
  },
  {
    id: 'home',
    states: ['empty', 'one-memory', 'five-memories', 'long-child-name'],
    viewports: ['390x640', '390x844', '430x932', '768x1024'],
  },
  {
    id: 'record',
    states: [
      'empty',
      'photo-selected',
      'ai-consent',
      'generating',
      'manual-save-ready',
      'save-ready',
      'error',
    ],
    viewports: ['390x640', '390x844', '430x932'],
  },
  {
    id: 'album',
    states: ['empty', 'featured-shelf', 'long-title-body', 'load-more-end'],
    viewports: ['390x844', '430x932', '768x1024'],
  },
  {
    id: 'memory-detail',
    states: ['saved-notice', 'normal', 'long-body', 'additional-photos'],
    viewports: ['390x844', '430x932'],
  },
  {
    id: 'entry-settings',
    states: ['auth-entry', 'first-memory-bridge', 'trust-surface'],
    viewports: ['390x844', '430x932'],
  },
]

const checks = [
  'token-parity',
  'surface-parity',
  'icon-parity',
  'cta-parity',
  'accessibility-targets',
  'contrast',
  'evidence-safety',
  'trust-copy',
  'read-only-artifact-policy',
]

function argValue(name, fallback) {
  const exact = process.argv.find((arg) => arg === name)
  if (exact) return true
  const prefix = `${name}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length) : fallback
}

function readRepoFile(relativePath) {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

function assertRequiredFilesExist() {
  for (const relativePath of requiredFiles) {
    if (!existsSync(join(repoRoot, relativePath))) {
      throw new Error(`missing_required_file:${relativePath}`)
    }
  }
}

function assertNeedles(contracts) {
  for (const contract of contracts) {
    const source = readRepoFile(contract.file)
    for (const needle of contract.needles) {
      if (!source.includes(needle)) {
        throw new Error(`missing_contract:${contract.id}:${needle}`)
      }
    }
  }
}

function assertNoUnsafeActiveClaims() {
  const failures = []
  for (const relativePath of activeUiSourceFiles) {
    const source = readRepoFile(relativePath)
    for (const claim of unsafeActiveClaims) {
      if (source.includes(claim)) {
        failures.push(`${relativePath}:${claim}`)
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `unsafe_active_claim:${failures.map((failure) => failure.split(':')[0]).join(',')}`,
    )
  }
}

function assertContract() {
  assertRequiredFilesExist()
  assertNeedles(designDocContracts)
  assertNeedles(sourceContracts)
  assertNeedles(visualSystemContracts)
  assertNoUnsafeActiveClaims()

  return {
    issue,
    mode: 'contract',
    result: 'pass',
    artifact_policy:
      'read-only: no screenshot, accessibility snapshot, manifest, or QA evidence file is written',
    required_files: requiredFiles,
    design_docs: designDocContracts.map((contract) => ({
      id: contract.id,
      file: contract.file,
      checks: contract.needles.length,
    })),
    source_contracts: sourceContracts.map((contract) => ({
      id: contract.id,
      file: contract.file,
      checks: contract.needles.length,
    })),
    visual_system_contracts: visualSystemContracts.map((contract) => ({
      id: contract.id,
      file: contract.file,
      checks: contract.needles.length,
    })),
    screen_matrix: screenMatrix,
    checks,
    unsafe_claim_guard: {
      source_files: activeUiSourceFiles,
      blocked_claims: unsafeActiveClaims.length,
    },
  }
}

function safeFailureMessage(error) {
  const message = error instanceof Error ? error.message : 'unknown_failure'
  const firstLine = message.split('\n')[0] ?? 'unknown_failure'
  const hasRiskyContent =
    /https?:\/\/|storage[_-]?key|presigned|prompt|email|birthdate|@|本文|生成本文|画像 URL/i.test(
      firstLine,
    )
  return hasRiskyContent ? 'redacted_failure' : firstLine
}

function main() {
  const mode = argValue('--mode', 'contract')
  if (mode !== 'contract') throw new Error('unsupported_mode')
  console.log(JSON.stringify(assertContract(), null, 2))
}

try {
  main()
} catch (error) {
  console.error(
    JSON.stringify(
      {
        issue,
        result: 'fail',
        error: safeFailureMessage(error),
        evidence: 'redacted-failure-output',
      },
      null,
      2,
    ),
  )
  process.exit(1)
}
