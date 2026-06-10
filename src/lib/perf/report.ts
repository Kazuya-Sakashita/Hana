'use client'

import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals'

// ISSUE-024 Web Vitals RUM の購読 + sendBeacon 送信。
// - 5 メトリクス (CLS / FCP / INP / LCP / TTFB) を購読
// - 値が確定したタイミング (または page hide) で sendBeacon
// - sendBeacon: ページ離脱直前でも確実に送れる (fetch だと cancel される)
// - PII を絶対に含めない: name / value / id / navigationType / route のみ

const ENDPOINT = '/v1/metrics/vitals'

function sanitizeRoute(pathname: string): string {
  // 動的セグメントを匿名化: `/memory/c27d...` → `/memory/[memoryId]`
  // 単純化のため UUID 様セグメントを `[memoryId]` 等に置換
  return pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => {
    void m
    return '[id]'
  })
}

function send(metric: Metric): void {
  const payload = {
    name: metric.name,
    value: metric.value,
    id: metric.id,
    navigationType: metric.navigationType ?? null,
    route: sanitizeRoute(window.location.pathname),
  }
  const body = JSON.stringify(payload)
  try {
    // sendBeacon は Content-Type が text/plain になるが、 サーバは JSON.parse で OK
    const blob = new Blob([body], { type: 'application/json' })
    const ok = navigator.sendBeacon(ENDPOINT, blob)
    if (!ok) {
      // sendBeacon が失敗 (例: payload too large) なら fetch にフォールバック
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      })
    }
  } catch {
    // 計測でアプリを壊さない
  }
}

let started = false

export function startReportingWebVitals(): void {
  if (started) return
  if (typeof window === 'undefined') return
  if (typeof navigator === 'undefined' || typeof navigator.sendBeacon !== 'function') return
  started = true

  onCLS(send)
  onFCP(send)
  onINP(send)
  onLCP(send)
  onTTFB(send)
}
