'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import type { components } from '@/lib/api/generated/schema'

export type CurrentUser = components['schemas']['AppUser']

export const currentUserQueryKey = ['me'] as const

async function fetchCurrentUser(): Promise<CurrentUser> {
  const { data } = await getBrowserApiClient().GET('/me')
  if (!data) throw new Error('GET /me returned empty response')
  return data
}

async function setAiConsent(): Promise<CurrentUser> {
  const { data } = await getBrowserApiClient().POST('/me/ai-consent')
  if (!data) throw new Error('POST /me/ai-consent returned empty response')
  return data
}

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: currentUserQueryKey,
    queryFn: fetchCurrentUser,
  })
}

export function useSetAiConsentMutation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: setAiConsent,
    onSuccess: (user) => {
      queryClient.setQueryData(currentUserQueryKey, user)
    },
  })
}
