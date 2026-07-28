'use client'

import { useEffect, useRef } from 'react'
import { reportProductEvent, type ProductEventName } from './product-events'

export function ProductEventMarker({ eventName }: { eventName: ProductEventName }) {
  const reportedRef = useRef(false)

  useEffect(() => {
    if (reportedRef.current) return
    reportedRef.current = true
    reportProductEvent({
      eventName,
      elapsedMs: null,
    })
  }, [eventName])

  return null
}
