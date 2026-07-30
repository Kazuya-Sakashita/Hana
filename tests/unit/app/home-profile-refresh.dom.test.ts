// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateChild: vi.fn(),
  hardNavigateTo: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ refresh: mocks.refresh }),
}))

vi.mock('@/lib/browser-navigation', () => ({
  hardNavigateTo: mocks.hardNavigateTo,
}))

vi.mock('@/features/children/client/use-children', () => ({
  useUpdateChildMutation: () => ({
    isPending: false,
    mutateAsync: mocks.updateChild,
  }),
}))

import { BottomNav } from '@/components/bottom-nav'
import { ChildProfileEditForm } from '@/features/children/client/child-profile-edit-form'

const child = {
  id: '4a2c89b6-1234-4d8e-9abc-fedcba987654',
  name: '合成の呼び名',
  birthdate: '2026-01-13',
  avatar_url: null,
  created_at: '2026-05-23T01:30:00.000Z',
  updated_at: '2026-05-23T01:30:00.000Z',
}

function findButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button as HTMLButtonElement
}

describe('home profile refresh navigation', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    sessionStorage.clear()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    mocks.updateChild.mockResolvedValue({ ...child, name: '更新後の呼び名' })
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(ChildProfileEditForm, { child }),
          createElement(BottomNav),
        ),
      ),
    )
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('hard reloads home once after a profile update, then returns to normal navigation', async () => {
    await act(async () => findButton('呼び名と うまれたひを なおす').click())
    await act(async () => findButton('この内容で 保存する').click())

    const homeLink = document.querySelector('a[href="/"]') as HTMLAnchorElement
    await act(async () => homeLink.click())
    expect(mocks.hardNavigateTo).toHaveBeenCalledWith('/')

    mocks.hardNavigateTo.mockClear()
    await act(async () => homeLink.click())
    expect(mocks.hardNavigateTo).not.toHaveBeenCalled()
  })
})
