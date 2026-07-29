'use client'

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import type { components } from '@/lib/api/generated/schema'
import type { MemoryDateRange } from '@/features/memories/month'

export type Memory = components['schemas']['Memory']
export type MemoryCreateRequest = components['schemas']['MemoryCreateRequest']
export type MemoryUpdateRequest = components['schemas']['MemoryUpdateRequest']
export type MemoryListResponse = components['schemas']['MemoryListResponse']

export const memoriesQueryKey = ['memories'] as const

export function memoryListQueryKey(
  limit: number,
  cursor?: string | null,
  dateRange?: MemoryDateRange,
) {
  return [
    ...memoriesQueryKey,
    {
      limit,
      cursor: cursor ?? null,
      recordedFrom: dateRange?.recordedFrom ?? null,
      recordedBefore: dateRange?.recordedBefore ?? null,
    },
  ] as const
}

export function infiniteMemoryListQueryKey(limit: number, dateRange?: MemoryDateRange) {
  return [
    ...memoriesQueryKey,
    'infinite',
    {
      limit,
      recordedFrom: dateRange?.recordedFrom ?? null,
      recordedBefore: dateRange?.recordedBefore ?? null,
    },
  ] as const
}

async function fetchMemories({
  limit,
  cursor,
  dateRange,
}: {
  limit: number
  cursor?: string | null
  dateRange?: MemoryDateRange
}): Promise<MemoryListResponse> {
  const { data } = await getBrowserApiClient().GET('/memories', {
    params: {
      query: {
        limit,
        cursor: cursor ?? undefined,
        recorded_from: dateRange?.recordedFrom,
        recorded_before: dateRange?.recordedBefore,
      },
    },
  })
  if (!data) throw new Error('GET /memories returned empty response')
  return data
}

export interface CreateMemoryInput {
  body: MemoryCreateRequest
  idempotencyKey: string
}

async function createMemory({ body, idempotencyKey }: CreateMemoryInput): Promise<Memory> {
  const { data } = await getBrowserApiClient().POST('/memories', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body,
  })
  if (!data) throw new Error('POST /memories returned empty response')
  return data
}

export function useMemoriesQuery({
  limit = 20,
  cursor,
  dateRange,
  initialData,
}: {
  limit?: number
  cursor?: string | null
  dateRange?: MemoryDateRange
  initialData?: MemoryListResponse
}) {
  return useQuery({
    queryKey: memoryListQueryKey(limit, cursor, dateRange),
    queryFn: () => fetchMemories({ limit, cursor, dateRange }),
    initialData,
  })
}

export function useInfiniteMemoriesQuery({
  limit = 20,
  dateRange,
  initialData,
}: {
  limit?: number
  dateRange?: MemoryDateRange
  initialData?: MemoryListResponse
}) {
  return useInfiniteQuery({
    queryKey: infiniteMemoryListQueryKey(limit, dateRange),
    queryFn: ({ pageParam }) => fetchMemories({ limit, cursor: pageParam, dateRange }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.page.next_cursor ?? undefined,
    initialData: initialData ? { pages: [initialData], pageParams: [null] } : undefined,
  })
}

export function useCreateMemoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createMemory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    },
  })
}

async function updateMemory({
  memoryId,
  body,
}: {
  memoryId: string
  body: MemoryUpdateRequest
}): Promise<Memory> {
  const { data } = await getBrowserApiClient().PUT('/memories/{memoryId}', {
    params: { path: { memoryId } },
    body,
  })
  if (!data) throw new Error('PUT /memories/{memoryId} returned empty response')
  return data
}

async function deleteMemory(memoryId: string): Promise<void> {
  await getBrowserApiClient().DELETE('/memories/{memoryId}', {
    params: { path: { memoryId } },
  })
}

export function useUpdateMemoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateMemory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    },
  })
}

export function useDeleteMemoryMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteMemory,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
    },
  })
}
