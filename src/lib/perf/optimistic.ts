import type { QueryClient, QueryKey } from '@tanstack/react-query'
import {
  memoriesQueryKey,
  memoryListQueryKey,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'

interface MemoryListItemSnapshot {
  queryKey: QueryKey
  index: number
  memory: Memory
}

function snapshotMemoryItems(queryClient: QueryClient, memoryId: string): MemoryListItemSnapshot[] {
  const snapshots: MemoryListItemSnapshot[] = []
  for (const [queryKey, data] of queryClient.getQueriesData<MemoryListResponse>({
    queryKey: memoriesQueryKey,
  })) {
    const index = data?.data.findIndex((memory) => memory.id === memoryId) ?? -1
    const memory = index >= 0 ? data?.data[index] : undefined
    if (memory) {
      snapshots.push({ queryKey, index, memory })
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
  const ensuredKey = memoryListQueryKey(limit)
  const createdEnsuredList = !queryClient.getQueryData<MemoryListResponse>(ensuredKey)

  if (createdEnsuredList) {
    queryClient.setQueryData<MemoryListResponse>(ensuredKey, {
      data: [],
      page: { next_cursor: null },
    })
  }

  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: [memory, ...current.data.filter((item) => item.id !== memory.id)].slice(0, limit),
        }
      : current,
  )

  return () => {
    queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
      current
        ? { ...current, data: current.data.filter((item) => item.id !== memory.id) }
        : current,
    )

    if (createdEnsuredList) {
      const ensuredList = queryClient.getQueryData<MemoryListResponse>(ensuredKey)
      if (ensuredList?.data.length === 0) {
        queryClient.removeQueries({ queryKey: ensuredKey, exact: true })
      }
    }
  }
}

export function optimisticUpdateMemoryInLists(
  queryClient: QueryClient,
  memoryId: string,
  update: (memory: Memory) => Memory,
) {
  const snapshots = snapshotMemoryItems(queryClient, memoryId)

  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: current.data.map((memory) => (memory.id === memoryId ? update(memory) : memory)),
        }
      : current,
  )

  return () => {
    for (const snapshot of snapshots) {
      queryClient.setQueryData<MemoryListResponse>(snapshot.queryKey, (current) =>
        current
          ? {
              ...current,
              data: current.data.map((memory) =>
                memory.id === memoryId ? snapshot.memory : memory,
              ),
            }
          : current,
      )
    }
  }
}

export function optimisticReplaceMemoryInLists(
  queryClient: QueryClient,
  memoryId: string,
  replacement: Memory,
) {
  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: current.data.map((memory) => (memory.id === memoryId ? replacement : memory)),
        }
      : current,
  )
}

export function optimisticRemoveMemoryFromLists(queryClient: QueryClient, memoryId: string) {
  const snapshots = snapshotMemoryItems(queryClient, memoryId)

  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: current.data.filter((memory) => memory.id !== memoryId),
        }
      : current,
  )

  return () => {
    for (const snapshot of snapshots) {
      queryClient.setQueryData<MemoryListResponse>(snapshot.queryKey, (current) => {
        if (!current) return current

        const existingIndex = current.data.findIndex((memory) => memory.id === memoryId)
        if (existingIndex >= 0) {
          return {
            ...current,
            data: current.data.map((memory) => (memory.id === memoryId ? snapshot.memory : memory)),
          }
        }

        const data = [...current.data]
        data.splice(Math.min(snapshot.index, data.length), 0, snapshot.memory)
        return { ...current, data }
      })
    }
  }
}
