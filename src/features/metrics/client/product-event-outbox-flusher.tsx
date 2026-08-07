'use client'

import { useEffect } from 'react'
import { useCurrentUserQuery } from '@/features/me/client/use-current-user'
import {
  flushProductEventOutbox,
  setProductEventTelemetryBinding,
  startProductEventOutbox,
} from './product-events'

export function ProductEventOutboxFlusher() {
  const currentUserQuery = useCurrentUserQuery()
  useEffect(() => startProductEventOutbox(), [])
  useEffect(() => {
    const binding = currentUserQuery.data?.telemetry_binding
    if (!binding) return
    setProductEventTelemetryBinding(binding)
    void flushProductEventOutbox()
  }, [currentUserQuery.data?.telemetry_binding])
  return null
}
