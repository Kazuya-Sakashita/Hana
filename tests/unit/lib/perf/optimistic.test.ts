import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import {
  optimisticAddMemoryToLists,
  optimisticRemoveMemoryFromLists,
  optimisticReplaceMemoryInLists,
  optimisticUpdateMemoryInLists,
} from '@/lib/perf/optimistic'
import {
  memoryListQueryKey,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'

const LIST_KEY = memoryListQueryKey(50)

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

  it('creates a target album list cache when none exists and removes it on rollback', () => {
    const queryClient = new QueryClient()
    const next = makeMemory({ id: 'optimistic-1' })

    const rollback = optimisticAddMemoryToLists(queryClient, next)

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)?.data).toEqual([next])

    rollback()

    expect(queryClient.getQueryData<MemoryListResponse>(LIST_KEY)).toBeUndefined()
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
})
