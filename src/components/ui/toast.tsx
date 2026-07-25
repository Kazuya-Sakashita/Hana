'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { X } from 'lucide-react'
import { QuietIconButton } from '@/components/product/icons'

type ToastTone = 'success' | 'warning'

interface ToastInput {
  title: string
  description?: string
  tone?: ToastTone
}

interface ToastMessage extends ToastInput {
  id: number
  tone: ToastTone
}

interface ToastApi {
  showToast: (toast: ToastInput) => void
  dismissToast: () => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  const showToast = useCallback((input: ToastInput) => {
    setToast({
      id: Date.now(),
      tone: input.tone ?? 'warning',
      title: input.title,
      description: input.description,
    })
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const value = useMemo(() => ({ showToast, dismissToast }), [showToast, dismissToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? <Toast message={toast} onDismiss={dismissToast} /> : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}

function Toast({ message, onDismiss }: { message: ToastMessage; onDismiss: () => void }) {
  const toneClass =
    message.tone === 'success'
      ? 'border-leaf/30 bg-elevated text-ink'
      : 'border-amber/30 bg-elevated text-ink'

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[80] flex justify-center px-4"
    >
      <div
        className={`shadow-lift pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-sheet)] border px-4 py-3 ${toneClass}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-serif text-sm leading-relaxed">{message.title}</p>
          {message.description ? (
            <p className="text-ink-secondary mt-1 text-xs leading-relaxed">{message.description}</p>
          ) : null}
        </div>
        <QuietIconButton
          icon={X}
          tone="muted"
          label="toast を とじる"
          onClick={onDismiss}
          className="-mr-2 -mt-2 shadow-none"
        />
      </div>
    </div>
  )
}
