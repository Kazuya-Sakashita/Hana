// @vitest-environment jsdom

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiProblemError, type ProblemDetails } from '@/lib/api/error'
import { recordDraftStore } from '@/features/memories/client/record-draft-store'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  showToast: vi.fn(),
  useChildrenQuery: vi.fn(),
  createChild: vi.fn(),
  createMemory: vi.fn(),
  browserPost: vi.fn(),
  browserDelete: vi.fn(),
  createObjectUrl: vi.fn(),
  revokeObjectUrl: vi.fn(),
  aiConsentAt: null as string | null,
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}))

vi.mock('@/features/children/client/use-children', () => ({
  useChildrenQuery: mocks.useChildrenQuery,
  useCreateChildMutation: () => ({
    isPending: false,
    mutateAsync: mocks.createChild,
  }),
}))

vi.mock('@/features/me/client/use-current-user', () => ({
  useCurrentUserQuery: () => ({
    data: {
      id: '11111111-1111-4111-8111-111111111111',
      email: null,
      display_name: null,
      ai_consent_at: mocks.aiConsentAt,
      created_at: '2026-07-29T00:00:00.000Z',
    },
    isPending: false,
    isError: false,
    error: null,
  }),
  useSetAiConsentMutation: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}))

vi.mock('@/features/memories/client/use-memories', async () => ({
  memoriesQueryKey: ['memories'],
  useCreateMemoryMutation: () => ({
    isPending: false,
    mutateAsync: mocks.createMemory,
  }),
}))

vi.mock('@/features/metrics/client/product-events', () => ({
  createProductEventFlowId: () => '44444444-4444-4444-8444-444444444444',
  reportProductEvent: vi.fn(),
}))

vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}))

vi.mock('@/lib/api/browser-client', () => ({
  getBrowserApiClient: () => ({ POST: mocks.browserPost, DELETE: mocks.browserDelete }),
}))

import OnboardingPage from '@/app/onboarding/page'
import RecordPage from '@/app/record/page'

const OWNER_ID = '11111111-1111-4111-8111-111111111111'
const IDEMPOTENCY_KEY = '22222222-2222-4222-8222-222222222222'
const IMAGE_ID = '33333333-3333-4333-8333-333333333333'
const IMAGE_ID_2 = '77777777-7777-4777-8777-777777777777'

function syntheticCreatedMemory(id = '66666666-6666-4666-8666-666666666666') {
  return {
    id,
    child_id: '55555555-5555-4555-8555-555555555555',
    title: '保持する合成タイトル',
    body: '保持する合成本文',
    recorded_at: '2026-07-28',
    weather: null,
    is_favorite: false,
    ai_generated: false,
    image_ids: [IMAGE_ID],
    cover_thumbnail_url: null,
    created_at: '2026-07-29T00:00:00.000Z',
    updated_at: '2026-07-29T00:00:00.000Z',
  }
}

function apiProblem(reason: string, errors?: ProblemDetails['errors']) {
  return new ApiProblemError({
    type: `https://hana.app/problems/${reason}`,
    title: 'Synthetic problem',
    status: reason === 'memory_idempotency_conflict' ? 409 : 422,
    reason,
    errors,
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  )
  if (!button) throw new Error(`button not found: ${label}`)
  return button
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })
  return { promise, reject, resolve }
}

function installImageUploadMocks(confirmIds: readonly string[] = [IMAGE_ID_2]) {
  const NativeUrl = URL
  class SyntheticUrl extends NativeUrl {
    static override createObjectURL(value: Blob | MediaSource) {
      return mocks.createObjectUrl(value)
    }

    static override revokeObjectURL(value: string) {
      mocks.revokeObjectUrl(value)
    }
  }
  class SyntheticImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    naturalWidth = 1
    naturalHeight = 1

    set src(_value: string) {
      queueMicrotask(() => this.onload?.())
    }
  }

  vi.stubGlobal('URL', SyntheticUrl)
  vi.stubGlobal('Image', SyntheticImage)
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback, type) => {
    callback(new Blob(['synthetic'], { type: type ?? 'image/jpeg' }))
  })
  mocks.browserPost.mockImplementation(async (path: string, options?: Record<string, unknown>) => {
    if (path === '/uploads/presigned-url') {
      const body = options?.body as { file_name?: string } | undefined
      const match = /^synthetic-(\d+)\.jpg$/.exec(body?.file_name ?? '')
      const index = match ? Number(match[1]) : 0
      return {
        data: {
          presigned_url: 'https://example.invalid/synthetic-upload',
          storage_key: `redacted-fixture-key-${index}`,
        },
      }
    }
    if (path === '/uploads/confirm') {
      const body = options?.body as { storage_key?: string } | undefined
      const match = /-(\d+)$/.exec(body?.storage_key ?? '')
      const index = match ? Number(match[1]) : 0
      return { data: { id: confirmIds[index] ?? confirmIds[0] ?? IMAGE_ID_2 } }
    }
    if (path === '/ai/generate') {
      return {
        data: { generation_id: 'synthetic', title: '合成AIタイトル', body: '合成AI本文', tags: [] },
      }
    }
    throw new Error('unexpected synthetic API call')
  })
  return fetchMock
}

describe('ISSUE-119 form error DOM behavior', () => {
  let container: HTMLDivElement
  let root: Root
  let queryClient: QueryClient

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    sessionStorage.clear()
    mocks.useChildrenQuery.mockReset()
    mocks.createChild.mockReset()
    mocks.createMemory.mockReset()
    mocks.browserPost.mockReset()
    mocks.browserDelete.mockReset()
    mocks.browserDelete.mockResolvedValue({})
    mocks.createObjectUrl.mockReset()
    let objectUrlIndex = 0
    mocks.createObjectUrl.mockImplementation(() => `blob:synthetic-photo-${++objectUrlIndex}`)
    mocks.revokeObjectUrl.mockReset()
    mocks.push.mockReset()
    mocks.refresh.mockReset()
    mocks.showToast.mockReset()
    mocks.aiConsentAt = null
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
  })

  afterEach(() => {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderOnboarding() {
    mocks.useChildrenQuery.mockReturnValue({
      data: { data: [] },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    act(() => root.render(createElement(OnboardingPage)))
  }

  async function renderRestoredRecord({ saveImmediately = false } = {}) {
    mocks.useChildrenQuery.mockReturnValue({
      data: {
        data: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            name: 'テスト',
            birthdate: '2025-04-01',
            avatar_url: null,
            created_at: '2026-07-29T00:00:00.000Z',
            updated_at: '2026-07-29T00:00:00.000Z',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    recordDraftStore.save(OWNER_ID, {
      idempotencyKey: IDEMPOTENCY_KEY,
      title: '保持する合成タイトル',
      body: '保持する合成本文',
      parentNote: '',
      recordedAt: '2026-07-28',
      weather: '',
      imageIds: [IMAGE_ID],
      aiGenerated: false,
      aiDraftNeedsReview: false,
    })
    let clickedImmediately = false
    const observer = saveImmediately
      ? new MutationObserver(() => {
          const save = Array.from(container.querySelectorAll('button')).find(
            (candidate) => candidate.textContent?.trim() === 'このまま 残す',
          )
          if (!save || save.disabled || clickedImmediately) return
          clickedImmediately = true
          observer?.disconnect()
          save.click()
        })
      : null
    observer?.observe(container, { childList: true, subtree: true })
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(RecordPage)),
      )
      await new Promise((resolve) => window.setTimeout(resolve, 5))
    })
    if (saveImmediately) {
      await vi.waitFor(() => expect(clickedImmediately).toBe(true))
    } else {
      await vi.waitFor(() => expect(findButton('このまま 残す').disabled).toBe(false))
    }
  }

  async function renderEmptyRecord() {
    mocks.useChildrenQuery.mockReturnValue({
      data: {
        data: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            name: 'テスト',
            birthdate: '2025-04-01',
            avatar_url: null,
            created_at: '2026-07-29T00:00:00.000Z',
            updated_at: '2026-07-29T00:00:00.000Z',
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    })
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(RecordPage)),
      )
      await new Promise((resolve) => window.setTimeout(resolve, 5))
    })
    await vi.waitFor(() => expect(findButton('しゃしんを えらぶ').disabled).toBe(false))
  }

  it('suppresses repeated onboarding submission and keeps values on a field error', async () => {
    renderOnboarding()
    const name = document.querySelector<HTMLInputElement>('#child-name')
    const birthdate = document.querySelector<HTMLInputElement>('#child-birthdate')
    if (!name || !birthdate) throw new Error('onboarding inputs not found')
    act(() => {
      setInputValue(name, '合成の呼び名')
      setInputValue(birthdate, '2025-04-01')
    })

    const pending = deferred<never>()
    mocks.createChild.mockReturnValue(pending.promise)
    act(() => {
      findButton('つづける').click()
      findButton('つづける').click()
    })
    expect(mocks.createChild).toHaveBeenCalledOnce()

    mocks.createChild.mockRejectedValueOnce(
      apiProblem('validation_error', [
        { path: 'body.name', reason: 'invalid', message: 'technical message' },
      ]),
    )
    pending.reject(new Error('synthetic first request failure'))
    await act(async () => {
      await Promise.resolve()
    })

    act(() => findButton('つづける').click())
    await vi.waitFor(() => expect(document.activeElement).toBe(name))
    expect(name.value).toBe('合成の呼び名')
    expect(birthdate.value).toBe('2025-04-01')
    expect(name.getAttribute('aria-describedby')).toBe('child-name-error')
  })

  it('focuses the folded record field and keeps input after server validation', async () => {
    mocks.createMemory.mockRejectedValue(
      apiProblem('validation_error', [
        { path: 'body.recorded_at', reason: 'future_date', message: 'technical date message' },
      ]),
    )
    await renderRestoredRecord({ saveImmediately: true })
    const details = document.querySelector<HTMLDetailsElement>(
      '[data-testid="record-secondary-edits"]',
    )
    const date = document.querySelector<HTMLInputElement>('#memory-date')
    const title = document.querySelector<HTMLInputElement>('#memory-title')
    expect(mocks.createMemory).toHaveBeenCalledOnce()
    expect(mocks.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ image_ids: [IMAGE_ID] }) }),
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(date))
    expect(details?.open).toBe(true)
    expect(date?.getAttribute('aria-describedby')).toBe('memory-date-error')
    expect(title?.value).toBe('保持する合成タイトル')
    expect(document.querySelector('#memory-date-error')?.textContent).toBe(
      'ひにちは、きょうまでの日を 選んでください。',
    )
    expect(mocks.showToast).not.toHaveBeenCalled()
  })

  it('turns an unavailable image error into a reselect action', async () => {
    mocks.createMemory.mockRejectedValue(
      apiProblem('validation_error', [
        { path: 'body.image_ids', reason: 'image_not_found', message: 'technical image message' },
      ]),
    )
    await renderRestoredRecord()

    await act(async () => {
      findButton('このまま 残す').click()
      await Promise.resolve()
    })
    const reselect = findButton('しゃしんを えらびなおす')
    await vi.waitFor(() => expect(document.activeElement).toBe(reselect))
    expect(document.querySelector('#memory-photo-error')?.textContent).toBe(
      '写真を もういちど 選んでください。',
    )
    expect(reselect.getAttribute('aria-describedby')).toContain('memory-photo-error')

    installImageUploadMocks()
    const fileInput = document.querySelector<HTMLInputElement>('#memory-photo')
    if (!fileInput) throw new Error('photo input not found')
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' })],
    })
    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(document.querySelector('#memory-photo-error')).toBeNull())
    expect(findButton('しゃしんを 追加する').getAttribute('aria-invalid')).toBeNull()
    expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe(
      '保持する合成タイトル',
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('このまま 残す')))
  })

  it('focuses the current save action after replacing a photo with a retained title', async () => {
    installImageUploadMocks()
    await renderRestoredRecord()
    const fileInput = document.querySelector<HTMLInputElement>('#memory-photo')
    if (!fileInput) throw new Error('photo input not found')
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' })],
    })

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('このまま 残す')))
    expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe(
      '保持する合成タイトル',
    )
  })

  it('focuses the current save action after retrying a photo upload', async () => {
    const fetchMock = installImageUploadMocks()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }))
    await renderRestoredRecord()
    const fileInput = document.querySelector<HTMLInputElement>('#memory-photo')
    if (!fileInput) throw new Error('photo input not found')
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' })],
    })

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    const retry = await vi.waitFor(() => findButton('同じ写真を もういちど送る'))
    await act(async () => {
      retry.click()
      await Promise.resolve()
    })

    await vi.waitFor(() => expect(document.activeElement).toBe(findButton('このまま 残す')))
  })

  it('focuses a general error summary and allows a keyboard retry', async () => {
    mocks.createMemory.mockRejectedValueOnce(new Error('synthetic network failure'))
    await renderRestoredRecord()

    const save = findButton('このまま 残す')
    await act(async () => {
      save.click()
      await Promise.resolve()
    })
    const summary = document.querySelector<HTMLElement>('#record-error-summary')
    await vi.waitFor(() => expect(document.activeElement).toBe(summary))
    expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe(
      '保持する合成タイトル',
    )

    mocks.createMemory.mockResolvedValueOnce(syntheticCreatedMemory())
    await act(async () => {
      save.focus()
      save.form?.requestSubmit(save)
      await Promise.resolve()
    })
    await vi.waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/memory/66666666-6666-4666-8666-666666666666?saved=1',
      ),
    )
  })

  it('suppresses repeated record saves and restores the save action after a 409', async () => {
    const pending = deferred<never>()
    mocks.createMemory.mockReturnValueOnce(pending.promise)
    await renderRestoredRecord()

    const save = findButton('このまま 残す')
    act(() => {
      save.click()
      save.click()
    })
    await vi.waitFor(() => expect(mocks.createMemory).toHaveBeenCalledOnce())

    pending.reject(apiProblem('memory_idempotency_conflict'))
    await vi.waitFor(() => expect(document.activeElement).toBe(save))
    expect(document.querySelector('#record-error-summary')).not.toBeNull()
    const nextIdempotencyKey = recordDraftStore.load(OWNER_ID)?.idempotencyKey
    expect(nextIdempotencyKey).not.toBe(IDEMPOTENCY_KEY)

    const firstRequest = mocks.createMemory.mock.calls[0]?.[0]
    mocks.createMemory.mockResolvedValueOnce(syntheticCreatedMemory())
    act(() => {
      save.click()
      save.click()
    })
    await vi.waitFor(() => expect(mocks.createMemory).toHaveBeenCalledTimes(2))
    const secondRequest = mocks.createMemory.mock.calls[1]?.[0]
    expect(secondRequest.body).toEqual(firstRequest.body)
    expect(secondRequest.idempotencyKey).toBe(nextIdempotencyKey)
    expect(secondRequest.idempotencyKey).not.toBe(firstRequest.idempotencyKey)
    expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe(
      '保持する合成タイトル',
    )
    await vi.waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        '/memory/66666666-6666-4666-8666-666666666666?saved=1',
      ),
    )
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })

  it('disables draft discard while a save is in flight', async () => {
    const pending = deferred<ReturnType<typeof syntheticCreatedMemory>>()
    mocks.createMemory.mockReturnValueOnce(pending.promise)
    await renderRestoredRecord()

    act(() => findButton('このまま 残す').click())
    const cancel = document.querySelector<HTMLButtonElement>('[aria-label="やめて とじる"]')
    if (!cancel) throw new Error('cancel button not found')
    await vi.waitFor(() => expect(cancel.disabled).toBe(true))
    act(() => cancel.click())
    expect(document.querySelector('#cancel-confirm-title')).toBeNull()

    pending.resolve(syntheticCreatedMemory())
    await vi.waitFor(() => expect(mocks.push).toHaveBeenCalledTimes(1))
  })

  it('deletes a confirmed photo and releases its preview object URL', async () => {
    installImageUploadMocks()
    await renderEmptyRecord()
    const fileInput = document.querySelector<HTMLInputElement>('#memory-photo')
    if (!fileInput) throw new Error('photo input not found')
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: [new File(['synthetic'], 'synthetic.jpg', { type: 'image/jpeg' })],
    })

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    const remove = await vi.waitFor(() => {
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="写真1を削除"]')
      if (!button || button.disabled) throw new Error('remove button is not ready')
      return button
    })
    const previewUrl = mocks.createObjectUrl.mock.results[0]?.value

    await act(async () => {
      remove.click()
      await Promise.resolve()
    })

    await vi.waitFor(() =>
      expect(document.querySelector('button[aria-label="写真1を削除"]')).toBeNull(),
    )
    expect(mocks.browserDelete).toHaveBeenCalledWith('/uploads/{imageId}', {
      params: { path: { imageId: IMAGE_ID_2 } },
    })
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith(previewUrl)
  })

  it('keeps the first five photos and sends the reordered IDs to AI and save', async () => {
    const imageIds = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000005',
    ]
    mocks.aiConsentAt = '2026-07-29T00:00:00.000Z'
    installImageUploadMocks(imageIds)
    mocks.createMemory.mockImplementation(async ({ body }: { body: { image_ids: string[] } }) => ({
      ...syntheticCreatedMemory(),
      title: '合成AIタイトル',
      body: '合成AI本文',
      image_ids: body.image_ids,
    }))
    await renderEmptyRecord()
    const fileInput = document.querySelector<HTMLInputElement>('#memory-photo')
    if (!fileInput) throw new Error('photo input not found')
    Object.defineProperty(fileInput, 'files', {
      configurable: true,
      value: Array.from(
        { length: 6 },
        (_, index) => new File(['synthetic'], `synthetic-${index}.jpg`, { type: 'image/jpeg' }),
      ),
    })

    await act(async () => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })

    await vi.waitFor(() =>
      expect(document.querySelectorAll('ol[aria-label*="写真"] > li')).toHaveLength(5),
    )
    await vi.waitFor(() => expect(findButton('しゃしんは 5まい 選んでいます').disabled).toBe(true))
    expect(document.body.textContent).toContain(
      '写真は5枚までです。6枚目は追加されませんでした。選んだ5枚はそのままです。',
    )

    const moveSecondUp = document.querySelector<HTMLButtonElement>(
      'button[aria-label="写真2を上へ移動"]',
    )
    if (!moveSecondUp) throw new Error('move button not found')
    act(() => moveSecondUp.click())
    const expectedOrder = [imageIds[1]!, imageIds[0]!, ...imageIds.slice(2)]

    await act(async () => {
      findButton('AI で 下書きする').click()
      await Promise.resolve()
    })
    await vi.waitFor(() =>
      expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe(
        '合成AIタイトル',
      ),
    )
    const aiCall = mocks.browserPost.mock.calls.find(([path]) => path === '/ai/generate')
    expect(aiCall?.[1]).toMatchObject({ body: { image_ids: expectedOrder } })

    const moveCoverDown = document.querySelector<HTMLButtonElement>(
      'button[aria-label="写真1を下へ移動"]',
    )
    if (!moveCoverDown) throw new Error('move cover button not found')
    act(() => moveCoverDown.click())

    expect(document.querySelector<HTMLInputElement>('#memory-title')?.value).toBe('合成AIタイトル')
    expect(document.body.textContent).toContain('写真を変える前のAI下書きです')
    expect(mocks.createMemory).not.toHaveBeenCalled()

    act(() => findButton('内容を確認して 保存へ進む').click())

    await act(async () => {
      findButton('このまま 残す').click()
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(mocks.createMemory).toHaveBeenCalledOnce())
    expect(mocks.createMemory.mock.calls[0]?.[0]).toMatchObject({
      body: { image_ids: imageIds },
    })
  })
})
