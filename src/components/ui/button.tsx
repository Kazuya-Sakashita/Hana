import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "ease-organic tap-target inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-sm font-medium outline-none transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Quiet Heirloom: primary は記録・保存・完了を担う sage の pill。
        default:
          'rounded-full bg-primary text-primary-foreground shadow-soft hover:bg-leaf-deep hover:text-white active:bg-leaf-deep active:text-white',
        secondary: 'rounded-xl bg-warm text-secondary-foreground hover:bg-photo-mat',
        outline:
          'rounded-xl border border-hairline bg-paper-slip text-ink shadow-soft hover:bg-warm',
        ghost: 'rounded-xl text-ink-secondary hover:bg-warm hover:text-ink',
        destructive: 'rounded-xl text-amber hover:bg-warm',
        link: 'text-ink-secondary underline-offset-4 hover:underline hover:text-ink',
      },
      size: {
        default: 'h-11 px-6 py-2',
        sm: 'h-11 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'size-11 rounded-full',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
