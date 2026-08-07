'use client'

import { useEffect } from 'react'
import { startProductEventOutbox } from './product-events'

export function ProductEventOutboxFlusher() {
  useEffect(() => startProductEventOutbox(), [])
  return null
}
