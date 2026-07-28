'use client'

import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { QuietIcon } from '@/components/product/icons'
import { formatAlbumMonth, shiftAlbumMonth } from '@/features/memories/month'

interface MonthNavigatorProps {
  month: string
  currentMonth: string
  totalCount: number
}

const monthControlClass =
  'ease-organic tap-target border-hairline bg-paper-slip text-ink-secondary hover:bg-warm hover:text-ink inline-flex size-11 shrink-0 items-center justify-center rounded-full border shadow-soft outline-none transition-all active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'

export function focusMonthHeadingOnChange(
  previousMonth: string,
  month: string,
  heading: Pick<HTMLHeadingElement, 'focus'> | null,
): string {
  if (previousMonth === month) return previousMonth
  heading?.focus({ preventScroll: true })
  return month
}

export function MonthNavigator({ month, currentMonth, totalCount }: MonthNavigatorProps) {
  const previousMonth = shiftAlbumMonth(month, -1)
  const nextMonth = shiftAlbumMonth(month, 1)
  const canMoveNext = month < currentMonth
  const monthHeadingRef = useRef<HTMLHeadingElement>(null)
  const previousMonthRef = useRef(month)

  useEffect(() => {
    previousMonthRef.current = focusMonthHeadingOnChange(
      previousMonthRef.current,
      month,
      monthHeadingRef.current,
    )
  }, [month])

  return (
    <nav
      aria-label="ふりかえる月を選ぶ"
      className="paper-surface rounded-[var(--radius-paper-slip)] px-4 py-4"
      data-testid="album-month-navigator"
    >
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/album?month=${previousMonth}`}
          aria-label={`${formatAlbumMonth(previousMonth)}を表示`}
          title={`${formatAlbumMonth(previousMonth)}へ`}
          className={monthControlClass}
        >
          <QuietIcon icon={ChevronLeft} tone="muted" />
        </Link>

        <div className="min-w-0 text-center">
          <h2
            ref={monthHeadingRef}
            tabIndex={-1}
            className="font-serif text-lg leading-snug focus:outline-none"
          >
            {formatAlbumMonth(month)}
          </h2>
          <p
            className="text-ink-secondary mt-1 text-sm"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {totalCount === 0 ? 'この月は静かな余白です' : `この月のページ ${totalCount}件`}
          </p>
        </div>

        {canMoveNext ? (
          <Link
            href={`/album?month=${nextMonth}`}
            aria-label={`${formatAlbumMonth(nextMonth)}を表示`}
            title={`${formatAlbumMonth(nextMonth)}へ`}
            className={monthControlClass}
          >
            <QuietIcon icon={ChevronRight} tone="muted" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-label="未来の月へは進めません"
            title="未来の月へは進めません"
            className={monthControlClass}
          >
            <QuietIcon icon={ChevronRight} tone="muted" />
          </button>
        )}
      </div>
    </nav>
  )
}
