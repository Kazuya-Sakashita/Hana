import * as React from 'react'
import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-hairline bg-paper-slip text-ink placeholder:text-ink-tertiary focus-visible:ring-ring min-h-28 w-full rounded-[var(--radius-paper-slip)] border px-4 py-3 text-base leading-narrative shadow-soft outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
