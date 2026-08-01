import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  imageFindFirst: vi.fn(),
  createSignedUrl: vi.fn(),
  adminSignal: undefined as AbortSignal | undefined,
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (options?: { signal?: AbortSignal }) => {
    mocks.adminSignal = options?.signal
    return {
      storage: {
        from: () => ({
          createSignedUrl: mocks.createSignedUrl,
        }),
      },
    }
  },
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
  },
}))

import { GET } from '@/app/v1/uploads/[imageId]/url/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555'
const IMG_ID = '550e8400-e29b-41d4-a716-446655440000'

const supabaseUser = { id: USER_ID, email: 'parent@example.com' }
const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}
const imageRow = {
  id: IMG_ID,
  userId: USER_ID,
  storageKey: 'uploads/abc/202605/img.jpg',
  metadataSanitizedAt: new Date('2026-07-31T00:00:00Z'),
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileRow)
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(
    async (
      callback: (transaction: {
        $executeRaw: typeof mocks.advisoryLock
        image: { findFirst: typeof mocks.imageFindFirst }
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: mocks.advisoryLock,
        image: { findFirst: mocks.imageFindFirst },
      }),
  )
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

async function call(imageId: string, size?: string, context?: string) {
  const params = new URLSearchParams()
  if (size) params.set('size', size)
  if (context) params.set('context', context)
  const query = params.size > 0 ? `?${params.toString()}` : ''
  const request = new Request(`http://localhost:3000/v1/uploads/${imageId}/url${query}`)
  return GET(request, { params: Promise.resolve({ imageId }) })
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('GET /v1/uploads/[imageId]/url', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await call(IMG_ID)
    expect(res.status).toBe(401)
  })

  it('returns 404 for invalid UUID', async () => {
    authed()
    const res = await call('not-a-uuid')
    expect(res.status).toBe(404)
  })

  it('returns 404 when image is missing', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(null)
    const res = await call(IMG_ID)
    expect(res.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('requires an unlinked image or an active parent memory before signing', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(null)

    const res = await call(IMG_ID)

    expect(res.status).toBe(404)
    expect(mocks.imageFindFirst).toHaveBeenCalledWith({
      where: {
        id: IMG_ID,
        userId: USER_ID,
        deletedAt: null,
        OR: [{ memoryId: null }, { memory: { is: { userId: USER_ID, deletedAt: null } } }],
      },
      select: { id: true, userId: true, storageKey: true, metadataSanitizedAt: true },
    })
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns 404 without revealing that an image belongs to another user', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(null)
    const res = await call(IMG_ID)
    expect(res.status).toBe(404)
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns 422 for invalid size value', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    const res = await call(IMG_ID, 'huge')
    expect(res.status).toBe(422)
  })

  it('returns 422 for invalid context value', async () => {
    authed()
    const res = await call(IMG_ID, undefined, 'unknown')
    expect(res.status).toBe(422)
    expect(mocks.imageFindFirst).not.toHaveBeenCalled()
  })

  it('requires an owned sanitized unlinked image for record-draft context', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-draft' },
      error: null,
    })

    const res = await call(IMG_ID, 'thumbnail', 'record-draft')

    expect(res.status).toBe(200)
    expect(mocks.imageFindFirst).toHaveBeenCalledWith({
      where: {
        id: IMG_ID,
        userId: USER_ID,
        deletedAt: null,
        memoryId: null,
        metadataSanitizedAt: { not: null },
      },
      select: { id: true, userId: true, storageKey: true, metadataSanitizedAt: true },
    })
  })

  it.each(['linked', 'unsanitized', 'foreign', 'missing'])(
    'returns indistinguishable 404 for %s image in record-draft context',
    async () => {
      authed()
      mocks.imageFindFirst.mockResolvedValue(null)

      const res = await call(IMG_ID, 'thumbnail', 'record-draft')

      expect(res.status).toBe(404)
      expect(await res.json()).toMatchObject({ reason: 'not_found' })
      expect(mocks.createSignedUrl).not.toHaveBeenCalled()
    },
  )

  it('returns 200 with original key when size is omitted', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    })

    const res = await call(IMG_ID)
    expect(res.status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(imageRow.storageKey, 1800)
    const body = (await res.json()) as { url: string; expires_at: string }
    expect(body.url).toBe('https://example.com/signed')
    expect(body.expires_at).toMatch(/T.*Z$/)
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 3_000,
      timeout: 10_000,
    })
  })

  it('returns 409 without signing an unsanitized original', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({ ...imageRow, metadataSanitizedAt: null })

    const res = await call(IMG_ID, 'original')

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: 'image_sanitization_pending' })
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('continues to sign a sanitized variant while the original is pending', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({ ...imageRow, metadataSanitizedAt: null })
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed-preview' },
      error: null,
    })

    const res = await call(IMG_ID, 'preview')

    expect(res.status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('keeps the image lock transaction open until signing finishes', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)

    let resolveSigning: ((result: { data: { signedUrl: string }; error: null }) => void) | undefined
    mocks.createSignedUrl.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSigning = resolve
        }),
    )
    let transactionCompleted = false
    mocks.transaction.mockImplementation(
      async (
        callback: (transaction: {
          $executeRaw: typeof mocks.advisoryLock
          image: { findFirst: typeof mocks.imageFindFirst }
        }) => Promise<unknown>,
      ) => {
        const result = await callback({
          $executeRaw: mocks.advisoryLock,
          image: { findFirst: mocks.imageFindFirst },
        })
        transactionCompleted = true
        return result
      },
    )

    const responsePromise = call(IMG_ID)
    await vi.waitFor(() => expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1))

    expect(transactionCompleted).toBe(false)
    resolveSigning?.({ data: { signedUrl: 'https://example.com/signed' }, error: null })

    const response = await responsePromise
    expect(response.status).toBe(200)
    expect(transactionCompleted).toBe(true)
  })

  it('returns 500 without returning a URL when signing exceeds its deadline', async () => {
    vi.useFakeTimers()
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockImplementation(
      () =>
        new Promise((_, reject) => {
          mocks.adminSignal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    const responsePromise = call(IMG_ID)
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
    expect(mocks.adminSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(8_000)
    const response = await responsePromise
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(500)
    expect(mocks.adminSignal?.aborted).toBe(true)
    expect(body).not.toHaveProperty('url')
  })

  it('does not start the original fallback after the signing deadline', async () => {
    vi.useFakeTimers()
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)

    let resolveVariant: ((result: { data: null; error: { message: string } }) => void) | undefined
    mocks.createSignedUrl.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveVariant = resolve
        }),
    )

    const responsePromise = call(IMG_ID, 'preview')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(8_000)
    const response = await responsePromise

    resolveVariant?.({ data: null, error: { message: 'synthetic failure' } })
    await vi.advanceTimersByTimeAsync(0)

    expect(response.status).toBe(500)
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(1)
  })

  it('uses derived _thumb.webp key when size=thumbnail (ISSUE-031)', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/thumb' },
      error: null,
    })

    const res = await call(IMG_ID, 'thumbnail')
    expect(res.status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('uploads/abc/202605/img_thumb.webp', 1800)
  })

  it('uses derived _preview.webp key when size=preview (ISSUE-031)', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/preview' },
      error: null,
    })

    const res = await call(IMG_ID, 'preview')
    expect(res.status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('uploads/abc/202605/img_preview.webp', 1800)
  })

  it('uses original key when size=original', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/original' },
      error: null,
    })

    const res = await call(IMG_ID, 'original')
    expect(res.status).toBe(200)
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(imageRow.storageKey, 1800)
  })

  it('sets Cache-Control: private, max-age=300', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/signed' },
      error: null,
    })

    const res = await call(IMG_ID, 'thumbnail')
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300')
  })

  it('returns 500 when Storage createSignedUrl fails (size=original)', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await call(IMG_ID, 'original')
    expect(res.status).toBe(500)

    spy.mockRestore()
  })

  it('falls back to original when variant key is missing (ISSUE-031 既存データ救済)', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    // 1 回目 (variant key) は失敗、 2 回目 (original key) で成功する mock
    mocks.createSignedUrl
      .mockResolvedValueOnce({ data: null, error: { message: 'Object not found' } })
      .mockResolvedValueOnce({
        data: { signedUrl: 'https://example.com/original-fallback' },
        error: null,
      })

    const res = await call(IMG_ID, 'preview')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { url: string }
    expect(body.url).toBe('https://example.com/original-fallback')

    // variant key → original key の順で 2 回呼ばれること
    expect(mocks.createSignedUrl).toHaveBeenCalledTimes(2)
    expect(mocks.createSignedUrl).toHaveBeenNthCalledWith(
      1,
      'uploads/abc/202605/img_preview.webp',
      1800,
    )
    expect(mocks.createSignedUrl).toHaveBeenNthCalledWith(2, imageRow.storageKey, 1800)
  })

  it('returns 500 when both variant and original fail', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    mocks.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: 'SENSITIVE_STORAGE_ERROR_SENTINEL' },
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await call(IMG_ID, 'preview')
    expect(res.status).toBe(500)
    expect(spy).toHaveBeenCalledWith('createSignedUrl failed (both variant and original)', {
      reason: 'storage_sign_fallback_failed',
    })
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SENSITIVE_STORAGE_ERROR_SENTINEL')

    spy.mockRestore()
  })
})
