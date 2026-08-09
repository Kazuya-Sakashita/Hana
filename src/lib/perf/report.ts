'use client'

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'
import { createWebVitalsReport } from '@/features/metrics/client/web-vitals-report'

const ENDPOINT = '/v1/metrics/vitals'

function send(metric: Metric): void {
  try {
    const body = JSON.stringify(createWebVitalsReport(metric, window.location.pathname))
    void fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      body,
      keepalive: true,
    }).catch(() => undefined)
  } catch {
    return
  }
}

let started = false

export function startReportingWebVitals(): void {
  if (started) return
  if (typeof window === 'undefined') return
  started = true

  onCLS(send)
  onFCP(send)
  onINP(send)
  onLCP(send)
  onTTFB(send)
}
