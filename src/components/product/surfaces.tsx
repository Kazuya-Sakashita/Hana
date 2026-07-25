import * as React from 'react'
import { Camera, type LucideIcon } from 'lucide-react'
import { QuietIcon } from '@/components/product/icons'
import { cn } from '@/lib/utils'

export function KeepsakeSurface({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('paper-surface rounded-[var(--radius-paper-slip)] px-5 py-5', className)}
      {...props}
    />
  )
}

export function PaperSlip({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('paper-surface rounded-[var(--radius-paper-slip)] px-4 py-4', className)}
      {...props}
    />
  )
}

export function PhotoMat({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('photo-mat rounded-[var(--radius-photo-mat)] p-2', className)} {...props} />
  )
}

export function PhotoInner({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('rounded-[var(--radius-photo-inner)] bg-paper-slip', className)}
      {...props}
    />
  )
}

export function KeepsakePreview({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('paper-surface rounded-[var(--radius-paper-slip)] p-3 shadow-soft', className)}
      {...props}
    />
  )
}

export function PhotoPlaceholder({
  title,
  description,
  icon = Camera,
  className,
  ...props
}: {
  title: React.ReactNode
  description?: React.ReactNode
  icon?: LucideIcon
  className?: string
} & Omit<React.ComponentProps<typeof PhotoMat>, 'children' | 'title'>) {
  return (
    <PhotoMat
      className={cn(
        'flex min-h-44 flex-col items-center justify-center gap-3 text-center',
        className,
      )}
      {...props}
    >
      <PhotoInner className="flex min-h-36 w-full flex-col items-center justify-center gap-3 px-4 py-6 text-center">
        <QuietIcon icon={icon} tone="muted" size="lg" />
        <div className="space-y-1">
          <p className="font-serif text-base leading-snug">{title}</p>
          {description ? (
            <p className="text-ink-secondary mx-auto max-w-48 text-xs leading-narrative">
              {description}
            </p>
          ) : null}
        </div>
      </PhotoInner>
    </PhotoMat>
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
