import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-068-home-photo-first-view-refinement.md', import.meta.url),
  'utf8',
)

describe('ISSUE-068 home photo-first refinement', () => {
  it('keeps the photo mat in the first view after the primary record action', () => {
    const firstViewIndex = homeSource.indexOf('<FeaturedPhotoMat memory={featuredMemory} />')
    const primaryActionIndex = homeSource.indexOf('id="home-primary-action"')

    expect(firstViewIndex).toBeGreaterThan(-1)
    expect(primaryActionIndex).toBeGreaterThan(-1)
    expect(primaryActionIndex).toBeLessThan(firstViewIndex)
    expect(homeSource).toContain('function FeaturedPhotoMat')
    expect(homeSource).toContain('data-testid="home-first-view-photo-mat"')
    expect(homeSource).toContain('const featuredMemory = memories[0] ?? null')
    expect(homeSource).toContain('aspect-[4/3]')
    expect(homeSource).toContain('photo-mat rounded-[var(--radius-sheet)]')
    expect(homeSource).toContain('1まいを選び、短い見出しを添えます')
    expect(homeSource).not.toContain('静かな photo mat')
    expect(homeSource).not.toContain('paper-surface overflow-hidden')
  })

  it('keeps the record route in thumb reach before album summary and stats', () => {
    const firstViewSectionIndex = homeSource.indexOf('aria-labelledby="home-primary-action"')
    const ctaIndex = homeSource.indexOf('href="/record"', firstViewSectionIndex)
    const latestMemoryIndex = homeSource.indexOf(
      '<FeaturedPhotoMat memory={featuredMemory} />',
      firstViewSectionIndex,
    )
    const albumSummaryIndex = homeSource.indexOf('<HomeAlbumSummary memoryCount={memoryCount} />')
    const statsIndex = homeSource.indexOf('HomeGentleStats')

    expect(firstViewSectionIndex).toBeGreaterThan(-1)
    expect(ctaIndex).toBeGreaterThan(firstViewSectionIndex)
    expect(latestMemoryIndex).toBeGreaterThan(ctaIndex)
    expect(albumSummaryIndex).toBeGreaterThan(ctaIndex)
    expect(statsIndex).toBeGreaterThan(ctaIndex)
    expect(homeSource).toContain('写真からページをつくる')
    expect(homeSource).toContain('はじめてのページをつくる')
    expect(homeSource).toContain('保存前に、ことばを整えられます。')
  })

  it('covers empty, image, no-cover, loading, and long-name states without pressure copy', () => {
    expect(homeSource).toContain('if (!memory)')
    expect(homeSource).toContain("typeof coverUrl === 'string'")
    expect(homeSource).toContain('aria-hidden="true"')
    expect(homeSource).toContain('HomeBodySkeleton')
    expect(homeSource).toContain('animate-pulse')
    expect(homeSource).toContain('[overflow-wrap:anywhere]')
    expect(homeSource).toContain('line-clamp-2')
    expect(homeSource).toContain('line-clamp-2 break-words font-serif text-base')
    expect(homeSource).not.toMatch(/今日まだ|記録していません|途切れ|ストリーク|streak/i)
  })

  it('tracks the local issue acceptance criteria and evidence boundary', () => {
    expect(issueSource).toContain('github_issue: 154')
    expect(issueSource).toContain('requires_human_review:')
    expect(issueSource).toContain('Evidence に実写真、画像 URL、`storage_key`、prompt、AI 生成本文')
    expect(issueSource).toContain('実ユーザー写真や URL を証跡に残さない')
  })
})
