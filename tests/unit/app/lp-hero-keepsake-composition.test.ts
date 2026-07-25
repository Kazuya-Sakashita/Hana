import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const lpHtmlUrl = new URL('../../../docs/design/artifacts/current-lp/index.html', import.meta.url)
const issueUrl = new URL(
  '../../../docs/issues/ISSUE-074-lp-hero-keepsake-composition.md',
  import.meta.url,
)
const evaluationUrl = new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url)

const lpHtml = readFileSync(lpHtmlUrl, 'utf8')
const issueSource = readFileSync(issueUrl, 'utf8')
const evaluation = readFileSync(evaluationUrl, 'utf8')

const heroSection = lpHtml.match(/<section class="hero"[\s\S]*?<\/section>/)?.[0] ?? ''
const heroCss =
  lpHtml.match(/\.hero \{[\s\S]*?@media \(prefers-reduced-motion: reduce\)/)?.[0] ?? ''
const heroTypeCss = [
  lpHtml.match(/\.hero h1 \{[\s\S]*?\n      \}/)?.[0] ?? '',
  lpHtml.match(/\.hero-line \{[\s\S]*?\n      \}/)?.[0] ?? '',
  lpHtml.match(/\.hero-body \{[\s\S]*?\n      \}/)?.[0] ?? '',
].join('\n')

describe('ISSUE-074 LP hero keepsake composition', () => {
  it('uses one keepsake preview as the hero visual anchor', () => {
    expect(heroSection).toContain('class="hero-keepsake"')
    expect(heroSection).toContain('class="hero-photo-mat"')
    expect(heroSection).toContain('class="hero-paper-slip"')
    expect(heroSection).toContain('hana-before-after-safe-still-life.svg')
    expect(heroSection).toContain('合成サンプル ・ 実データなし')
    expect(heroSection).not.toMatch(/phone-cluster|phone-notch|class="phone\b/)
    expect(heroSection).not.toContain('hana-quiet-heirloom-concept-lp.webp')
  })

  it('keeps hero conversion focused on one primary and one secondary CTA', () => {
    const heroActions = heroSection.match(/<div class="hero-actions">[\s\S]*?<\/div>/)?.[0] ?? ''

    expect(heroActions.match(/class="button /g) ?? []).toHaveLength(2)
    expect(heroActions).toContain('class="button button-primary" href="#waitlist-form"')
    expect(heroActions).toContain('class="button button-ghost" href="#value"')
    expect(heroSection).toContain('待機リストに登録する')
    expect(heroSection).toContain('記録例を見る')
  })

  it('records viewport and accessibility constraints for 390, 430, 768, and 1280px review', () => {
    expect(heroCss).toContain('grid-template-columns: minmax(0, 0.86fr) minmax(320px, 0.72fr)')
    expect(heroCss).toContain('@media (max-width: 920px)')
    expect(heroCss).toContain('@media (max-width: 640px)')
    expect(heroCss).toContain('grid-template-columns: 1fr')
    expect(heroCss).toContain('width: 100%')
    expect(heroCss).toContain('min-height: 48px')
    expect(lpHtml).toContain('min-height: 44px')
    expect(heroTypeCss.match(/font-size:[^;]*vw/g) ?? []).toHaveLength(0)

    expect(evaluation).toContain('390 / 430 / 768 / 1280px')
  })

  it('keeps issue evidence aligned with review status', () => {
    expect(issueSource).toContain('status: review')
    expect(issueSource).toContain('- [x] Hero の主役が 1 つに絞られている')
    expect(issueSource).toContain('- [x] 390 / 430 / 768 / 1280px')
    expect(issueSource).toContain('- [x] Visual Art Direction review')
    expect(issueSource).toContain('- [x] Accessibility review')
  })
})
