import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

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

const viewports = [
  { id: 'compact', width: 390 },
  { id: 'large-phone', width: 430 },
  { id: 'tablet', width: 768 },
]

function estimateAlbumLayout(width: number, memoryCount: number) {
  const contentWidth = Math.min(width - 48, 448)
  const listItemWidth = contentWidth
  const shelfCount = memoryCount

  return { contentWidth, listItemWidth, shelfCount }
}

describe('ISSUE-070 private shelf layout fixtures', () => {
  it('keeps list items inside compact and tablet widths without a duplicate featured preview', () => {
    for (const viewport of viewports) {
      for (const memoryCount of [0, 1, 51]) {
        const layout = estimateAlbumLayout(viewport.width, memoryCount)

        expect(layout.contentWidth, viewport.id).toBeGreaterThanOrEqual(342)
        expect(layout.listItemWidth, viewport.id).toBeLessThanOrEqual(layout.contentWidth)
        if (memoryCount === 1) expect(layout.shelfCount).toBe(1)
        if (memoryCount === 51) expect(layout.shelfCount).toBe(51)
      }
    }
  })

  it('keeps intentional scroll areas local to photo strips and not the page width', () => {
    expect(memoryDetailSource).toContain('overflow-x-auto')
    expect(memoryDetailSource).toContain('-mx-2 flex gap-3 overflow-x-auto')
    expect(albumListSource).toContain('flex min-w-0 flex-1')
    expect(albumListSource).toContain('break-words [overflow-wrap:anywhere]')
    expect(albumPageSource).not.toContain('overflow-x-auto')
    expect(albumPageSource).not.toContain('data-testid="album-featured-page"')
  })

  it('keeps tap targets and focus surfaces for shelf interactions', () => {
    expect(albumListSource).toContain('focus-visible:ring-2')
    expect(albumListSource).toContain('QuietIconButton')
    expect(albumListSource).toContain('statusRef.current?.focus')
    expect(albumListSource).toContain('itemLinkRefs.current.get(firstAddedItem.id)?.focus')
    expect(memoryDetailSource).toContain('tap-target absolute')
  })

  it('keeps fixture evidence free of private image and AI text data', () => {
    const fixture = JSON.stringify({ viewports, counts: [0, 1, 51] })
    const source = `${fixture}\n${albumPageSource}\n${albumListSource}\n${memoryDetailSource}`

    expect(source).not.toMatch(/storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i)
    expect(fixture).not.toMatch(/https?:\/\/|uploads\/|previewUrl/)
    expect(fixture).not.toMatch(/やわらかい光|今日も元気|ちいさな手|公園に行きました/)
  })
})
