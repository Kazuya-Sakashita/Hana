import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query'
import {
  memoriesQueryKey,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'

interface MemoryListItemSnapshot {
  queryKey: QueryKey
  pageIndex: number
  index: number
  memory: Memory
}

type MemoryListCache = MemoryListResponse | InfiniteData<MemoryListResponse>

function isInfiniteMemoryList(data: MemoryListCache): data is InfiniteData<MemoryListResponse> {
  return Array.isArray((data as InfiniteData<MemoryListResponse>).pages)
}

function snapshotMemoryItems(queryClient: QueryClient, memoryId: string): MemoryListItemSnapshot[] {
  const snapshots: MemoryListItemSnapshot[] = []
  for (const [queryKey, data] of queryClient.getQueriesData<MemoryListCache>({
    queryKey: memoriesQueryKey,
  })) {
    if (!data) continue
    const pages = isInfiniteMemoryList(data) ? data.pages : [data]
    for (const [pageIndex, page] of pages.entries()) {
      const index = page.data.findIndex((memory) => memory.id === memoryId)
      const memory = index >= 0 ? page.data[index] : undefined
      if (memory) {
        snapshots.push({ queryKey, pageIndex, index, memory })
      }
    }
  }
  return snapshots
}

export function optimisticAddMemoryToLists(
  queryClient: QueryClient,
  memory: Memory,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 50

  queryClient.setQueriesData<MemoryListCache>({ queryKey: memoriesQueryKey }, (current) =>
    updateMemoryListCache(current, (page, pageIndex) =>
      pageIndex === 0
        ? {
            ...page,
            data: [memory, ...page.data.filter((item) => item.id !== memory.id)].slice(0, limit),
          }
        : page,
    ),
  )

  return () => {
    queryClient.setQueriesData<MemoryListCache>({ queryKey: memoriesQueryKey }, (current) =>
      updateMemoryListCache(current, (page) => ({
        ...page,
        data: page.data.filter((item) => item.id !== memory.id),
      })),
    )
  }
}

export function optimisticUpdateMemoryInLists(
  queryClient: QueryClient,
  memoryId: string,
  update: (memory: Memory) => Memory,
) {
  const snapshots = snapshotMemoryItems(queryClient, memoryId)

  queryClient.setQueriesData<MemoryListCache>({ queryKey: memoriesQueryKey }, (current) =>
    updateMemoryListCache(current, (page) => ({
      ...page,
      data: page.data.map((memory) => (memory.id === memoryId ? update(memory) : memory)),
    })),
  )

  return () => {
    for (const snapshot of snapshots) {
      queryClient.setQueryData<MemoryListCache>(snapshot.queryKey, (current) =>
        updateMemoryListCache(current, (page, pageIndex) =>
          pageIndex === snapshot.pageIndex
            ? {
                ...page,
                data: page.data.map((memory) =>
                  memory.id === memoryId ? snapshot.memory : memory,
                ),
              }
            : page,
        ),
      )
    }
  }
}

export function optimisticReplaceMemoryInLists(
  queryClient: QueryClient,
  memoryId: string,
  replacement: Memory,
) {
  queryClient.setQueriesData<MemoryListCache>({ queryKey: memoriesQueryKey }, (current) =>
    updateMemoryListCache(current, (page) => ({
      ...page,
      data: page.data.map((memory) => (memory.id === memoryId ? replacement : memory)),
    })),
  )
}

export function optimisticRemoveMemoryFromLists(queryClient: QueryClient, memoryId: string) {
  const snapshots = snapshotMemoryItems(queryClient, memoryId)

  queryClient.setQueriesData<MemoryListCache>({ queryKey: memoriesQueryKey }, (current) =>
    updateMemoryListCache(current, (page) => ({
      ...page,
      data: page.data.filter((memory) => memory.id !== memoryId),
    })),
  )

  return () => {
    for (const snapshot of snapshots) {
      queryClient.setQueryData<MemoryListCache>(snapshot.queryKey, (current) =>
        updateMemoryListCache(current, (page, pageIndex) => {
          if (pageIndex !== snapshot.pageIndex) return page

          const existingIndex = page.data.findIndex((memory) => memory.id === memoryId)
          if (existingIndex >= 0) {
            return {
              ...page,
              data: page.data.map((memory) => (memory.id === memoryId ? snapshot.memory : memory)),
            }
          }

          const data = [...page.data]
          data.splice(Math.min(snapshot.index, data.length), 0, snapshot.memory)
          return { ...page, data }
        }),
      )
    }
  }
}

function updateMemoryListCache(
  current: MemoryListCache | undefined,
  updatePage: (page: MemoryListResponse, pageIndex: number) => MemoryListResponse,
): MemoryListCache | undefined {
  if (!current) return current

  if (isInfiniteMemoryList(current)) {
    return {
      ...current,
      pages: current.pages.map((page, pageIndex) => updatePage(page, pageIndex)),
    }
  }

  return updatePage(current, 0)
}
