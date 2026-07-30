// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'

const mocks = vi.hoisted(() => ({
  updateChild: vi.fn(),
  pending: false,
}))

vi.mock('@/features/children/client/use-children', () => ({
  useUpdateChildMutation: () => ({
    isPending: mocks.pending,
    mutateAsync: mocks.updateChild,
  }),
}))

import { ChildProfileEditForm } from '@/features/children/client/child-profile-edit-form'

const child = {
  id: '4a2c89b6-1234-4d8e-9abc-fedcba987654',
  name: '合成の呼び名',
  birthdate: '2026-01-13',
  avatar_url: null,
  created_at: '2026-05-23T01:30:00.000Z',
  updated_at: '2026-05-23T01:30:00.000Z',
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button as HTMLButtonElement
}

describe('ISSUE-127 child profile edit form', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(async () => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(ChildProfileEditForm, { child })))
    await act(async () => findButton('呼び名と うまれたひを なおす').click())
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.clearAllMocks()
  })

  it('shows current values and cancels without writing', async () => {
    expect((document.querySelector('#settings-child-name') as HTMLInputElement).value).toBe(
      '合成の呼び名',
    )
    expect((document.querySelector('#settings-child-birthdate') as HTMLInputElement).value).toBe(
      '2026-01-13',
    )
    await act(async () => findButton('変更せず もどる').click())
    expect(mocks.updateChild).not.toHaveBeenCalled()
    expect(findButton('呼び名と うまれたひを なおす')).toBeTruthy()
  })

  it('rejects a blank name and future birthdate before calling the API', async () => {
    await act(async () => {
      setInputValue(document.querySelector('#settings-child-name') as HTMLInputElement, '   ')
      setInputValue(
        document.querySelector('#settings-child-birthdate') as HTMLInputElement,
        '2999-01-01',
      )
    })
    await act(async () => findButton('この内容で 保存する').click())
    expect(mocks.updateChild).not.toHaveBeenCalled()
    expect(document.querySelector('#settings-child-name-error')?.textContent).toContain('呼び名')
    expect(document.querySelector('#settings-child-birthdate-error')?.textContent).toContain(
      'きょうまで',
    )
    expect(document.activeElement?.id).toBe('settings-child-name')
  })

  it('saves trimmed values and shows a polite completion status', async () => {
    mocks.updateChild.mockResolvedValue({
      ...child,
      name: '更新後の呼び名',
      birthdate: '2025-12-01',
    })
    await act(async () => {
      setInputValue(
        document.querySelector('#settings-child-name') as HTMLInputElement,
        '  更新後の呼び名  ',
      )
      setInputValue(
        document.querySelector('#settings-child-birthdate') as HTMLInputElement,
        '2025-12-01',
      )
    })
    await act(async () => findButton('この内容で 保存する').click())
    expect(mocks.updateChild).toHaveBeenCalledWith({
      childId: child.id,
      body: { name: '更新後の呼び名', birthdate: '2025-12-01' },
    })
    expect(document.querySelector('[role="status"]')?.textContent).toContain('変更しました')
  })

  it('keeps entered values when the API fails', async () => {
    mocks.updateChild.mockRejectedValue(
      new ApiProblemError({
        type: 'https://hana.app/problems/internal-error',
        title: 'Internal Server Error',
        status: 500,
        detail: '安全な失敗',
        reason: 'internal_error',
        instance: 'synthetic-request',
      }),
    )
    await act(async () => {
      setInputValue(
        document.querySelector('#settings-child-name') as HTMLInputElement,
        '保存前の入力',
      )
    })
    await act(async () => findButton('この内容で 保存する').click())
    expect((document.querySelector('#settings-child-name') as HTMLInputElement).value).toBe(
      '保存前の入力',
    )
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('入力はそのまま')
  })
})
