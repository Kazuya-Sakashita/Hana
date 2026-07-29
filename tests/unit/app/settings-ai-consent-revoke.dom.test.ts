// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  mutateAsync: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

vi.mock('@/features/me/client/use-current-user', () => ({
  currentUserQueryKey: ['me'],
  useCurrentUserQuery: () => ({
    data: {
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      email: null,
      display_name: null,
      ai_consent_at: '2026-06-01T00:00:00.000Z',
      created_at: '2026-05-14T09:30:00.000Z',
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useRevokeAiConsentMutation: () => ({
    isPending: false,
    mutateAsync: mocks.mutateAsync,
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
import { settingsTrustCenterCopy } from '@/lib/ui/settings-trust-center-copy'

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button
}

describe('settings AI consent revocation DOM flow', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderPage() {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['me'], {
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      ai_consent_at: '2026-06-01T00:00:00.000Z',
    })
    act(() => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(SettingsPage)),
      )
    })
  }

  it('opens on the safe action and focuses the success status after revocation', async () => {
    mocks.mutateAsync.mockResolvedValue({
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      ai_consent_at: null,
    })
    renderPage()

    act(() => findButton(settingsTrustCenterCopy.ai.revokeButton).click())
    expect(document.activeElement?.id).toBe('ai-consent-revoke-cancel')

    await act(async () => {
      findButton(settingsTrustCenterCopy.ai.revokeConfirm).click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement?.textContent).toBe(settingsTrustCenterCopy.ai.revokeDone)
    })
  })

  it('keeps the dialog open and reports uncertainty when the response cannot be confirmed', async () => {
    mocks.mutateAsync.mockRejectedValue(new Error('synthetic network failure'))
    renderPage()

    act(() => findButton(settingsTrustCenterCopy.ai.revokeButton).click())
    await act(async () => {
      findButton(settingsTrustCenterCopy.ai.revokeConfirm).click()
      await Promise.resolve()
    })

    const alert = document.querySelector<HTMLElement>('[role="alert"]')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(alert?.textContent).toBe(settingsTrustCenterCopy.ai.revokeFailed)
    expect(alert?.textContent).toContain('確認できませんでした')
  })

  it('promotes an ambiguous DELETE failure to success when refetch confirmed revocation', async () => {
    mocks.mutateAsync.mockImplementation(async () => {
      queryClient.setQueryData(['me'], {
        id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
        ai_consent_at: null,
      })
      throw new Error('synthetic response loss after server update')
    })
    renderPage()

    act(() => findButton(settingsTrustCenterCopy.ai.revokeButton).click())
    await act(async () => {
      findButton(settingsTrustCenterCopy.ai.revokeConfirm).click()
      await Promise.resolve()
    })
    await vi.waitFor(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement?.textContent).toBe(settingsTrustCenterCopy.ai.revokeDone)
    })
  })
})
