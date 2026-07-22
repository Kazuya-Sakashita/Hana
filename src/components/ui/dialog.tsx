'use client'

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface AccessibleDialogProps {
  titleId: string
  descriptionId: string
  onClose: () => void
  children: ReactNode
  pending?: boolean
  className?: string
}

export function AccessibleDialog({
  titleId,
  descriptionId,
  onClose,
  children,
  pending = false,
  className,
}: AccessibleDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    const previousOverflow = document.body.style.overflow
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    document.body.style.overflow = 'hidden'

    const frame = window.requestAnimationFrame(() => {
      const firstFocusable = getFocusableElements(dialog)[0]
      ;(firstFocusable ?? dialog).focus({ preventScroll: true })
    })

    return () => {
      window.cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus({ preventScroll: true })
      }
    }
  }, [])

  function onDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (!pending) onClose()
      return
    }

    if (event.key !== 'Tab') return

    const focusable = getFocusableElements(event.currentTarget)
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (!first || !last) {
      event.preventDefault()
      event.currentTarget.focus({ preventScroll: true })
      return
    }

    const active = document.activeElement
    if (event.shiftKey && (active === first || active === event.currentTarget)) {
      event.preventDefault()
      last.focus({ preventScroll: true })
      return
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus({ preventScroll: true })
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      data-dialog-foundation="accessible"
      data-pending={pending ? 'true' : 'false'}
      onKeyDown={onDialogKeyDown}
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center',
        className,
      )}
    >
      {children}
    </div>
  )
}

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => element.tabIndex >= 0 && element.getAttribute('aria-hidden') !== 'true',
  )
}
