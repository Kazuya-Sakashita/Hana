'use client'

import { useEffect, useRef } from 'react'
import { useCurrentUserQuery } from '@/features/me/client/use-current-user'
import { reportProductEvent, type ProductEventName } from './product-events'

export function ProductEventMarker({ eventName }: { eventName: ProductEventName }) {
  const reportedRef = useRef(false)
  const currentUserQuery = useCurrentUserQuery()

  useEffect(() => {
    const telemetryBinding = currentUserQuery.data?.telemetry_binding
    if (reportedRef.current || !telemetryBinding) return
    reportedRef.current = true
    reportProductEvent({
      eventName,
      elapsedMs: null,
      telemetryBinding,
    })
  }, [currentUserQuery.data?.telemetry_binding, eventName])

  return null
}
