import Link from 'next/link'
import { Album, Home, RotateCcw, Sprout } from 'lucide-react'
import { FocusedShell } from '@/components/product/app-shell'
import { QuietIcon } from '@/components/product/icons'
import { StatePanel } from '@/components/product/surfaces'
import { Button } from '@/components/ui/button'

type RecoveryScreenProps = {
  eyebrow: string
  title: string
  description: string
  retry?: () => void
}

export function RecoveryScreen({ eyebrow, title, description, retry }: RecoveryScreenProps) {
  return (
    <FocusedShell className="px-5 py-8 sm:px-6 sm:py-12">
      <StatePanel
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
        className="mx-auto w-full max-w-md px-5 py-8 sm:px-8 sm:py-10"
      >
        <div
          className="border-hairline bg-warm mx-auto flex size-12 items-center justify-center rounded-full border"
          aria-hidden="true"
        >
          <QuietIcon icon={Sprout} tone="primary" />
        </div>
        <p className="meta-label mt-5">{eyebrow}</p>
        <h1 id="recovery-title" className="mt-2 font-serif text-2xl leading-snug">
          {title}
        </h1>
        <p id="recovery-description" className="text-ink-secondary mt-4 text-sm leading-narrative">
          {description}
        </p>
        <div className="mt-7 flex flex-col gap-3">
          {retry ? (
            <Button type="button" size="lg" onClick={retry} className="min-h-11 w-full">
              <RotateCcw aria-hidden="true" />
              もう一度 ひらく
            </Button>
          ) : null}
          <Button asChild type="button" size="lg" variant={retry ? 'outline' : 'default'}>
            <Link href="/" className="min-h-11 w-full">
              <Home aria-hidden="true" />
              ホームへ もどる
            </Link>
          </Button>
          <Button asChild type="button" size="lg" variant="outline">
            <Link href="/album" className="min-h-11 w-full">
              <Album aria-hidden="true" />
              アルバムを ひらく
            </Link>
          </Button>
        </div>
      </StatePanel>
    </FocusedShell>
  )
}
