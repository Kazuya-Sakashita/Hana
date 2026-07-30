'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import type { components } from '@/lib/api/generated/schema'

export type Child = components['schemas']['Child']
export type ChildListResponse = components['schemas']['ChildListResponse']
export type ChildCreateRequest = components['schemas']['ChildCreateRequest']
export type ChildUpdateRequest = components['schemas']['ChildUpdateRequest']

export const childrenQueryKey = ['children'] as const

async function fetchChildren(): Promise<ChildListResponse> {
  const { data } = await getBrowserApiClient().GET('/children')
  if (!data) throw new Error('GET /children returned empty response')
  return data
}

async function createChild(body: ChildCreateRequest): Promise<Child> {
  const { data } = await getBrowserApiClient().POST('/children', { body })
  if (!data) throw new Error('POST /children returned empty response')
  return data
}

async function updateChild({
  childId,
  body,
}: {
  childId: string
  body: ChildUpdateRequest
}): Promise<Child> {
  const { data } = await getBrowserApiClient().PUT('/children/{childId}', {
    params: { path: { childId } },
    body,
  })
  if (!data) throw new Error('PUT /children/{childId} returned empty response')
  return data
}

export function useChildrenQuery() {
  return useQuery({
    queryKey: childrenQueryKey,
    queryFn: fetchChildren,
  })
}

export function useCreateChildMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createChild,
    onSuccess: (child) => {
      queryClient.setQueryData<ChildListResponse>(childrenQueryKey, { data: [child] })
      void queryClient.invalidateQueries({ queryKey: childrenQueryKey })
    },
  })
}

export function useUpdateChildMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateChild,
    onSuccess: (updatedChild) => {
      queryClient.setQueryData<ChildListResponse>(childrenQueryKey, (current) => ({
        data: (current?.data ?? []).map((child) =>
          child.id === updatedChild.id ? updatedChild : child,
        ),
      }))
      void queryClient.invalidateQueries({ queryKey: childrenQueryKey })
    },
  })
}
