'use client'

import { useState } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase/browser'

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
      setError(e.message)
      setPending(false)
    }
  }

  return (
    <main style={{ padding: '2rem', maxWidth: 400, margin: '0 auto' }}>
      <h1>Hana にサインイン</h1>
      <p style={{ marginTop: '0.5rem', color: '#555' }}>Google アカウントでサインインします。</p>
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={pending}
        style={{
          marginTop: '1.5rem',
          padding: '0.75rem 1rem',
          borderRadius: 8,
          border: '1px solid #ccc',
          background: '#fff',
          fontSize: '1rem',
          cursor: pending ? 'wait' : 'pointer',
          width: '100%',
        }}
      >
        {pending ? '...' : 'Google でサインイン'}
      </button>
      {error ? <p style={{ marginTop: '1rem', color: '#c00' }}>{error}</p> : null}
      <p style={{ marginTop: '2rem', fontSize: '0.85rem', color: '#888' }}>
        Apple でのサインインは ISSUE-006a で追加予定です。
      </p>
    </main>
  )
}
