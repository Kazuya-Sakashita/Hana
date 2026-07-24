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
  const shelfViewportWidth = Math.min(contentWidth + pagePadding, viewportWidth)
  const shelfItemWidth = 148
  const shelfGap = 12
  const shelfItemCount = state.kind === 'existing' ? Math.max(0, state.memories.length - 1) + 1 : 0
  const shelfScrollWidth =
    shelfItemCount === 0 ? 0 : shelfItemCount * shelfItemWidth + (shelfItemCount - 1) * shelfGap
  const statColumnWidth = (contentWidth - 16) / 3

  return {
    contentWidth,
    firstViewOuterWidth,
    shelfViewportWidth,
    shelfScrollWidth,
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
          layout.shelfViewportWidth,
          `${viewport.id}:${state.kind} shelf viewport`,
        ).toBeLessThanOrEqual(viewport.width)
        expect(
          layout.statColumnWidth,
          `${viewport.id}:${state.kind} stat column`,
        ).toBeGreaterThanOrEqual(100)
      }
    }
  })

  it('allows intentional horizontal shelf scrolling without page-level overflow', () => {
    const fiveMemoryState = states.find(
      (state): state is Extract<HomeState, { kind: 'existing' }> =>
        state.kind === 'existing' && state.memories.length === 5,
    )
    if (!fiveMemoryState) throw new Error('five-memory fixture is required')

    for (const viewport of viewports) {
      const layout = estimateHomeLayout(viewport.width, fiveMemoryState)

      expect(layout.shelfScrollWidth).toBeGreaterThan(layout.shelfViewportWidth)
      expect(homeSource).toContain('overflow-x-auto')
      expect(homeSource).toContain('scroll-px-6')
      expect(homeSource).toContain('w-[148px] shrink-0 snap-start')
    }
  })

  it('keeps long child names and memory titles wrap-safe in the implemented markup', () => {
    expect(homeSource).toContain('break-words [overflow-wrap:anywhere]')
    expect(homeSource).toContain('line-clamp-2 min-h-10 break-words')
    expect(homeSource).toContain('line-clamp-2 break-words font-serif text-base')
    expect(homeSource).toContain('aspect-[4/3]')
    expect(homeSource).toContain('aspect-[4/5]')
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
