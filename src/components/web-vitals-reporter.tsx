'use client'

import { useEffect } from 'react'
import { startReportingWebVitals } from '@/lib/perf/report'

// ISSUE-024: layout.tsx に組み込んで全ページで Web Vitals を計測する。
// mount 時に 1 回だけ購読を開始 (内部で多重起動防止)。
export function WebVitalsReporter() {
  useEffect(() => {
    startReportingWebVitals()
  }, [])
  return null
}
