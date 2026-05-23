import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] ease-organic",
  {
    variants: {
      variant: {
        // V0 prompt §1: primary は pill (rounded-full)、sakura accent
        default:
          'rounded-full bg-primary text-primary-foreground shadow-soft hover:bg-sakura-deep hover:text-white',
        secondary: 'rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'rounded-xl border border-hairline bg-elevated text-ink hover:bg-warm',
        ghost: 'rounded-xl text-ink-secondary hover:bg-warm hover:text-ink',
        destructive: 'rounded-xl text-amber hover:bg-warm',
        link: 'text-ink-secondary underline-offset-4 hover:underline hover:text-ink',
      },
      size: {
        default: 'h-11 px-6 py-2',
        sm: 'h-9 px-4 text-xs',
        lg: 'h-12 px-8 text-base',
        icon: 'size-10 rounded-full',
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
