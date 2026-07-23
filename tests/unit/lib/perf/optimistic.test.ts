import { QueryClient } from '@tanstack/react-query'
import type { InfiniteData } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  optimisticAddMemoryToLists,
  optimisticRemoveMemoryFromLists,
  optimisticReplaceMemoryInLists,
  optimisticUpdateMemoryInLists,
} from '@/lib/perf/optimistic'
import {
  infiniteMemoryListQueryKey,
  memoryListQueryKey,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'

const LIST_KEY = memoryListQueryKey(50)
const INFINITE_LIST_KEY = infiniteMemoryListQueryKey(50)

function makeMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    child_id: '00000000-0000-4000-8000-000000000010',
    title: 'はじめて',
    body: 'きょうの きろく',
    recorded_at: '2026-05-23',
    weather: null,
    is_favorite: false,
    ai_generated: false,
    image_ids: ['00000000-0000-4000-8000-000000000020'],
    created_at: '2026-05-23T00:00:00.000Z',
    updated_at: '2026-05-23T00:00:00.000Z',
    ...overrides,
  }
}

function makeList(data: Memory[]): MemoryListResponse {
  return { data, page: { next_cursor: null } }
}

function makeInfiniteList(pages: MemoryListResponse[]): InfiniteData<MemoryListResponse> {
  return { pages, pageParams: pages.map((_, index) => (index === 0 ? null : `cursor-${index}`)) }
}

describe('optimistic memory list helpers', () => {
  it('adds a memory immediately and rolls back to the previous list', () => {
    const queryClient = new QueryClient()
    const existing = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const next = makeMemory({ id: 'optimistic-1', title: 'いま のこしたページ' })
    queryClient.setQueryData(LIST_KEY, makeList([existing]))

    const rollback = optimisticAddMemoryToLists(queryClient, next)

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data.map((m) => m.id)).toEqual([
      'optimistic-1',
      existing.id,
    ])

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([existing])
  })

  it('removes only the optimistic memory on add rollback', () => {
    const queryClient = new QueryClient()
    const existing = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const next = makeMemory({ id: 'optimistic-1', title: 'いま のこしたページ' })
    queryClient.setQueryData(LIST_KEY, makeList([existing]))

    const rollback = optimisticAddMemoryToLists(queryClient, next)
    queryClient.setQueryData<MemoryListResponse>(LIST_KEY, (current) =>
      current
        ? {
            ...current,
            data: current.data.map((memory) =>
              memory.id === existing.id ? { ...memory, is_favorite: true } : memory,
            ),
          }
        : current,
    )

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([
      { ...existing, is_favorite: true },
    ])
  })

  it('does not create a one-item album list cache when the list has not been visited', () => {
    const queryClient = new QueryClient()
    const next = makeMemory({ id: 'optimistic-1' })

    const rollback = optimisticAddMemoryToLists(queryClient, next)

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)).toBeUndefined()

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)).toBeUndefined()
  })

  it('keeps loaded infinite-page items when adding and rolling back an optimistic memory', () => {
    const queryClient = new QueryClient()
    const firstPage = Array.from({ length: 50 }, (_, index) =>
      makeMemory({ id: `00000000-0000-4000-8000-0000000001${String(index).padStart(2, '0')}` }),
    )
    const secondPage = [makeMemory({ id: '00000000-0000-4000-8000-000000000300' })]
    const next = makeMemory({ id: 'optimistic-1', title: 'いま のこしたページ' })
    queryClient.setQueryData(
      INFINITE_LIST_KEY,
      makeInfiniteList([makeList(firstPage), makeList(secondPage)]),
    )

    const rollback = optimisticAddMemoryToLists(queryClient, next)

    const afterAdd = queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)
    expect(afterAdd?.pages[0]?.data.map((memory) => memory.id)).toEqual([
      next.id,
      ...firstPage.map((memory) => memory.id),
    ])
    expect(afterAdd?.pages[1]?.data).toEqual(secondPage)

    rollback()

    const afterRollback =
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)
    expect(afterRollback?.pages[0]?.data).toEqual(firstPage)
    expect(afterRollback?.pages[1]?.data).toEqual(secondPage)
  })

  it('updates favorite state and restores it on rollback', () => {
    const queryClient = new QueryClient()
    const memory = makeMemory()
    queryClient.setQueryData(LIST_KEY, makeList([memory]))

    const rollback = optimisticUpdateMemoryInLists(queryClient, memory.id, (current) => ({
      ...current,
      is_favorite: true,
    }))

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data[0]?.is_favorite).toBe(true)

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data[0]?.is_favorite).toBe(false)
  })

  it('keeps unrelated memory changes when update rollback runs', () => {
    const queryClient = new QueryClient()
    const target = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const unrelated = makeMemory({ id: '00000000-0000-4000-8000-000000000003' })
    queryClient.setQueryData(LIST_KEY, makeList([target, unrelated]))

    const rollback = optimisticUpdateMemoryInLists(queryClient, target.id, (current) => ({
      ...current,
      is_favorite: true,
    }))
    queryClient.setQueryData<MemoryListResponse>(LIST_KEY, (current) =>
      current
        ? {
            ...current,
            data: current.data.map((memory) =>
              memory.id === unrelated.id ? { ...memory, title: '更新済み' } : memory,
            ),
          }
        : current,
    )

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([
      target,
      { ...unrelated, title: '更新済み' },
    ])
  })

  it('replaces a temporary memory with the server response', () => {
    const queryClient = new QueryClient()
    const optimistic = makeMemory({ id: 'optimistic-1' })
    const created = makeMemory({ id: '00000000-0000-4000-8000-000000000003' })
    queryClient.setQueryData(LIST_KEY, makeList([optimistic]))

    optimisticReplaceMemoryInLists(queryClient, optimistic.id, created)

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([created])
  })

  it('removes a memory and rolls back to the previous list', () => {
    const queryClient = new QueryClient()
    const memory = makeMemory()
    queryClient.setQueryData(LIST_KEY, makeList([memory]))

    const rollback = optimisticRemoveMemoryFromLists(queryClient, memory.id)

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([])

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([memory])
  })

  it('keeps unrelated memory changes when remove rollback runs', () => {
    const queryClient = new QueryClient()
    const target = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const unrelated = makeMemory({ id: '00000000-0000-4000-8000-000000000003' })
    queryClient.setQueryData(LIST_KEY, makeList([target, unrelated]))

    const rollback = optimisticRemoveMemoryFromLists(queryClient, target.id)
    queryClient.setQueryData<MemoryListResponse>(LIST_KEY, (current) =>
      current
        ? {
            ...current,
            data: current.data.map((memory) =>
              memory.id === unrelated.id ? { ...memory, title: '更新済み' } : memory,
            ),
          }
        : current,
    )

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([
      target,
      { ...unrelated, title: '更新済み' },
    ])
  })

  it('updates memories inside infinite album pages and restores them on rollback', () => {
    const queryClient = new QueryClient()
    const firstPageMemory = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const secondPageMemory = makeMemory({ id: '00000000-0000-4000-8000-000000000003' })
    queryClient.setQueryData(
      INFINITE_LIST_KEY,
      makeInfiniteList([makeList([firstPageMemory]), makeList([secondPageMemory])]),
    )

    const rollback = optimisticUpdateMemoryInLists(queryClient, secondPageMemory.id, (current) => ({
      ...current,
      is_favorite: true,
    }))

    expect(
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)?.pages[1]
        ?.data[0]?.is_favorite,
    ).toBe(true)

    rollback()

    expect(
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)?.pages[1]
        ?.data[0],
    ).toEqual(secondPageMemory)
  })

  it('removes memories inside infinite album pages and rolls them back to the same page', () => {
    const queryClient = new QueryClient()
    const firstPageMemory = makeMemory({ id: '00000000-0000-4000-8000-000000000002' })
    const secondPageMemory = makeMemory({ id: '00000000-0000-4000-8000-000000000003' })
    queryClient.setQueryData(
      INFINITE_LIST_KEY,
      makeInfiniteList([makeList([firstPageMemory]), makeList([secondPageMemory])]),
    )

    const rollback = optimisticRemoveMemoryFromLists(queryClient, secondPageMemory.id)

    expect(
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)?.pages[0]?.data,
    ).toEqual([firstPageMemory])
    expect(
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)?.pages[1]?.data,
    ).toEqual([])

    rollback()

    expect(
      queryClient.getQueryData<InfiniteData<MemoryListResponse>>(INFINITE_LIST_KEY)?.pages[1]?.data,
    ).toEqual([secondPageMemory])
  })
})
