import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type QuietIconTone = 'default' | 'muted' | 'primary' | 'favorite' | 'warning' | 'onPrimary'
export type QuietIconSize = 'sm' | 'md' | 'lg' | 'display'

const iconToneClasses: Record<QuietIconTone, string> = {
  default: 'text-ink-secondary',
  muted: 'text-ink-tertiary',
  primary: 'text-leaf-deep dark:text-leaf',
  favorite: 'text-ink-tertiary',
  warning: 'text-amber',
  onPrimary: 'text-primary-foreground',
}

const iconSizeClasses: Record<QuietIconSize, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-7',
  display: 'size-10',
}

const iconStrokeWidth: Record<QuietIconSize, number> = {
  sm: 1.75,
  md: 1.75,
  lg: 1.65,
  display: 1.55,
}

type QuietIconDecorativeProps = {
  icon: LucideIcon
  tone?: QuietIconTone
  size?: QuietIconSize
  active?: boolean
  className?: string
  decorative?: true
  label?: never
}

type QuietIconSemanticProps = {
  icon: LucideIcon
  tone?: QuietIconTone
  size?: QuietIconSize
  active?: boolean
  className?: string
  decorative: false
  label: string
}

type QuietIconProps = QuietIconDecorativeProps | QuietIconSemanticProps

export function QuietIcon({
  icon: Icon,
  tone = 'default',
  size = 'md',
  active = false,
  decorative = true,
  label,
  className,
}: QuietIconProps) {
  const fill = tone === 'favorite' && active ? 'currentColor' : 'none'
  const toneClass = tone === 'favorite' && active ? 'text-sakura-deep' : iconToneClasses[tone]

  return (
    <Icon
      aria-hidden={decorative}
      aria-label={decorative ? undefined : label}
      role={decorative ? undefined : 'img'}
      className={cn(iconSizeClasses[size], toneClass, className)}
      strokeWidth={active ? 1.9 : iconStrokeWidth[size]}
      fill={fill}
    />
  )
}

const iconButtonToneClasses: Record<Exclude<QuietIconTone, 'onPrimary'>, string> = {
  default: 'border-hairline bg-paper-slip text-ink-secondary hover:bg-warm hover:text-ink',
  muted: 'border-hairline bg-paper-slip text-ink-tertiary hover:bg-warm hover:text-ink-secondary',
  primary:
    'border-leaf/30 bg-primary text-primary-foreground hover:bg-leaf-deep hover:text-white active:bg-leaf-deep active:text-white',
  favorite: 'border-sakura/20 bg-paper-slip text-sakura-deep hover:bg-warm',
  warning: 'border-amber/30 bg-paper-slip text-amber hover:bg-warm',
}

interface QuietIconButtonProps extends Omit<React.ComponentProps<'button'>, 'children'> {
  icon: LucideIcon
  label: string
  tone?: Exclude<QuietIconTone, 'onPrimary'>
  active?: boolean
}

export function QuietIconButton({
  icon,
  label,
  tone = 'default',
  active = false,
  className,
  type = 'button',
  ...props
}: QuietIconButtonProps) {
  const iconTone: QuietIconTone = tone === 'primary' ? 'onPrimary' : tone

  return (
    <button
      type={type}
      className={cn(
        'ease-organic tap-target inline-flex size-11 shrink-0 items-center justify-center rounded-full border shadow-soft outline-none transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        iconButtonToneClasses[tone],
        className,
      )}
      {...props}
      aria-label={label}
    >
      <QuietIcon icon={icon} tone={iconTone} active={active} />
    </button>
  )
}
