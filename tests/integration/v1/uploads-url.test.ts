import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileUpsert: vi.fn(),
  imageFindFirst: vi.fn(),
  createSignedUrl: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: mocks.createSignedUrl,
      }),
    },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { upsert: mocks.profileUpsert },
    image: { findFirst: mocks.imageFindFirst },
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
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileUpsert.mockResolvedValue(profileRow)
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

async function call(imageId: string, size?: string) {
  const query = size ? `?size=${size}` : ''
  const request = new Request(`http://localhost:3000/v1/uploads/${imageId}/url${query}`)
  return GET(request, { params: Promise.resolve({ imageId }) })
}

afterEach(() => {
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
  })

  it('returns 403 when image belongs to another user', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({ ...imageRow, userId: OTHER_USER_ID })
    const res = await call(IMG_ID)
    expect(res.status).toBe(403)
  })

  it('returns 422 for invalid size value', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue(imageRow)
    const res = await call(IMG_ID, 'huge')
    expect(res.status).toBe(422)
  })

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
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await call(IMG_ID, 'preview')
    expect(res.status).toBe(500)

    spy.mockRestore()
  })
})
