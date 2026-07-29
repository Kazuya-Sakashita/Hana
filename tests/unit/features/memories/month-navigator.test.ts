import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  focusMonthHeadingOnChange,
  MonthNavigator,
} from '@/features/memories/components/month-navigator'

describe('MonthNavigator', () => {
  it('uses native links for month movement with accessible names', () => {
    const html = renderToStaticMarkup(
      React.createElement(MonthNavigator, {
        month: '2026-05',
        currentMonth: '2026-07',
        totalCount: 3,
      }),
    )

    expect(html).toContain('aria-label="2026年4月を表示"')
    expect(html).toContain('href="/album?month=2026-04"')
    expect(html).toContain('aria-label="2026年6月を表示"')
    expect(html).toContain('href="/album?month=2026-06"')
    expect(html).toContain('この月のページ 3件')
    expect(html).toContain('role="status"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain('tabindex="-1"')
  })

  it('uses a disabled native button instead of linking to a future month', () => {
    const html = renderToStaticMarkup(
      React.createElement(MonthNavigator, {
        month: '2026-07',
        currentMonth: '2026-07',
        totalCount: 0,
      }),
    )

    expect(html).toContain('aria-label="未来の月へは進めません"')
    expect(html).toContain('disabled=""')
    expect(html).not.toContain('href="/album?month=2026-08"')
    expect(html).toContain('この月のページ 0件')
    expect(html).not.toContain('静かな余白')
  })

  it('moves focus to the month heading only when the selected month changes', () => {
    const focus = vi.fn()

    expect(focusMonthHeadingOnChange('2026-04', '2026-05', { focus })).toBe('2026-05')
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })

    focus.mockClear()
    expect(focusMonthHeadingOnChange('2026-05', '2026-05', { focus })).toBe('2026-05')
    expect(focus).not.toHaveBeenCalled()
  })
})
