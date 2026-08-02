// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  updateMemory: vi.fn(),
  updatePending: false,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}))

vi.mock('@/features/memories/client/use-memories', () => ({
  memoriesQueryKey: ['memories'],
  useUpdateMemoryMutation: () => ({
    isPending: mocks.updatePending,
    mutateAsync: mocks.updateMemory,
  }),
}))

import { MemoryEditForm } from '@/features/memories/client/memory-edit-form'

const MEMORY_ID = '11111111-1111-4111-8111-111111111111'

function setControlValue(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    control instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  setter?.call(control, value)
  control.dispatchEvent(new Event('input', { bubbles: true }))
  control.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) =>
      candidate.textContent?.trim() === label || candidate.getAttribute('aria-label') === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button
}

describe('ISSUE-126/144 memory edit form', () => {
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
    document.body.appendChild(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    queryClient.clear()
    container.remove()
    vi.clearAllMocks()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    mocks.updatePending = false
  })

  async function renderForm(
    overrides: Partial<{
      initialTitle: string
      initialBody: string | null
      initialWeather: string | null
    }> = {},
  ) {
    await act(async () => {
      root.render(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(MemoryEditForm, {
            memoryId: MEMORY_ID,
            initialUpdatedAt: '2026-07-30T00:00:00.000Z',
            initialTitle: '合成のタイトル',
            initialBody: '合成の本文',
            initialWeather: 'はれ',
            ...overrides,
          }),
        ),
      )
    })
  }

  it('shows existing values and provides a no-write cancel path', async () => {
    await renderForm()

    const title = document.querySelector('#memory-edit-title') as HTMLInputElement
    expect(title.value).toBe('合成のタイトル')
    expect(title.required).toBe(true)
    expect(document.querySelector('label[for="memory-edit-title"]')?.textContent).toContain('必須')
    expect((document.querySelector('#memory-edit-body') as HTMLTextAreaElement).value).toBe(
      '合成の本文',
    )
    expect((document.querySelector('#memory-edit-weather') as HTMLInputElement).value).toBe('はれ')
    await act(async () => findButton('変更せず もどる').click())
    expect(mocks.updateMemory).not.toHaveBeenCalled()
    expect(mocks.replace).toHaveBeenCalledWith(`/memory/${MEMORY_ID}`)
    expect(findButton('この内容で なおす').disabled).toBe(true)
  })

  it('keeps changed values when the user continues editing from the leave dialog', async () => {
    await renderForm()

    const title = document.querySelector('#memory-edit-title') as HTMLInputElement
    const backButton = findButton('変更せず もどる')
    await act(async () => setControlValue(title, 'まだ保存していない合成タイトル'))
    backButton.focus()
    await act(async () => backButton.click())

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('memory-edit-leave-title')
    expect(dialog?.textContent).toContain('まだ保存していない変更があります')
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(findButton('編集を続ける'))

    await act(async () => findButton('編集を続ける').click())

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(title.value).toBe('まだ保存していない合成タイトル')
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(backButton)
  })

  it('leaves only after the user explicitly discards changed values', async () => {
    await renderForm()

    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-body') as HTMLTextAreaElement,
        '破棄する合成本文',
      ),
    )
    await act(async () => findButton('変更せず もどる').click())
    expect(mocks.replace).not.toHaveBeenCalled()

    await act(async () => findButton('変更を破棄する').click())

    expect(mocks.replace).toHaveBeenCalledWith(`/memory/${MEMORY_ID}`)
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('shows the destructive leave action as a button before hover', async () => {
    await renderForm()

    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-title') as HTMLInputElement,
        '視認性確認用の合成タイトル',
      ),
    )
    await act(async () => findButton('変更せず もどる').click())

    const discardButton = findButton('変更を破棄する')
    expect(discardButton.className).toContain('border-2')
    expect(discardButton.className).toContain('border-amber')
    expect(discardButton.className).toContain('bg-amber')
    expect(discardButton.className).toContain('text-white')
    expect(discardButton.className).toContain('shadow-lift')
  })

  it('uses the same leave confirmation from the top back control', async () => {
    await renderForm()

    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-weather') as HTMLInputElement,
        'まだ保存していない天気',
      ),
    )
    await act(async () => findButton('記録へ もどる').click())

    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect((document.querySelector('#memory-edit-weather') as HTMLInputElement).value).toBe(
      'まだ保存していない天気',
    )
  })

  it('activates the standard browser leave warning only after a change', async () => {
    await renderForm()

    const unchangedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unchangedEvent)
    expect(unchangedEvent.defaultPrevented).toBe(false)

    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-body') as HTMLTextAreaElement,
        'まだ保存していない合成本文',
      ),
    )
    const changedEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(changedEvent)

    expect(changedEvent.defaultPrevented).toBe(true)
  })

  it('removes the browser leave warning after a successful save', async () => {
    mocks.updateMemory.mockResolvedValue({
      id: MEMORY_ID,
      child_id: '22222222-2222-4222-8222-222222222222',
      title: '保存した合成タイトル',
      body: '合成の本文',
      weather: 'はれ',
      recorded_at: '2026-07-30',
      is_favorite: false,
      ai_generated: false,
      image_ids: [],
      cover_thumbnail_url: null,
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T01:00:00.000Z',
    })
    await renderForm()

    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-title') as HTMLInputElement,
        '保存した合成タイトル',
      ),
    )
    await act(async () => findButton('この内容で なおす').click())
    const afterSaveEvent = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(afterSaveEvent)

    expect(mocks.replace).toHaveBeenCalledWith(`/memory/${MEMORY_ID}?updated=1`)
    expect(afterSaveEvent.defaultPrevented).toBe(false)
  })

  it('traps focus, closes on Escape, and restores focus to the back control', async () => {
    await renderForm()

    const backButton = findButton('変更せず もどる')
    await act(async () =>
      setControlValue(
        document.querySelector('#memory-edit-title') as HTMLInputElement,
        'キーボード確認用の合成タイトル',
      ),
    )
    backButton.focus()
    await act(async () => backButton.click())

    const continueButton = findButton('編集を続ける')
    const discardButton = findButton('変更を破棄する')
    discardButton.focus()
    await act(async () =>
      discardButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })),
    )
    expect(document.activeElement).toBe(continueButton)

    await act(async () =>
      continueButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    )
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(backButton)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('keeps an unsaved body in memory without storage, logging, or analytics calls', async () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
    const fetchCall = vi.fn()
    const sendBeacon = vi.fn()
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', fetchCall)
    vi.stubGlobal('navigator', { sendBeacon })
    await renderForm()

    const body = document.querySelector('#memory-edit-body') as HTMLTextAreaElement
    await act(async () => setControlValue(body, '保存していない合成本文'))
    await act(async () => findButton('変更せず もどる').click())
    await act(async () => findButton('編集を続ける').click())

    expect(body.value).toBe('保存していない合成本文')
    expect(storageWrite).not.toHaveBeenCalled()
    expect(fetchCall).not.toHaveBeenCalled()
    expect(sendBeacon).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('updates all editable fields and returns to the refreshed detail', async () => {
    const updatedMemory = {
      id: MEMORY_ID,
      child_id: '22222222-2222-4222-8222-222222222222',
      title: '整えたタイトル',
      body: '整えた本文',
      weather: 'くもり',
      recorded_at: '2026-07-30',
      is_favorite: false,
      ai_generated: false,
      image_ids: [],
      cover_thumbnail_url: null,
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T01:00:00.000Z',
    }
    mocks.updateMemory.mockResolvedValue(updatedMemory)
    queryClient.setQueryData(['memories', 'synthetic-list'], {
      data: [
        {
          ...updatedMemory,
          title: '合成のタイトル',
          body: '合成の本文',
          weather: 'はれ',
          cover_thumbnail_url: 'https://example.invalid/redacted-thumbnail',
        },
      ],
      page: { next_cursor: null, total_count: 1 },
    })
    await renderForm()

    await act(async () => {
      setControlValue(
        document.querySelector('#memory-edit-title') as HTMLInputElement,
        '  整えたタイトル  ',
      )
      setControlValue(
        document.querySelector('#memory-edit-body') as HTMLTextAreaElement,
        '整えた本文',
      )
      setControlValue(document.querySelector('#memory-edit-weather') as HTMLInputElement, 'くもり')
    })
    await act(async () => findButton('この内容で なおす').click())

    expect(mocks.updateMemory).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      body: {
        expected_updated_at: '2026-07-30T00:00:00.000Z',
        title: '整えたタイトル',
        body: '整えた本文',
        weather: 'くもり',
      },
    })
    expect(mocks.replace).toHaveBeenCalledWith(`/memory/${MEMORY_ID}?updated=1`)
    expect(mocks.refresh).toHaveBeenCalledOnce()
    expect(
      queryClient.getQueryData<{
        data: Array<{
          title: string
          body: string | null
          weather: string | null
          cover_thumbnail_url: string | null
        }>
      }>(['memories', 'synthetic-list'])?.data[0],
    ).toMatchObject({
      title: '整えたタイトル',
      body: '整えた本文',
      weather: 'くもり',
      cover_thumbnail_url: 'https://example.invalid/redacted-thumbnail',
    })
  })

  it('sends only fields changed from the initial values', async () => {
    mocks.updateMemory.mockResolvedValue({
      id: MEMORY_ID,
      child_id: '22222222-2222-4222-8222-222222222222',
      title: '合成のタイトル',
      body: '合成の本文',
      weather: 'あめ',
      recorded_at: '2026-07-30',
      is_favorite: false,
      ai_generated: false,
      image_ids: [],
      cover_thumbnail_url: null,
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T01:00:00.000Z',
    })
    await renderForm()

    await act(async () => {
      setControlValue(document.querySelector('#memory-edit-weather') as HTMLInputElement, 'あめ')
    })
    await act(async () => findButton('この内容で なおす').click())

    expect(mocks.updateMemory).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      body: {
        expected_updated_at: '2026-07-30T00:00:00.000Z',
        weather: 'あめ',
      },
    })
  })

  it('does not rewrite stored empty strings when another field changes', async () => {
    mocks.updateMemory.mockResolvedValue({
      id: MEMORY_ID,
      child_id: '22222222-2222-4222-8222-222222222222',
      title: '整えたタイトル',
      body: '',
      weather: '',
      recorded_at: '2026-07-30',
      is_favorite: false,
      ai_generated: false,
      image_ids: [],
      cover_thumbnail_url: null,
      created_at: '2026-07-30T00:00:00.000Z',
      updated_at: '2026-07-30T01:00:00.000Z',
    })
    await renderForm({ initialBody: '', initialWeather: '' })

    await act(async () => {
      setControlValue(
        document.querySelector('#memory-edit-title') as HTMLInputElement,
        '整えたタイトル',
      )
    })
    await act(async () => findButton('この内容で なおす').click())

    expect(mocks.updateMemory).toHaveBeenCalledWith({
      memoryId: MEMORY_ID,
      body: {
        expected_updated_at: '2026-07-30T00:00:00.000Z',
        title: '整えたタイトル',
      },
    })
  })

  it('locks the form and announces progress while saving', async () => {
    await renderForm()
    const status = document.querySelector('[role="status"]') as HTMLElement
    expect(status.textContent).toBe('')

    mocks.updatePending = true
    await renderForm()

    const form = document.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('aria-busy')).toBe('true')
    expect(form.contains(status)).toBe(false)
    expect((document.querySelector('#memory-edit-title') as HTMLInputElement).readOnly).toBe(true)
    expect((document.querySelector('#memory-edit-body') as HTMLTextAreaElement).readOnly).toBe(true)
    expect((document.querySelector('#memory-edit-weather') as HTMLInputElement).readOnly).toBe(true)
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      'ページを なおしています',
    )
    expect(findButton('ページを なおしています…').disabled).toBe(true)
    expect(findButton('変更せず もどる').disabled).toBe(true)
  })

  it('keeps entered values when the request fails', async () => {
    mocks.updateMemory.mockRejectedValue(new Error('synthetic network failure'))
    await renderForm()

    const title = document.querySelector('#memory-edit-title') as HTMLInputElement
    const body = document.querySelector('#memory-edit-body') as HTMLTextAreaElement
    await act(async () => {
      setControlValue(title, '送信前の合成タイトル')
      setControlValue(body, '送信前の合成本文')
    })
    await act(async () => findButton('この内容で なおす').click())

    expect(title.value).toBe('送信前の合成タイトル')
    expect(body.value).toBe('送信前の合成本文')
    const alert = document.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('保存できませんでした')
    expect(alert?.textContent).toContain('入力はそのままです')
    expect(alert?.className).toContain('border-2')
    expect(alert?.querySelector('.bg-amber')).not.toBeNull()
    expect(alert?.querySelector('.font-bold')?.textContent).toContain('保存できませんでした')
    expect(document.activeElement).toBe(document.querySelector('[role="alert"]'))
    expect(mocks.replace).not.toHaveBeenCalled()
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
  })

  it('keeps input on a conflict and offers a latest-content refresh', async () => {
    mocks.updateMemory.mockRejectedValue(
      new ApiProblemError({
        type: 'https://hana.app/problems/memory-update-conflict',
        title: 'Conflict',
        status: 409,
        reason: 'memory_update_conflict',
      }),
    )
    await renderForm()

    const title = document.querySelector('#memory-edit-title') as HTMLInputElement
    await act(async () => setControlValue(title, '競合前の入力'))
    await act(async () => findButton('この内容で なおす').click())

    expect(title.value).toBe('競合前の入力')
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('入力はそのまま')
    const refreshButton = findButton('最新の内容を確認する')
    expect(refreshButton.className).toContain('bg-primary')
    expect(refreshButton.querySelector('svg')).not.toBeNull()
    await act(async () => refreshButton.click())
    expect(mocks.refresh).toHaveBeenCalledOnce()
    const beforeUnload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(beforeUnload)
    expect(beforeUnload.defaultPrevented).toBe(true)
  })

  it('invalidates memory lists after a not-found update while keeping input', async () => {
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')
    mocks.updateMemory.mockRejectedValue(
      new ApiProblemError({
        type: 'https://hana.app/problems/not-found',
        title: 'Not Found',
        status: 404,
        reason: 'not_found',
      }),
    )
    await renderForm()

    const weather = document.querySelector('#memory-edit-weather') as HTMLInputElement
    await act(async () => setControlValue(weather, 'あめ'))
    await act(async () => findButton('この内容で なおす').click())

    expect(weather.value).toBe('あめ')
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['memories'] })
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('編集できません')
  })

  it('rejects a blank title and focuses the title field', async () => {
    await renderForm()

    const title = document.querySelector('#memory-edit-title') as HTMLInputElement
    await act(async () => setControlValue(title, '   '))
    await act(async () => findButton('この内容で なおす').click())

    expect(mocks.updateMemory).not.toHaveBeenCalled()
    expect(title.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(title)
  })
})
