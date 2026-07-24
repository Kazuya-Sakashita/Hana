import * as React from 'react'
import { cn } from '@/lib/utils'

export function KeepsakeSurface({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('paper-surface rounded-[var(--radius-paper-slip)] px-5 py-5', className)}
      {...props}
    />
  )
}

export function StatePanel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn(
        'paper-surface rounded-[var(--radius-paper-slip)] px-6 py-8 text-center',
        className,
      )}
      {...props}
    />
  )
}

export function TrustSection({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow: string
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <KeepsakeSurface className={className}>
      <p className="meta-label">{eyebrow}</p>
      <h2 className="mt-2 font-serif text-xl leading-snug">{title}</h2>
      {description ? (
        <p className="text-ink-secondary mt-3 text-sm leading-narrative">{description}</p>
      ) : null}
      {children ? <div className="mt-5 flex flex-col gap-4">{children}</div> : null}
    </KeepsakeSurface>
  )
}

export function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-hairline flex flex-col gap-1 border-t pt-3 first:border-t-0 first:pt-0">
      <span className="text-ink-tertiary text-xs">{label}</span>
      <span className="text-ink-secondary text-sm leading-narrative">{value}</span>
    </div>
  )
}
