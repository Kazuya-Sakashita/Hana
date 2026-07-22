import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateStorageKey, storageKeyPrefixForUser } from '@/features/uploads/server/storage-key'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  imageCreate: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  storageDownload: vi.fn(),
  storageUpload: vi.fn(),
  thumbnailVariant: vi.fn(),
  previewVariant: vi.fn(),
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
        createSignedUploadUrl: mocks.createSignedUploadUrl,
        download: mocks.storageDownload,
        upload: mocks.storageUpload,
      }),
    },
  }),
}))

// ISSUE-031: sharp 起動を回避するため variants モジュールを mock
vi.mock('@/features/uploads/server/variants', () => ({
  generateThumbnailVariant: mocks.thumbnailVariant,
  generatePreviewVariant: mocks.previewVariant,
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    image: { create: mocks.imageCreate },
  },
}))

import { POST as PRESIGNED_POST } from '@/app/v1/uploads/presigned-url/route'
import { POST as CONFIRM_POST } from '@/app/v1/uploads/confirm/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555'

const supabaseUser = { id: USER_ID, email: 'parent@example.com' }
const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileRow)
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.clearAllMocks())

describe('POST /v1/uploads/presigned-url', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'a.jpg',
        content_type: 'image/jpeg',
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 422 for unsupported content_type', async () => {
    authed()
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'a.gif',
        content_type: 'image/gif',
      }),
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { reason: string; errors: Array<{ path: string }> }
    expect(body.reason).toBe('validation_error')
    expect(body.errors.map((e) => e.path)).toContain('body.content_type')
  })

  it('returns 200 with presigned_url + storage_key on success', async () => {
    authed()
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.supabase.co/upload/abc', token: 't', path: 'p' },
      error: null,
    })
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'a.jpg',
        content_type: 'image/jpeg',
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      presigned_url: string
      storage_key: string
      expires_at: string
    }
    expect(body.presigned_url).toContain('supabase.co')
    expect(body.storage_key.startsWith(storageKeyPrefixForUser(USER_ID))).toBe(true)
    expect(body.storage_key.endsWith('.jpg')).toBe(true)
    expect(new Date(body.expires_at).getTime()).toBeGreaterThan(Date.now())
  })

  it('returns 500 when Supabase Storage fails', async () => {
    authed()
    mocks.createSignedUploadUrl.mockResolvedValue({
      data: null,
      error: { message: 'bucket not found' },
    })
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'a.jpg',
        content_type: 'image/jpeg',
      }),
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('internal_server_error')
  })
})

describe('POST /v1/uploads/confirm', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: generateStorageKey(USER_ID, 'image/jpeg'),
        width: 100,
        height: 100,
        file_size: 1234,
      }),
    )
    expect(res.status).toBe(401)
  })

  it('returns 422 for malformed storage_key', async () => {
    authed()
    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: 'not-a-valid-key',
        width: 100,
        height: 100,
        file_size: 1234,
      }),
    )
    expect(res.status).toBe(422)
  })

  it('returns 403 when storage_key prefix is another user', async () => {
    authed()
    const foreignKey = generateStorageKey(OTHER_USER_ID, 'image/jpeg')
    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: foreignKey,
        width: 100,
        height: 100,
        file_size: 1234,
      }),
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('forbidden')
  })

  function setupVariantMocks() {
    mocks.storageDownload.mockResolvedValue({
      data: new Blob(['fake-original-bytes']),
      error: null,
    })
    mocks.thumbnailVariant.mockResolvedValue({
      buffer: Buffer.from('fake-thumb'),
      contentType: 'image/webp',
    })
    mocks.previewVariant.mockResolvedValue({
      buffer: Buffer.from('fake-preview'),
      contentType: 'image/webp',
    })
    mocks.storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null })
  }

  it('returns 201 with Image shape (no storage_key leak)', async () => {
    authed()
    setupVariantMocks()
    const ownKey = generateStorageKey(USER_ID, 'image/png')
    mocks.imageCreate.mockResolvedValue({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      userId: USER_ID,
      memoryId: null,
      storageKey: ownKey,
      contentType: 'image/png',
      width: 800,
      height: 600,
      fileSize: 10000,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      updatedAt: new Date('2026-05-23T10:00:00Z'),
      deletedAt: null,
    })
    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
        width: 800,
        height: 600,
        file_size: 10000,
      }),
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      memory_id: null,
      content_type: 'image/png',
      width: 800,
      height: 600,
      file_size: 10000,
      created_at: '2026-05-23T10:00:00.000Z',
    })
    // storage_key を絶対に返さない (PII)
    expect(body).not.toHaveProperty('storage_key')
    expect(body).not.toHaveProperty('user_id')
  })

  it('uploads _thumb.webp and _preview.webp variants (ISSUE-031)', async () => {
    authed()
    setupVariantMocks()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    mocks.imageCreate.mockResolvedValue({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      userId: USER_ID,
      memoryId: null,
      storageKey: ownKey,
      contentType: 'image/jpeg',
      width: 800,
      height: 600,
      fileSize: 10000,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      updatedAt: new Date('2026-05-23T10:00:00Z'),
      deletedAt: null,
    })

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
        width: 800,
        height: 600,
        file_size: 10000,
      }),
    )
    expect(res.status).toBe(201)

    // 派生 key で 2 variant が upload されたこと
    expect(mocks.storageDownload).toHaveBeenCalledWith(ownKey)
    expect(mocks.thumbnailVariant).toHaveBeenCalledTimes(1)
    expect(mocks.previewVariant).toHaveBeenCalledTimes(1)

    const uploadCalls = mocks.storageUpload.mock.calls.map((c) => c[0] as string)
    expect(uploadCalls).toHaveLength(2)
    expect(uploadCalls.some((k) => k.endsWith('_thumb.webp'))).toBe(true)
    expect(uploadCalls.some((k) => k.endsWith('_preview.webp'))).toBe(true)
  })

  it('returns 201 even when variant generation fails (graceful degradation)', async () => {
    authed()
    // download が落ちても Image row は作成される
    mocks.storageDownload.mockResolvedValue({
      data: null,
      error: { message: 'boom' },
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    mocks.imageCreate.mockResolvedValue({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      userId: USER_ID,
      memoryId: null,
      storageKey: ownKey,
      contentType: 'image/jpeg',
      width: 800,
      height: 600,
      fileSize: 10000,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      updatedAt: new Date('2026-05-23T10:00:00Z'),
      deletedAt: null,
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
        width: 800,
        height: 600,
        file_size: 10000,
      }),
    )
    expect(res.status).toBe(201)
    expect(mocks.storageUpload).not.toHaveBeenCalled()

    errSpy.mockRestore()
  })
})
