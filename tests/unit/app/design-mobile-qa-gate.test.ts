import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const gateReport = readFileSync(
  new URL('../../../docs/design/design-mobile-qa-review-gate.md', import.meta.url),
  'utf8',
)
const gateScript = readFileSync(
  new URL('../../../scripts/qa/issue-059-design-mobile-gate.cjs', import.meta.url),
  'utf8',
)
const recordStopwatchScript = readFileSync(
  new URL('../../../scripts/qa/issue-059-record-stopwatch.cjs', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-059-design-mobile-qa-review-gate.md', import.meta.url),
  'utf8',
)
const canonSource = readFileSync(
  new URL('../../../docs/design/quiet-heirloom-design-canon.md', import.meta.url),
  'utf8',
)
const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const albumPageSource = readFileSync(
  new URL('../../../src/app/album/page.tsx', import.meta.url),
  'utf8',
)
const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const memoryDetailSource = readFileSync(
  new URL('../../../src/app/memory/[memoryId]/page.tsx', import.meta.url),
  'utf8',
)
const manifest = JSON.parse(
  readFileSync(
    new URL(
      '../../../docs/design/artifacts/issue-059-mobile-gate/design-mobile-gate-manifest.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  generator: string
  generator_sha256: string
  scenarios: string[]
  artifacts: { path: string; sha256: string }[]
}
const recordStopwatchResults = JSON.parse(
  readFileSync(
    new URL(
      '../../../docs/design/artifacts/issue-059-mobile-gate/record-stopwatch-results.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  issue: string
  app_surface: string
  evidence: string
  result: string
  rows: {
    name: string
    start: string
    finish: string
    target: string
    elapsed_ms: number | null
    reached: string
    result: string
    artifact?: string
    dialog_initial_focus?: string
    initial_tab_order: string[]
  }[]
}

const artifactPaths = [
  '../../../docs/design/artifacts/issue-059-mobile-gate/record-core-ai-390x844.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/record-ai-skip-ready-390x844.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/record-ai-skip-manual-390x844.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/record-first-consent-430x932.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/home-empty-390x844.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/album-shelf-390x844.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/memory-detail-430x932.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/tablet-release-768x1024.png',
  '../../../docs/design/artifacts/issue-059-mobile-gate/desktop-release-1280x900.png',
]

const evidenceSources = {
  gateReport,
  issueSource,
  recordStopwatchResults: JSON.stringify(recordStopwatchResults),
}

function sha256(url: URL) {
  return createHash('sha256').update(readFileSync(url)).digest('hex')
}

function expectNoEvidenceLeaks() {
  const forbiddenPatterns = [
    /https?:\/\/(?!(?:hana\.app\/problems\/|localhost:|127\.0\.0\.1:))[^\s)`]+/i,
    /uploads\/[A-Za-z0-9_-]+\/\d{6}\/[0-9a-f-]+\.(jpg|jpeg|png|webp|heic)/i,
    /storage_key\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /previewUrl\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /presigned_url\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /prompt\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /\bbirthdate\s*[:=]\s*['"`][^'"`]+['"`]/i,
    /(?:生年月日|誕生日)\s*[:：]\s*(?:19|20)\d{2}/,
    /\b(?:full_name|fullName|surname|last_name|lastName)\s*[:=]\s*['"`][^'"`]+['"`]/,
  ]
  const aiBodyFragments = [
    'やわらかい' + '光',
    '今日も' + '元気',
    'ちいさな' + '手',
    '公園に' + '行きました',
  ]

  for (const [name, source] of Object.entries(evidenceSources)) {
    for (const pattern of forbiddenPatterns) {
      expect(source, `${name} should not leak evidence matching ${pattern}`).not.toMatch(pattern)
    }
    for (const fragment of aiBodyFragments) {
      expect(source, `${name} should not leak AI body-like fragment`).not.toContain(fragment)
    }
  }
}

describe('ISSUE-059 design mobile QA gate', () => {
  it('keeps the 30-second path contract aligned with the Quiet Heirloom canon', () => {
    const contracts = [
      [
        'core AI path',
        '既存同意済みユーザーが写真 1 枚を選択した時点',
        '保存完了 feedback または album 遷移',
        '30 秒以内',
      ],
      [
        'AI skip / manual save path',
        '写真 1 枚を選択した時点',
        '保存完了 feedback または album 遷移',
        '30 秒以内',
      ],
      [
        'first consent path',
        'AI 同意 dialog が表示された時点',
        '同意または skip 後に保存可能な状態',
        '60 秒以内',
      ],
    ]

    for (const [name, start, finish, target] of contracts) {
      expect(canonSource).toContain(name)
      expect(canonSource).toContain(start)
      expect(canonSource).toContain(finish)
      expect(canonSource).toContain(target)
      expect(gateReport).toContain(name)
      expect(gateReport).toContain(start)
      expect(gateReport).toContain(finish)
      expect(recordStopwatchResults.rows.find((row) => row.name === name)).toMatchObject({
        start,
        finish,
        target,
        result: 'pass',
      })
    }
    expect(gateScript).toContain('flowContracts')
  })

  it('records an automated mobile screenshot gate with accessibility and privacy checks', () => {
    expect(gateScript).toContain("issue: 'ISSUE-059'")
    expect(gateScript).toContain("evidence: 'synthetic-only'")
    expect(gateScript).toContain('assertTapTargets')
    expect(gateScript).toContain('assertTextDoesNotOverflow')
    expect(gateScript).toContain('assertRecordThumbZone')
    expect(gateScript).toContain('assertContrastSamples')
    expect(gateScript).toContain('assertEvidenceSafety')
    expect(gateScript).toContain('[A-Z0-9._%+-]+@[A-Z0-9.-]+')
    expect(gateScript).toContain('birthdate')
    expect(gateScript).toContain('full_name')
    expect(gateScript).toContain('山田|佐藤|鈴木|田中')
    expect(gateScript).toContain('prefers-reduced-motion')
    expect(recordStopwatchScript).toContain('assertDialogInitialFocus')
    expect(recordStopwatchScript).toContain('assertInputNotOccluded')
    expect(recordStopwatchScript).toContain('assertRecordPrimaryInLower35')
    expect(recordStopwatchScript).toContain("document.activeElement?.id === 'ai-consent-decline'")
    expect(gateReport).toContain('390px / 430px / 768px / desktop')
    expect(gateReport).toContain('guilt / pressure / feed copy')
    expect(gateReport).toContain('reduced motion')
    expectNoEvidenceLeaks()
  })

  it('makes AI consent copy explicit without implying birthdate or full-name transfer', () => {
    expect(gateScript).toContain('写真、呼び名、計算済みの月齢など必要なものだけ')
    expect(gateScript).toContain('名字、フルネーム、メール、住所、生年月日は送らない')
    expect(gateScript).not.toContain('写真、名前、月齢など必要なものだけ')
  })

  it('binds the release gate to the real app surfaces instead of only standalone HTML', () => {
    expect(recordSource).toContain('data-testid="record-bottom-sheet"')
    expect(recordSource).toContain('sticky bottom-0')
    expect(recordSource).toContain('max-h-[68dvh]')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-footer"')
    expect(recordSource).toContain('pb-[calc(env(safe-area-inset-bottom)+1rem)]')
    expect(recordSource).toContain('tabIndex={-1}')
    expect(recordSource).toContain('function focusManualTitle()')
    expect(recordSource).toContain('titleInputRef.current?.focus()')
    expect(recordSource).toContain('initialFocusId="ai-consent-decline"')
    expect(recordSource).toContain('motion-safe:animate-pulse')
    expect(recordSource).toContain('AI_CONSENT_NOT_SENT_COPY')
    expect(homeSource).toContain('写真からページをつくる')
    expect(albumPageSource).toContain('しまってあるページ')
    expect(albumListSource).toContain('paper-surface')
    expect(memoryDetailSource).toContain('alt="記録のしゃしん"')
  })

  it('records fresh app-backed /record stopwatch evidence for ISSUE-059', () => {
    expect(recordStopwatchResults).toMatchObject({
      issue: 'ISSUE-059',
      evidence: 'synthetic-only',
      app_surface: '/record',
      result: 'pass',
    })

    const core = recordStopwatchResults.rows.find((row) => row.name === 'core AI path')
    const manual = recordStopwatchResults.rows.find(
      (row) => row.name === 'AI skip / manual save path',
    )
    const consent = recordStopwatchResults.rows.find((row) => row.name === 'first consent path')
    const manualScreenshot = recordStopwatchResults.rows.find(
      (row) => row.name === 'AI skip manual screenshot',
    )
    expect(core?.elapsed_ms).toBeLessThanOrEqual(30_000)
    expect(core?.reached).toBe('/album')
    expect(manual?.elapsed_ms).toBeLessThanOrEqual(30_000)
    expect(manual?.reached).toBe('/album')
    expect(consent?.elapsed_ms).toBeLessThanOrEqual(60_000)
    expect(consent?.dialog_initial_focus).toBe('ai-consent-decline')
    expect(manualScreenshot?.artifact).toBe(
      'docs/design/artifacts/issue-059-mobile-gate/record-ai-skip-manual-390x844.png',
    )
    for (const row of recordStopwatchResults.rows) {
      expect(row.initial_tab_order).toContain('やめて とじる')
      expect(row.initial_tab_order).toContain('しゃしんを えらぶ')
    }
  })

  it('keeps rubric thresholds high enough for a release Go judgment', () => {
    expect(gateReport).toContain('| Task Success / 30秒記録       | 4')
    expect(gateReport).toContain('| Privacy Trust                 | 4')
    expect(gateReport).toContain('| Accessibility / Mobile        | 3')
    expect(gateReport).toContain('No-Go blocker なし')
    expect(gateReport).toContain('ISSUE-041')
    if (/\|\s*2\s*\|\s*Product UX \/ 30秒記録\s*\|\s*pending\s*\|/.test(gateReport)) {
      expect(gateReport).toContain('Go / Hold / No-Go: Hold')
    } else {
      expect(gateReport).toContain('Go / Hold / No-Go: Go')
    }
  })

  it('stores synthetic screenshot artifacts for all required viewport classes', () => {
    expect(gateReport).toContain('record-core-ai-390x844.png')
    expect(gateReport).toContain('record-ai-skip-ready-390x844.png')
    expect(gateReport).toContain('record-ai-skip-manual-390x844.png')
    expect(gateReport).toContain('record-first-consent-430x932.png')
    expect(gateReport).toContain('tablet-release-768x1024.png')
    expect(gateReport).toContain('desktop-release-1280x900.png')

    for (const artifactPath of artifactPaths) {
      const url = new URL(artifactPath, import.meta.url)
      expect(existsSync(url), `${artifactPath} should exist`).toBe(true)
      expect(statSync(url).size, `${artifactPath} should not be empty`).toBeGreaterThan(1000)
    }
  })

  it('keeps screenshot artifacts tied to the current generator manifest', () => {
    expect(manifest.generator).toBe('scripts/qa/issue-059-design-mobile-gate.cjs')
    expect(manifest.generator_sha256).toBe(
      sha256(new URL('../../../scripts/qa/issue-059-design-mobile-gate.cjs', import.meta.url)),
    )
    expect(manifest.scenarios).toContain('record-ai-skip-ready-390x844')

    for (const artifact of manifest.artifacts) {
      const url = new URL(`../../../${artifact.path}`, import.meta.url)
      expect(existsSync(url), `${artifact.path} should exist`).toBe(true)
      expect(sha256(url), `${artifact.path} should match manifest`).toBe(artifact.sha256)
    }
  })
})
