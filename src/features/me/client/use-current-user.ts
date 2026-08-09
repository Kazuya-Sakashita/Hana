'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import type { components } from '@/lib/api/generated/schema'

export type CurrentUser = components['schemas']['AppUser']

export const currentUserQueryKey = ['me'] as const

export async function fetchCurrentUser(signal?: AbortSignal): Promise<CurrentUser> {
  const { data } = await getBrowserApiClient().GET('/me', { signal })
  if (!data) throw new Error('GET /me returned empty response')
  return data
}

async function setAiConsent(): Promise<CurrentUser> {
  const { data } = await getBrowserApiClient().POST('/me/ai-consent')
  if (!data) throw new Error('POST /me/ai-consent returned empty response')
  return data
}

export async function revokeAiConsent(): Promise<CurrentUser> {
  try {
    const { data } = await getBrowserApiClient().DELETE('/me/ai-consent')
    if (!data) throw new Error('DELETE /me/ai-consent returned empty response')
    return data
  } catch (deleteError) {
    try {
      const currentUser = await fetchCurrentUser()
      if (currentUser.ai_consent_at === null) return currentUser
    } catch {
      // DELETE の失敗を優先して呼び出し元へ返す。
    }
    throw deleteError
  }
}

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: ({ signal }) => fetchCurrentUser(signal),
  })
}

export function useSetAiConsentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    scope: { id: 'ai-consent' },
    mutationFn: setAiConsent,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: currentUserQueryKey })
    },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey })
    },
  })
}

export function useRevokeAiConsentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    scope: { id: 'ai-consent' },
    mutationFn: revokeAiConsent,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: currentUserQueryKey })
    },
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: currentUserQueryKey })
    },
  })
}
