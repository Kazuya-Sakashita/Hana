import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const useMemoriesSource = readFileSync(
  new URL('../../../src/features/memories/client/use-memories.ts', import.meta.url),
  'utf8',
)
const qaContract = readFileSync(
  new URL('../../../docs/design/album-full-list-qa.md', import.meta.url),
  'utf8',
)

describe('album pagination', () => {
  it('uses existing next_cursor contract through an infinite query', () => {
    expect(useMemoriesSource).toContain('useInfiniteQuery')
    expect(useMemoriesSource).toContain('infiniteMemoryListQueryKey')
    expect(useMemoriesSource).toContain('initialPageParam: null as string | null')
    expect(useMemoriesSource).toContain('getNextPageParam')
    expect(useMemoriesSource).toContain('lastPage.page.next_cursor')
    expect(useMemoriesSource).toContain('pages: [initialData]')
  })

  it('appends pages and exposes a load-more action in the album UI', () => {
    expect(albumListSource).toContain('useInfiniteMemoriesQuery')
    expect(albumListSource).toContain('pages.flatMap((page) => page.data)')
    expect(albumListSource).toContain('query.hasNextPage')
    expect(albumListSource).toContain('query.fetchNextPage()')
    expect(albumListSource).toContain('query.isFetchingNextPage')
    expect(albumListSource).toContain('quietStateCopy.album.loadMoreButton')
    expect(quietStateCopy.album.loadMoreButton).toBe('まえのページも みる')
    expect(albumListSource).toContain('role="status"')
    expect(albumListSource).toContain('aria-live="polite"')
    expect(albumListSource).toContain('statusRef.current?.focus')
  })

  it('records the many-memory QA contract without real user data', () => {
    expect(qaContract).toContain('0 memories')
    expect(qaContract).toContain('51 or more memories')
    expect(qaContract).toContain('next_cursor')
    expect(qaContract).toContain('Do not use real child photos')
    expect(qaContract).toContain('storage keys')
  })
})
