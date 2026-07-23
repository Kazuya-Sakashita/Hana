import * as React from 'react'
import { cn } from '@/lib/utils'

type ShellProps = React.ComponentProps<'main'> & {
  contentClassName?: string
}

export function AppShell({ className, contentClassName, children, ...props }: ShellProps) {
  return (
    <main className={cn('bg-canvas min-h-dvh px-6 pb-28 pt-8', className)} {...props}>
      <div className={cn('mx-auto w-full max-w-md', contentClassName)}>{children}</div>
    </main>
  )
}

export function FocusedShell({ className, contentClassName, children, ...props }: ShellProps) {
  return (
    <main
      className={cn('flex min-h-dvh items-center justify-center bg-canvas px-6 py-12', className)}
      {...props}
    >
      <div className={cn('w-full max-w-md', contentClassName)}>{children}</div>
    </main>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  className,
  children,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <header className={cn('mb-8', className)}>
      {eyebrow ? <p className="meta-label">{eyebrow}</p> : null}
      <h1 className="mt-2 font-serif text-2xl leading-snug">{title}</h1>
      {description ? (
        <p className="text-ink-secondary mt-3 text-sm leading-narrative">{description}</p>
      ) : null}
      {children}
    </header>
  )
}
