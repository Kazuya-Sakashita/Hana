import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
    },
  })),
}))

import { GET } from '@/app/auth/callback/route'

describe('OAuth callback redirect', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hana.example')
    mocks.exchangeCodeForSession.mockReset()
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('redirects a successful callback to a safe internal path', async () => {
    const response = await GET(
      new Request(
        'https://attacker.example/auth/callback?code=synthetic&next=%2Falbum%3Fmonth%3D2026-07',
      ),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://hana.example/album?month=2026-07')
    expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith('synthetic')
  })

  it('falls back to the home path for an external redirect', async () => {
    const response = await GET(
      new Request(
        'https://hana.example/auth/callback?code=synthetic&next=%2F%2Fattacker.example%2Fpath',
      ),
    )

    expect(response.headers.get('location')).toBe('https://hana.example/')
  })

  it('blocks an encoded dot-segment redirect after URL normalization', async () => {
    const response = await GET(
      new Request(
        'https://attacker.example/auth/callback?code=synthetic&next=%2F%252e%252e%2F%2Fattacker.example%2Fpath',
      ),
    )

    expect(response.headers.get('location')).toBe('https://hana.example/')
  })

  it('returns to sign-in when the code is missing', async () => {
    const response = await GET(new Request('https://attacker.example/auth/callback?next=%2Falbum'))

    expect(response.headers.get('location')).toBe(
      'https://hana.example/sign-in?next=%2Falbum&reason=oauth_callback_failed',
    )
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it('returns to sign-in when session exchange fails', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { name: 'AuthError' } })

    const response = await GET(
      new Request('https://attacker.example/auth/callback?code=synthetic&next=%2Falbum'),
    )

    expect(response.headers.get('location')).toBe(
      'https://hana.example/sign-in?next=%2Falbum&reason=oauth_callback_failed',
    )
  })

  it('does not retain an unsafe return path when session exchange fails', async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { name: 'AuthError' } })

    const response = await GET(
      new Request(
        'https://attacker.example/auth/callback?code=synthetic&next=%2F%2Fattacker.example%2Fpath',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://hana.example/sign-in?reason=oauth_callback_failed',
    )
  })
})
