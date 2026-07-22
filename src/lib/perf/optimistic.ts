import type { QueryClient, QueryKey } from '@tanstack/react-query'
import {
  memoriesQueryKey,
  memoryListQueryKey,
  type Memory,
  type MemoryListResponse,
} from '@/features/memories/client/use-memories'

type MemoryListSnapshot = Array<[QueryKey, MemoryListResponse | undefined]>

function queryKeyId(queryKey: QueryKey): string {
  return JSON.stringify(queryKey)
}

function snapshotMemoryLists(queryClient: QueryClient, ensureKey?: QueryKey): MemoryListSnapshot {
  const snapshots = queryClient.getQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey })
  if (ensureKey && !snapshots.some(([key]) => queryKeyId(key) === queryKeyId(ensureKey))) {
    snapshots.push([ensureKey, queryClient.getQueryData<MemoryListResponse>(ensureKey)])
  }
  return snapshots
}

function restoreMemoryLists(queryClient: QueryClient, snapshots: MemoryListSnapshot) {
  for (const [queryKey, data] of snapshots) {
    if (data === undefined) {
      queryClient.removeQueries({ queryKey, exact: true })
    } else {
      queryClient.setQueryData(queryKey, data)
    }
  }
}

export function optimisticAddMemoryToLists(
  queryClient: QueryClient,
  memory: Memory,
  options: { limit?: number } = {},
) {
  const limit = options.limit ?? 50
  const ensuredKey = memoryListQueryKey(limit)
  const snapshots = snapshotMemoryLists(queryClient, ensuredKey)

  if (!queryClient.getQueryData<MemoryListResponse>(ensuredKey)) {
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

  return () => restoreMemoryLists(queryClient, snapshots)
}

export function optimisticUpdateMemoryInLists(
  queryClient: QueryClient,
  memoryId: string,
  update: (memory: Memory) => Memory,
) {
  const snapshots = snapshotMemoryLists(queryClient)

  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: current.data.map((memory) => (memory.id === memoryId ? update(memory) : memory)),
        }
      : current,
  )

  return () => restoreMemoryLists(queryClient, snapshots)
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
  const snapshots = snapshotMemoryLists(queryClient)

  queryClient.setQueriesData<MemoryListResponse>({ queryKey: memoriesQueryKey }, (current) =>
    current
      ? {
          ...current,
          data: current.data.filter((memory) => memory.id !== memoryId),
        }
      : current,
  )

  return () => restoreMemoryLists(queryClient, snapshots)
}
