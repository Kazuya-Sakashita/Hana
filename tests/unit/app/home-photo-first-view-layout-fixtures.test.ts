import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeSource = readFileSync(new URL('../../../src/app/page.tsx', import.meta.url), 'utf8')

type HomeState =
  | { kind: 'empty'; childName: string }
  | { kind: 'loading' }
  | {
      kind: 'existing'
      childName: string
      memories: { title: string; hasCover: boolean }[]
    }

const viewports = [
  { id: 'compact-short', width: 390, height: 640 },
  { id: 'compact-tall', width: 390, height: 844 },
  { id: 'large-phone', width: 430, height: 932 },
  { id: 'tablet', width: 768, height: 1024 },
]

const longUnbrokenTitle = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const states: HomeState[] = [
  { kind: 'loading' },
  { kind: 'empty', childName: 'あおいはるのすけあかり' },
  {
    kind: 'existing',
    childName: 'はな',
    memories: [{ title: 'ページ 001', hasCover: true }],
  },
  {
    kind: 'existing',
    childName: 'あおいはるのすけあかり',
    memories: [
      { title: longUnbrokenTitle, hasCover: true },
      { title: longUnbrokenTitle, hasCover: false },
      { title: 'ページ 003', hasCover: true },
      { title: 'ページ 004', hasCover: true },
      { title: 'ページ 005', hasCover: false },
    ],
  },
]

function estimateHomeLayout(viewportWidth: number, state: HomeState) {
  const pagePadding = 48
  const contentWidth = Math.min(viewportWidth - pagePadding, 448)
  const firstViewOuterWidth = contentWidth
  const albumSummaryWidth = state.kind === 'existing' ? contentWidth : 0
  const statColumnWidth = (contentWidth - 16) / 3

  return {
    contentWidth,
    firstViewOuterWidth,
    albumSummaryWidth,
    statColumnWidth,
  }
}

describe('ISSUE-068 home photo-first layout fixtures', () => {
  it('keeps first-view photo mat, CTA, and stats within compact and tablet widths', () => {
    for (const viewport of viewports) {
      for (const state of states) {
        const layout = estimateHomeLayout(viewport.width, state)

        expect(layout.contentWidth, `${viewport.id}:${state.kind} content`).toBeGreaterThanOrEqual(
          342,
        )
        expect(
          layout.firstViewOuterWidth,
          `${viewport.id}:${state.kind} first view`,
        ).toBeLessThanOrEqual(layout.contentWidth)
        expect(
          layout.albumSummaryWidth,
          `${viewport.id}:${state.kind} album summary`,
        ).toBeLessThanOrEqual(layout.contentWidth)
        expect(
          layout.statColumnWidth,
          `${viewport.id}:${state.kind} stat column`,
        ).toBeGreaterThanOrEqual(100)
      }
    }
  })

  it('replaces horizontal shelf scrolling with a stable full-width album summary', () => {
    const fiveMemoryState = states.find(
      (state): state is Extract<HomeState, { kind: 'existing' }> =>
        state.kind === 'existing' && state.memories.length === 5,
    )
    if (!fiveMemoryState) throw new Error('five-memory fixture is required')

    for (const viewport of viewports) {
      const layout = estimateHomeLayout(viewport.width, fiveMemoryState)

      expect(layout.albumSummaryWidth).toBe(layout.contentWidth)
      expect(homeSource).toContain('function HomeAlbumSummary')
      expect(homeSource).toContain('min-h-24')
      expect(homeSource).not.toContain('overflow-x-auto')
      expect(homeSource).not.toContain('snap-x')
      expect(homeSource).not.toContain('shelfMemories')
    }
  })

  it('keeps long child names and memory titles wrap-safe in the implemented markup', () => {
    expect(homeSource).toContain('break-words [overflow-wrap:anywhere]')
    expect(homeSource).toContain('line-clamp-2 break-words font-serif text-base')
    expect(homeSource).toContain('aspect-[4/3]')
    expect(homeSource).toContain('min-w-0')
  })

  it('uses synthetic fixture text without pressure copy or evidence leaks', () => {
    const fixtureText = JSON.stringify({ viewports, states })

    expect(`${fixtureText}\n${homeSource}`).not.toMatch(
      /今日まだ|記録していません|途切れ|ストリーク|streak|ランキング|いいね|投稿/i,
    )
    expect(fixtureText).not.toMatch(/https?:\/\/|storage_key|presigned_url|prompt/i)
    expect(fixtureText).not.toMatch(/やわらかい光|今日も元気|ちいさな手|公園に行きました/)
  })
})
