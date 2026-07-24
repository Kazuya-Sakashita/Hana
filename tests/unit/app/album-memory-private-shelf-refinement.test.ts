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
const issueSource = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-070-album-memory-private-shelf-refinement.md',
    import.meta.url,
  ),
  'utf8',
)

describe('ISSUE-070 album and memory private shelf refinement', () => {
  it('adds a large featured page before the practical shelf list', () => {
    expect(albumPageSource).toContain('function FeaturedAlbumPage')
    expect(albumPageSource).toContain('data-testid="album-featured-page"')
    expect(albumPageSource).toContain('最近しまったページ')
    expect(albumPageSource).toContain('const featured = items[0] ?? null')
    expect(albumPageSource).toContain('data: items.map')
    expect(albumPageSource).not.toContain('const [featured, ...shelfItems] = items')
    expect(albumPageSource).toContain('aspect-[4/5] w-full')
  })

  it('keeps list pagination, load more, and favorite affordances intact', () => {
    expect(albumListSource).toContain('useInfiniteMemoriesQuery')
    expect(albumListSource).toContain('query.fetchNextPage()')
    expect(albumListSource).toContain('quietStateCopy.album.loadMoreButton')
    expect(albumListSource).toContain('statusRef.current?.focus')
    expect(albumListSource).toContain('optimisticUpdateMemoryInLists')
    expect(albumListSource).toContain('aria-pressed={memory.is_favorite}')
    expect(albumListSource).toContain('tap-target flex h-11 w-11')
    expect(albumListSource).toContain('AlbumFavoriteButton')
  })

  it('keeps memory detail photo and story primary while making saved notice quieter', () => {
    expect(memoryDetailSource).toContain('photo-mat space-y-3')
    expect(memoryDetailSource).toContain('leading-bookish')
    expect(memoryDetailSource).toContain('MemoryActions')
    expect(memoryDetailSource).toContain('border-l px-3 py-2')
    expect(memoryDetailSource).toContain('role="status"')
    expect(memoryDetailSource).not.toContain('paper-surface mb-4')
    expect(memoryDetailSource).not.toContain('rounded-[var(--radius-paper-slip)] px-4 py-4')
  })

  it('tracks local issue scope and evidence boundaries', () => {
    expect(issueSource).toContain('github_issue: 156')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('- [x] `/album` の上部に featured page')
    expect(issueSource).toContain('pagination API の変更')
    expect(issueSource).toContain('証跡には実写真、画像 URL、`storage_key`、prompt、AI 生成本文')
  })
})
