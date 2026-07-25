import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lpHtml = readFileSync(
  new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url),
  'utf8',
)
const evaluation = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-074-lp-hero-keepsake-composition.md', import.meta.url),
  'utf8',
)

const heroStart = lpHtml.indexOf('<section class="hero"')
const valueStart = lpHtml.indexOf('<section id="value"')
const heroSection = lpHtml.slice(heroStart, valueStart)

describe('ISSUE-074 LP hero keepsake composition', () => {
  it('uses a single keepsake preview as the hero visual anchor', () => {
    expect(heroSection).toContain('data-testid="hero-keepsake-anchor"')
    expect(heroSection).toContain('class="hero-keepsake"')
    expect(heroSection).toContain('hana-before-after-safe-still-life.svg')
    expect(heroSection).toContain('保存されたページ')
    expect(heroSection).toContain('洗濯ものをたたむ前')
    expect(heroSection).not.toContain('phone-cluster')
    expect(heroSection).not.toMatch(/class="phone\b/)
    expect(heroSection).not.toContain('trust-row')
  })

  it('limits the hero action model to one primary and one secondary CTA', () => {
    const heroActionsStart = heroSection.indexOf('<div class="hero-actions">')
    const heroActionsEnd = heroSection.indexOf('</div>', heroActionsStart)
    const heroActions = heroSection.slice(heroActionsStart, heroActionsEnd)

    expect(heroActions.match(/class="button button-primary"/g) ?? []).toHaveLength(1)
    expect(heroActions.match(/class="button button-ghost"/g) ?? []).toHaveLength(1)
    expect(heroSection).not.toContain('class="store-row"')
    expect(heroSection).toContain('class="hero-trust-note"')
  })

  it('keeps explicit responsive safeguards for 390, 430, 768, and 1280px review', () => {
    expect(lpHtml).toContain('grid-template-columns: minmax(0, 0.82fr) minmax(300px, 0.68fr)')
    expect(lpHtml).toContain('@media (max-width: 920px)')
    expect(lpHtml).toContain('@media (max-width: 640px)')
    expect(lpHtml).toContain('max-width: min(100%, 520px)')
    expect(lpHtml).toContain('.hero-actions .button')
    expect(lpHtml).toContain('flex: 1 1 100%')
    expect(heroSection).not.toContain('hero-keepsake-flower')
    expect(lpHtml).not.toMatch(/lottie|neon|isometric|dashboard|floating card|gradient orb/i)
  })

  it('records the issue status, acceptance evidence, and LP evaluation update', () => {
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('github_issue: 165')
    expect(issueSource).toContain('- [x] Hero の主役が 1 つに絞られている')
    expect(issueSource).toContain('- [x] 390 / 430 / 768 / 1280px')
    expect(issueSource).toContain('- [x] Visual Art Direction review')
    expect(issueSource).toContain('- [x] Accessibility review')
    expect(issueSource).toContain('Visual Art Direction / Quiet Heirloom')
    expect(issueSource).toContain('Accessibility / Responsive Frontend')
    expect(issueSource).toContain('Brand / AI Slop Blacklist')

    expect(evaluation).toContain('ISSUE-074')
    expect(evaluation).toContain('LP-P1-01')
    expect(evaluation).toContain('対応済み')
    expect(evaluation).toContain('Hero の主役を単一の keepsake preview')
  })
})
