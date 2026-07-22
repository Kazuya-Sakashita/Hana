'use client'

import { useSyncExternalStore } from 'react'

// ISSUE-012 から継承: SSR/CSR の時刻差で hydration mismatch しないよう、
// server snapshot は固定 'こんにちは'、 client snapshot で時刻判定する。
// useSyncExternalStore は setState in effect を避ける canonical な書き方。
function greeting(date = new Date()): string {
  const h = date.getHours()
  if (h >= 6 && h < 11) return 'おはようございます'
  if (h >= 11 && h < 17) return 'こんにちは'
  if (h >= 17 && h < 22) return 'こんばんは'
  return 'おかえりなさい'
}

export function HomeGreeting() {
  const greetingText = useSyncExternalStore(
    () => () => undefined,
    () => greeting(),
    () => 'こんにちは',
  )
  return <p className="text-ink font-serif text-base">{greetingText}</p>
}
