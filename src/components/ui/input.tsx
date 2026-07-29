import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-12 w-full rounded-xl border border-hairline bg-elevated px-4 py-2 text-base text-ink',
        'placeholder:text-ink-tertiary placeholder:font-serif',
        'transition-all focus:border-sakura focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-ring focus-visible:ring-2 focus-visible:ring-ring/30',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
