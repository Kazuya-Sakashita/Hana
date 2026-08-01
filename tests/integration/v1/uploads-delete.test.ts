import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  transaction: vi.fn(),
  advisoryLock: vi.fn(),
  imageFindFirst: vi.fn(),
  imageUpdateMany: vi.fn(),
  imageDeleteMany: vi.fn(),
  storageRemove: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: mocks.getUser } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ remove: mocks.storageRemove }) },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    $transaction: mocks.transaction,
  },
}))

import { DELETE } from '@/app/v1/uploads/[imageId]/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const IMAGE_ID = '550e8400-e29b-41d4-a716-446655440000'
const STORAGE_KEY = 'uploads/0123456789abcdef/202608/550e8400-e29b-41d4-a716-446655440000.jpg'

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } } })
  mocks.profileFindUnique.mockResolvedValue({
    id: USER_ID,
    displayName: null,
    aiConsentAt: null,
    accessBlockedAt: null,
    createdAt: new Date('2026-08-01T00:00:00Z'),
  })
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $executeRaw: mocks.advisoryLock,
      image: {
        findFirst: mocks.imageFindFirst,
        updateMany: mocks.imageUpdateMany,
        deleteMany: mocks.imageDeleteMany,
      },
    }),
  )
}

function call(imageId = IMAGE_ID) {
  return DELETE(new Request(`http://localhost/v1/uploads/${imageId}`, { method: 'DELETE' }), {
    params: Promise.resolve({ imageId }),
  })
}

afterEach(() => vi.clearAllMocks())

describe('DELETE /v1/uploads/{imageId}', () => {
  it('returns 401 without authentication', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect((await call()).status).toBe(401)
  })

  it('returns the same 404 for malformed, missing, deleted, or foreign images', async () => {
    authed()
    expect((await call('not-a-uuid')).status).toBe(404)
    mocks.imageFindFirst.mockResolvedValue(null)
    expect((await call()).status).toBe(404)
    expect(mocks.storageRemove).not.toHaveBeenCalled()
  })

  it('returns 409 without touching Storage when the image is linked', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({
      id: IMAGE_ID,
      storageKey: STORAGE_KEY,
      memoryId: 'linked',
      deletedAt: null,
    })

    const response = await call()

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ reason: 'image_already_linked' })
    expect(mocks.storageRemove).not.toHaveBeenCalled()
  })

  it('removes original and variants under the image lock and returns 204', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({
      id: IMAGE_ID,
      storageKey: STORAGE_KEY,
      memoryId: null,
      deletedAt: null,
    })
    mocks.storageRemove.mockResolvedValue({ data: [], error: null })
    mocks.imageUpdateMany.mockResolvedValue({ count: 1 })
    mocks.imageDeleteMany.mockResolvedValue({ count: 1 })

    const response = await call()

    expect(response.status).toBe(204)
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(2)
    expect(mocks.storageRemove).toHaveBeenCalledWith([
      STORAGE_KEY,
      STORAGE_KEY.replace('.jpg', '_thumb.webp'),
      STORAGE_KEY.replace('.jpg', '_preview.webp'),
    ])
    expect(mocks.imageUpdateMany).toHaveBeenCalledWith({
      where: { id: IMAGE_ID, userId: USER_ID, memoryId: null, deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mocks.imageDeleteMany).toHaveBeenCalledWith({
      where: {
        id: IMAGE_ID,
        userId: USER_ID,
        memoryId: null,
        deletedAt: { not: null },
      },
    })
  })

  it('keeps the durable deleted claim when Storage fails', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({
      id: IMAGE_ID,
      storageKey: STORAGE_KEY,
      memoryId: null,
      deletedAt: null,
    })
    mocks.imageUpdateMany.mockResolvedValue({ count: 1 })
    mocks.storageRemove.mockResolvedValue({ data: null, error: { statusCode: '500' } })

    const response = await call()

    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.imageUpdateMany).toHaveBeenCalledOnce()
    expect(mocks.imageDeleteMany).not.toHaveBeenCalled()
  })

  it('retries Storage deletion for an owned unlinked deleted claim', async () => {
    authed()
    mocks.imageFindFirst.mockResolvedValue({
      id: IMAGE_ID,
      storageKey: STORAGE_KEY,
      memoryId: null,
      deletedAt: new Date('2026-08-01T00:00:00Z'),
    })
    mocks.storageRemove.mockResolvedValue({ data: [], error: null })
    mocks.imageDeleteMany.mockResolvedValue({ count: 1 })

    expect((await call()).status).toBe(204)
    expect(mocks.imageUpdateMany).not.toHaveBeenCalled()
    expect(mocks.storageRemove).toHaveBeenCalledOnce()
    expect(mocks.imageDeleteMany).toHaveBeenCalledOnce()
  })

  it('does not touch Storage when the durable claim transaction rolls back', async () => {
    authed()
    mocks.transaction.mockRejectedValueOnce(new Error('synthetic_claim_rollback'))

    expect((await call()).status).toBe(500)
    expect(mocks.storageRemove).not.toHaveBeenCalled()
    expect(mocks.imageDeleteMany).not.toHaveBeenCalled()
  })
})
