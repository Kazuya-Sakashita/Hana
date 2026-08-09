'use client'

import { useEffect, useLayoutEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  currentUserQueryKey,
  fetchCurrentUser,
  useCurrentUserQuery,
} from '@/features/me/client/use-current-user'
import { isApiProblemError } from '@/lib/api/error'
import {
  flushProductEventOutbox,
  setProductEventTelemetryBinding,
  setProductEventTelemetryBindingRefresher,
  startProductEventOutbox,
} from './product-events'

const TELEMETRY_BINDING_EXPIRY_PATTERN = /^v3\.(\d{10})\./
const TELEMETRY_BINDING_REFRESH_LEAD_MS = 60_000
const TELEMETRY_BINDING_REFRESH_RETRY_MS = 60_000
const MAX_TIMER_DELAY_MS = 2_147_483_647

function refreshDelay(binding: string): number | null {
  const match = binding.match(TELEMETRY_BINDING_EXPIRY_PATTERN)
  if (!match) return null
  const expiresAtMs = Number(match[1]) * 1000
  if (!Number.isSafeInteger(expiresAtMs)) return null
  return Math.min(
    Math.max(0, expiresAtMs - Date.now() - TELEMETRY_BINDING_REFRESH_LEAD_MS),
    MAX_TIMER_DELAY_MS,
  )
}

export function ProductEventOutboxFlusher() {
  const queryClient = useQueryClient()
  const currentUserQuery = useCurrentUserQuery()
  useLayoutEffect(() => {
    setProductEventTelemetryBindingRefresher(async (signal) => {
      try {
        const user = await fetchCurrentUser(signal)
        if (signal.aborted) return { status: 'unavailable' }
        queryClient.setQueryData(currentUserQueryKey, user)
        return { status: 'binding', binding: user.telemetry_binding }
      } catch (error) {
        if (signal.aborted) return { status: 'unavailable' }
        if (isApiProblemError(error) && error.status === 401) {
          queryClient.removeQueries({ queryKey: currentUserQueryKey })
          return { status: 'unauthenticated' }
        }
        return { status: 'unavailable' }
      }
    })
    return () => setProductEventTelemetryBindingRefresher(null)
  }, [queryClient])
  useEffect(() => startProductEventOutbox(), [])
  useEffect(() => {
    const binding = currentUserQuery.data?.telemetry_binding
    if (!binding) return
    setProductEventTelemetryBinding(binding)
    void flushProductEventOutbox()
  }, [currentUserQuery.data?.telemetry_binding])
  useEffect(() => {
    const binding = currentUserQuery.data?.telemetry_binding
    if (!binding) return
    const delay = refreshDelay(binding)
    if (delay === null) return

    let cancelled = false
    let refreshTimer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: currentUserQueryKey })
      } finally {
        if (!cancelled) {
          refreshTimer = setTimeout(() => void refresh(), TELEMETRY_BINDING_REFRESH_RETRY_MS)
        }
      }
    }
    refreshTimer = setTimeout(() => void refresh(), delay)
    return () => {
      cancelled = true
      clearTimeout(refreshTimer)
    }
  }, [currentUserQuery.data?.telemetry_binding, queryClient])
  return null
}
