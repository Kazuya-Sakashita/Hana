'use client'

import { ImagePlus, PenLine, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'
import { FocusedShell } from '@/components/product/app-shell'
import { QuietIcon } from '@/components/product/icons'
import { StatePanel } from '@/components/product/surfaces'
import { Button } from '@/components/ui/button'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5">
      <path
        d="M21.6 12.227c0-.709-.064-1.39-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.995 3.018v2.51h3.232c1.89-1.74 2.981-4.305 2.981-7.351z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.964-.895 6.619-2.422l-3.232-2.51c-.895.6-2.04.955-3.387.955-2.605 0-4.81-1.76-5.596-4.123H3.064v2.59A9.997 9.997 0 0 0 12 22z"
        fill="#34A853"
      />
      <path
        d="M6.404 13.9A5.99 5.99 0 0 1 6.09 12c0-.658.114-1.297.314-1.9V7.51H3.064A9.997 9.997 0 0 0 2 12c0 1.614.386 3.14 1.064 4.49l3.34-2.59z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.977c1.469 0 2.787.505 3.823 1.495l2.867-2.867C16.96 3.057 14.695 2 12 2A9.997 9.997 0 0 0 3.064 7.51l3.34 2.59C7.191 7.737 9.395 5.977 12 5.977z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function SignInPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function signInWithGoogle() {
    setError(null)
    setPending(true)
    const supabase = createSupabaseBrowserClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${appUrl}/auth/callback`,
      },
    })
    if (e) {
      setError(quietStateCopy.signIn.failed)
      setPending(false)
    }
  }

  return (
    <FocusedShell
      className="items-stretch justify-start px-0 py-0 sm:items-center sm:justify-center sm:px-6 sm:py-12"
      contentClassName="max-w-none sm:max-w-sm"
    >
      <StatePanel
        className="flex min-h-dvh flex-col rounded-none px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-14 text-left sm:min-h-0 sm:rounded-[var(--radius-paper-slip)] sm:py-8"
        aria-labelledby="signin-title"
      >
        <div className="text-center">
          <p className="meta-label">Hana</p>
          <h1 id="signin-title" className="mt-2 font-serif text-2xl leading-snug">
            Hana に
            <br />
            サインイン
          </h1>
          <p className="text-ink-secondary mt-3 text-sm leading-narrative">
            きょうの小さなできごとを、写真 1 まいから静かに残します。
          </p>
        </div>

        <section
          className="border-hairline mt-8 flex flex-col gap-4 border-y py-5"
          data-testid="signin-trust-bridge"
          aria-labelledby="signin-trust-title"
        >
          <h2 id="signin-trust-title" className="sr-only">
            サインイン前に確認できること
          </h2>
          <ul className="flex flex-col gap-4">
            <li className="flex gap-3">
              <QuietIcon icon={ImagePlus} tone="primary" />
              <p className="text-ink-secondary text-sm leading-narrative">
                サインインだけでは、写真や記録は作成されません。
              </p>
            </li>
            <li className="flex gap-3">
              <QuietIcon icon={PenLine} tone="muted" />
              <p className="text-ink-secondary text-sm leading-narrative">
                AI を使う前に、送るものを確認します。
              </p>
            </li>
            <li className="flex gap-3">
              <QuietIcon icon={ShieldCheck} tone="muted" />
              <p className="text-ink-secondary text-sm leading-narrative">
                この先も、必要な確認をひとつずつ表示します。
              </p>
            </li>
          </ul>
        </section>

        <div className="mt-auto flex flex-col gap-4 pt-8 sm:mt-0 sm:pt-7">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={signInWithGoogle}
            disabled={pending}
            className="w-full"
          >
            <GoogleGlyph />
            {pending ? quietStateCopy.signIn.pending : 'Google で つづける'}
          </Button>
          {error ? (
            <p className="text-amber text-center text-sm" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </StatePanel>
    </FocusedShell>
  )
}
