'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import type { components } from '@/lib/api/generated/schema'

export type Memory = components['schemas']['Memory']
export type MemoryCreateRequest = components['schemas']['MemoryCreateRequest']
export type MemoryUpdateRequest = components['schemas']['MemoryUpdateRequest']
export type MemoryListResponse = components['schemas']['MemoryListResponse']

export const memoriesQueryKey = ['memories'] as const

export function memoryListQueryKey(limit: number, cursor?: string | null) {
  return [...memoriesQueryKey, { limit, cursor: cursor ?? null }] as const
}

async function fetchMemories({
  limit,
  cursor,
}: {
  limit: number
  cursor?: string | null
}): Promise<MemoryListResponse> {
  const { data } = await getBrowserApiClient().GET('/memories', {
    params: { query: { limit, cursor: cursor ?? undefined } },
  })
  if (!data) throw new Error('GET /memories returned empty response')
  return data
}

async function createMemory(body: MemoryCreateRequest): Promise<Memory> {
  const { data } = await getBrowserApiClient().POST('/memories', { body })
  if (!data) throw new Error('POST /memories returned empty response')
  return data
}

export function useMemoriesQuery({
  limit = 20,
  cursor,
  initialData,
}: {
  limit?: number
  cursor?: string | null
  initialData?: MemoryListResponse
}) {
  return useQuery({
    queryKey: memoryListQueryKey(limit, cursor),
    queryFn: () => fetchMemories({ limit, cursor }),
    initialData,
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
