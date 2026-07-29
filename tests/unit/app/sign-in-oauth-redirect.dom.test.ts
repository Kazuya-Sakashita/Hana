// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
}))

vi.mock('@/lib/supabase/browser', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithOAuth: mocks.signInWithOAuth,
    },
  }),
}))

import SignInPage from '@/app/sign-in/page'

function findGoogleButton(): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes('Google で つづける'),
  )
  if (!button) throw new Error('Google sign-in button not found')
  return button
}

describe('sign-in OAuth return path', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    mocks.signInWithOAuth.mockReset()
    mocks.signInWithOAuth.mockResolvedValue({ error: null })
    window.history.replaceState({}, '', '/sign-in')
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  async function renderAndStartOAuth() {
    act(() => root.render(createElement(SignInPage)))
    await act(async () => {
      findGoogleButton().click()
      await Promise.resolve()
    })
  }

  it('forwards a safe next path to the configured callback origin', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hana.example/app')
    window.history.replaceState({}, '', '/sign-in?next=%2Falbum%3Fmonth%3D2026-07')

    await renderAndStartOAuth()

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://hana.example/auth/callback?next=%2Falbum%3Fmonth%3D2026-07',
      },
    })
  })

  it('drops an unsafe next path before starting OAuth', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hana.example')
    window.history.replaceState({}, '', '/sign-in?next=%2F%2Fattacker.example%2Fpath')

    await renderAndStartOAuth()

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://hana.example/auth/callback',
      },
    })
  })

  it('uses the fail-safe Hana origin when the public app URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    window.history.replaceState({}, '', '/sign-in?next=%2Frecord')

    await renderAndStartOAuth()

    expect(mocks.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://hana.app/auth/callback?next=%2Frecord',
      },
    })
  })

  it('shows a retry message after callback failure', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://hana.example')
    window.history.replaceState({}, '', '/sign-in?next=%2Falbum&reason=oauth_callback_failed')

    act(() => root.render(createElement(SignInPage)))

    await vi.waitFor(() => {
      expect(document.querySelector('[role="alert"]')?.textContent).toBe(
        'サインインを 完了できませんでした。少しおいて、もういちど ためしてください。',
      )
      expect(document.querySelector<HTMLAnchorElement>('a[href="/lp"]')?.textContent).toBe(
        'Hanaについて',
      )
    })
  })
})
