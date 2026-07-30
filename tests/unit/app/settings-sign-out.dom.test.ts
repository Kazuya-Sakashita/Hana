// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  signOutAndClear: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/features/auth/client/sign-out', () => ({
  clearLocalSessionState: vi.fn(),
  signOutAndClear: mocks.signOutAndClear,
}))

vi.mock('@/features/me/client/use-current-user', () => ({
  currentUserQueryKey: ['me'],
  useCurrentUserQuery: () => ({
    data: {
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      email: null,
      display_name: null,
      ai_consent_at: null,
      created_at: '2026-05-14T09:30:00.000Z',
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useRevokeAiConsentMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/features/children/client/use-children', () => ({
  useChildrenQuery: () => ({
    data: { data: [] },
    isPending: false,
    isError: false,
    error: null,
  }),
}))

import SettingsPage from '@/app/settings/page'

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button
}

describe('settings sign-out DOM flow', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    act(() => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(SettingsPage)),
      )
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('stays on settings, reports failure, and allows a retry', async () => {
    mocks.signOutAndClear.mockRejectedValueOnce(new Error('synthetic network failure'))

    await act(async () => findButton('サインアウト').click())

    const alert = document.querySelector<HTMLElement>('[role="alert"]')
    expect(alert?.textContent).toContain('サインアウトを完了できませんでした')
    expect(mocks.push).not.toHaveBeenCalled()
    expect(findButton('サインアウト').disabled).toBe(false)

    mocks.signOutAndClear.mockResolvedValueOnce(undefined)
    await act(async () => findButton('サインアウト').click())
    expect(mocks.push).toHaveBeenCalledWith('/sign-in')
  })
})
