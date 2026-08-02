import { Prisma } from '@prisma/client'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_FILE_SIZE } from '@/features/uploads/server/image-limits'
import { generateStorageKey, storageKeyPrefixForUser } from '@/features/uploads/server/storage-key'
import { ApiProblemError } from '@/lib/api/error'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  imageFindUnique: vi.fn(),
  imageCreate: vi.fn(),
  imageUpdate: vi.fn(),
  uploadReservationCreate: vi.fn(),
  uploadReservationFindUnique: vi.fn(),
  uploadReservationDeleteMany: vi.fn(),
  queryRaw: vi.fn(),
  createAdminClient: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  storageInfo: vi.fn(),
  storageDownload: vi.fn(),
  storageDownloadAsStream: vi.fn(),
  storageUpload: vi.fn(),
  storageUpdate: vi.fn(),
  verifyUploadedImage: vi.fn(),
  sanitizeUploadedImage: vi.fn(),
  thumbnailVariant: vi.fn(),
  previewVariant: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: (options?: unknown) => {
    mocks.createAdminClient(options)
    return {
      storage: {
        from: () => ({
          createSignedUploadUrl: mocks.createSignedUploadUrl,
          info: mocks.storageInfo,
          download: (...args: unknown[]) => {
            mocks.storageDownload(...args)
            return { asStream: mocks.storageDownloadAsStream }
          },
          upload: mocks.storageUpload,
          update: mocks.storageUpdate,
        }),
      },
    }
  },
}))

// ISSUE-031: sharp 起動を回避するため variants モジュールを mock
vi.mock('@/features/uploads/server/variants', () => ({
  generateThumbnailVariant: mocks.thumbnailVariant,
  generatePreviewVariant: mocks.previewVariant,
}))

vi.mock('@/features/uploads/server/verify-uploaded-image', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/uploads/server/verify-uploaded-image')>()),
  verifyUploadedImage: mocks.verifyUploadedImage,
  sanitizeUploadedImage: mocks.sanitizeUploadedImage,
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: (() => {
    const transaction = {
      image: {
        findUnique: mocks.imageFindUnique,
        create: mocks.imageCreate,
        update: mocks.imageUpdate,
      },
      uploadReservation: {
        findUnique: mocks.uploadReservationFindUnique,
        deleteMany: mocks.uploadReservationDeleteMany,
      },
      $queryRaw: mocks.queryRaw,
    }
    return {
      ...transaction,
      profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
      uploadReservation: {
        ...transaction.uploadReservation,
        create: mocks.uploadReservationCreate,
      },
      $transaction: (callback: (tx: typeof transaction) => unknown) => callback(transaction),
    }
  })(),
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
  mocks.imageFindUnique.mockResolvedValue(null)
  mocks.uploadReservationCreate.mockResolvedValue({})
  mocks.uploadReservationFindUnique.mockResolvedValue(null)
  mocks.uploadReservationDeleteMany.mockResolvedValue({ count: 1 })
  mocks.queryRaw.mockResolvedValue([])
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

function streamFrom(buffer: Buffer): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(buffer))
      controller.close()
    },
  })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
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

  it('returns 422 for direct HEIC upload requests', async () => {
    authed()
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'source.heic',
        content_type: 'image/heic',
      }),
    )
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      reason: 'validation_error',
      errors: [{ reason: 'unsupported_media_type' }],
    })
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled()
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
      error: {
        message:
          'SENSITIVE_STORAGE_ERROR_SENTINEL https://example.test/private?token=secret uploads/private/key',
      },
    })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await PRESIGNED_POST(
      jsonRequest('/v1/uploads/presigned-url', {
        file_name: 'a.jpg',
        content_type: 'image/jpeg',
      }),
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('internal_server_error')
    expect(errSpy).toHaveBeenCalledWith('createSignedUploadUrl failed', {
      reason: 'signed_upload_failed',
    })
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('SENSITIVE_STORAGE_ERROR_SENTINEL')
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('uploads/private/key')
    errSpy.mockRestore()
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

  function setupVariantMocks(contentType = 'image/jpeg') {
    const storageBuffer = Buffer.from('synthetic-storage-object')
    const verifiedBuffer = Buffer.from('synthetic-verified-image')
    mocks.storageInfo.mockResolvedValue({
      data: { size: storageBuffer.length, contentType },
      error: null,
    })
    mocks.storageDownloadAsStream.mockResolvedValue({
      data: streamFrom(storageBuffer),
      error: null,
    })
    mocks.verifyUploadedImage.mockResolvedValue({
      buffer: verifiedBuffer,
      contentType,
      width: 800,
      height: 600,
      fileSize: 10000,
      metadataSanitizedAt: new Date('2026-07-31T00:00:00Z'),
    })
    mocks.sanitizeUploadedImage.mockResolvedValue({
      buffer: verifiedBuffer,
      contentType,
      width: 800,
      height: 600,
      fileSize: verifiedBuffer.length,
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
    mocks.storageUpdate.mockResolvedValue({ data: { path: 'ok' }, error: null })
    return { storageBuffer, verifiedBuffer }
  }

  it('returns the existing Image on an idempotent confirm retry', async () => {
    authed()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    mocks.imageFindUnique.mockResolvedValue({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      userId: USER_ID,
      memoryId: null,
      storageKey: ownKey,
      contentType: 'image/jpeg',
      width: 800,
      height: 600,
      fileSize: 10000,
      metadataSanitizedAt: new Date('2026-07-31T00:00:00Z'),
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

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      content_type: 'image/jpeg',
    })
    expect(mocks.storageDownload).not.toHaveBeenCalled()
    expect(mocks.storageInfo).not.toHaveBeenCalled()
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('converges on the existing Image after a cross-instance P2002 race', async () => {
    authed()
    setupVariantMocks()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    const existingImage = {
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
    }
    mocks.imageFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(existingImage)
    mocks.imageCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic unique race', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
        width: 800,
        height: 600,
        file_size: 10000,
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: existingImage.id })
    expect(mocks.imageFindUnique).toHaveBeenCalledTimes(2)
  })

  it('single-flights expensive work for two simultaneous confirms and converges in DB', async () => {
    authed()
    setupVariantMocks()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    const image = {
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
    }

    const readBarrier = deferred()
    let reads = 0
    mocks.imageFindUnique.mockImplementation(async () => {
      reads += 1
      if (reads <= 2) {
        if (reads === 2) readBarrier.resolve()
        await readBarrier.promise
        return null
      }
      return image
    })

    const createBarrier = deferred()
    let creates = 0
    mocks.imageCreate.mockImplementation(async () => {
      creates += 1
      const call = creates
      if (creates === 2) createBarrier.resolve()
      await createBarrier.promise
      if (call === 1) return image
      throw new Prisma.PrismaClientKnownRequestError('synthetic unique race', {
        code: 'P2002',
        clientVersion: 'test',
      })
    })

    const [first, second] = await Promise.all([
      CONFIRM_POST(jsonRequest('/v1/uploads/confirm', { storage_key: ownKey })),
      CONFIRM_POST(jsonRequest('/v1/uploads/confirm', { storage_key: ownKey })),
    ])

    expect([first.status, second.status].sort()).toEqual([200, 201])
    expect(mocks.storageInfo).toHaveBeenCalledTimes(1)
    expect(mocks.storageDownload).toHaveBeenCalledTimes(1)
    expect(mocks.verifyUploadedImage).toHaveBeenCalledTimes(1)
    expect(mocks.sanitizeUploadedImage).toHaveBeenCalledTimes(1)
    expect(mocks.thumbnailVariant).toHaveBeenCalledTimes(1)
    expect(mocks.previewVariant).toHaveBeenCalledTimes(1)
    expect(mocks.imageCreate).toHaveBeenCalledTimes(2)
  })

  it('returns 201 with Image shape (no storage_key leak)', async () => {
    authed()
    const { verifiedBuffer } = setupVariantMocks('image/png')
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
        width: 1,
        height: 1,
        file_size: 1,
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
    expect(mocks.imageCreate).toHaveBeenCalledWith({
      data: {
        userId: USER_ID,
        storageKey: ownKey,
        contentType: 'image/png',
        width: 800,
        height: 600,
        fileSize: verifiedBuffer.length,
        metadataSanitizedAt: expect.any(Date),
      },
    })
  })

  it('sanitizes and marks an existing unsanitized Image on confirm retry', async () => {
    authed()
    setupVariantMocks()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    const existingImage = {
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      userId: USER_ID,
      memoryId: null,
      storageKey: ownKey,
      contentType: 'image/jpeg',
      width: 800,
      height: 600,
      fileSize: 10000,
      metadataSanitizedAt: null,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      updatedAt: new Date('2026-05-23T10:00:00Z'),
      deletedAt: null,
    }
    mocks.imageFindUnique.mockResolvedValue(existingImage)
    mocks.imageUpdate.mockImplementation(async ({ data }) => ({ ...existingImage, ...data }))

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(200)
    expect(mocks.storageUpdate).toHaveBeenCalledTimes(1)
    expect(mocks.imageUpdate).toHaveBeenCalledWith({
      where: { id: existingImage.id },
      data: expect.objectContaining({ metadataSanitizedAt: expect.any(Date) }),
    })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('uploads _thumb.webp and _preview.webp variants (ISSUE-031)', async () => {
    authed()
    const { storageBuffer, verifiedBuffer } = setupVariantMocks()
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
    expect(mocks.storageInfo).toHaveBeenCalledWith(ownKey)
    const storageSignal = (
      mocks.createAdminClient.mock.calls[0]?.[0] as { signal?: AbortSignal } | undefined
    )?.signal
    expect(storageSignal).toBeInstanceOf(AbortSignal)
    expect(storageSignal?.aborted).toBe(false)
    expect(mocks.storageDownload).toHaveBeenCalledWith(ownKey, {}, { signal: storageSignal })
    expect(mocks.verifyUploadedImage).toHaveBeenCalledWith(
      storageBuffer,
      'image/jpeg',
      'image/jpeg',
    )
    expect(mocks.sanitizeUploadedImage).toHaveBeenCalledWith(
      expect.objectContaining({ buffer: verifiedBuffer }),
    )
    expect(mocks.storageUpdate).toHaveBeenCalledWith(
      ownKey,
      verifiedBuffer,
      expect.objectContaining({
        contentType: 'image/jpeg',
        cacheControl: '300',
        upsert: true,
      }),
    )
    expect(mocks.thumbnailVariant).toHaveBeenCalledWith(verifiedBuffer)
    expect(mocks.previewVariant).toHaveBeenCalledWith(verifiedBuffer)
    expect(mocks.thumbnailVariant).toHaveBeenCalledTimes(1)
    expect(mocks.previewVariant).toHaveBeenCalledTimes(1)
    expect(mocks.thumbnailVariant.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.previewVariant.mock.invocationCallOrder[0] as number,
    )
    expect(mocks.createAdminClient).toHaveBeenCalledTimes(2)
    expect(mocks.storageUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.thumbnailVariant.mock.invocationCallOrder[0] as number,
    )

    const uploadCalls = mocks.storageUpload.mock.calls.map((c) => c[0] as string)
    expect(uploadCalls).toHaveLength(2)
    expect(uploadCalls.some((k) => k.endsWith('_thumb.webp'))).toBe(true)
    expect(uploadCalls.some((k) => k.endsWith('_preview.webp'))).toBe(true)
  })

  it('does not create an Image when sanitized original replacement fails', async () => {
    authed()
    setupVariantMocks()
    mocks.storageUpdate.mockResolvedValue({
      data: null,
      error: { status: 503, statusCode: '503', message: 'sensitive replacement detail' },
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
    expect(mocks.thumbnailVariant).not.toHaveBeenCalled()
    expect(mocks.previewVariant).not.toHaveBeenCalled()
  })

  it('replaces the Storage original with metadata-free bytes before creating an Image', async () => {
    authed()
    const source = await sharp({
      create: {
        width: 6,
        height: 4,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Make: 'synthetic-camera' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1' },
        },
      })
      .toBuffer()
    const actual = await vi.importActual<
      typeof import('@/features/uploads/server/verify-uploaded-image')
    >('@/features/uploads/server/verify-uploaded-image')
    mocks.storageInfo.mockResolvedValue({
      data: { size: source.length, contentType: 'image/jpeg' },
      error: null,
    })
    mocks.storageDownloadAsStream.mockResolvedValue({
      data: streamFrom(source),
      error: null,
    })
    mocks.verifyUploadedImage.mockImplementation(actual.verifyUploadedImage)
    mocks.sanitizeUploadedImage.mockImplementation(actual.sanitizeUploadedImage)
    mocks.thumbnailVariant.mockResolvedValue({
      buffer: Buffer.from('fake-thumb'),
      contentType: 'image/webp',
    })
    mocks.previewVariant.mockResolvedValue({
      buffer: Buffer.from('fake-preview'),
      contentType: 'image/webp',
    })
    mocks.storageUpdate.mockResolvedValue({ data: { path: 'ok' }, error: null })
    mocks.storageUpload.mockResolvedValue({ data: { path: 'ok' }, error: null })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    mocks.imageCreate.mockImplementation(async ({ data }) => ({
      id: 'a1b2c3d4-1234-4d8e-9abc-fedcba987654',
      memoryId: null,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      updatedAt: new Date('2026-05-23T10:00:00Z'),
      deletedAt: null,
      ...data,
    }))

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(201)
    const storedOriginal = mocks.storageUpdate.mock.calls[0]?.[1] as Buffer
    const storedMetadata = await sharp(storedOriginal).metadata()
    expect(storedMetadata.width).toBe(4)
    expect(storedMetadata.height).toBe(6)
    expect(storedMetadata.exif).toBeUndefined()
    expect(storedMetadata.orientation).toBeUndefined()
    expect(storedOriginal).not.toEqual(source)
  })

  it('returns 404 without creating an Image when the Storage object is missing', async () => {
    authed()
    mocks.storageInfo.mockResolvedValue({
      data: null,
      error: {
        status: 404,
        statusCode: '404',
        message: 'sensitive external storage detail',
      },
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
        width: 800,
        height: 600,
        file_size: 10000,
      }),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ reason: 'not_found' })
    expect(mocks.verifyUploadedImage).not.toHaveBeenCalled()
    expect(mocks.imageCreate).not.toHaveBeenCalled()
    expect(mocks.storageUpload).not.toHaveBeenCalled()
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('sensitive external storage detail')

    errSpy.mockRestore()
  })

  it('returns a stable 503 when Storage is temporarily unavailable', async () => {
    authed()
    mocks.storageInfo.mockResolvedValue({
      data: null,
      error: {
        status: 503,
        statusCode: '503',
        message: 'sensitive external storage detail',
      },
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.verifyUploadedImage).not.toHaveBeenCalled()
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('rejects an oversized Storage object before starting download', async () => {
    authed()
    mocks.storageInfo.mockResolvedValue({
      data: { size: MAX_UPLOAD_FILE_SIZE + 1, contentType: 'image/jpeg' },
      error: null,
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      reason: 'validation_error',
      errors: [{ reason: 'file_too_large' }],
    })
    expect(mocks.storageDownload).not.toHaveBeenCalled()
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('returns a stable 503 when the Storage client throws', async () => {
    authed()
    mocks.storageInfo.mockRejectedValue(new Error('sensitive network detail'))
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it.each([
    [404, '404', 404, 'not_found'],
    [503, '503', 503, 'storage_unavailable'],
  ])(
    'maps a download error with status %i to %i %s',
    async (storageStatus, statusCode, expectedStatus, expectedReason) => {
      authed()
      setupVariantMocks()
      mocks.storageDownloadAsStream.mockResolvedValue({
        data: null,
        error: {
          status: storageStatus,
          statusCode,
          message: 'sensitive download detail',
        },
      })
      const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

      const res = await CONFIRM_POST(
        jsonRequest('/v1/uploads/confirm', {
          storage_key: ownKey,
        }),
      )

      expect(res.status).toBe(expectedStatus)
      expect(await res.json()).toMatchObject({ reason: expectedReason })
      expect(mocks.verifyUploadedImage).not.toHaveBeenCalled()
      expect(mocks.imageCreate).not.toHaveBeenCalled()
    },
  )

  it('returns a stable 503 when download throws', async () => {
    authed()
    setupVariantMocks()
    mocks.storageDownloadAsStream.mockRejectedValue(new Error('sensitive download detail'))
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('returns a stable 503 when the download stream fails while reading', async () => {
    authed()
    setupVariantMocks()
    mocks.storageDownloadAsStream.mockResolvedValue({
      data: new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('sensitive stream detail')
        },
      }),
      error: null,
    })
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: 'storage_unavailable' })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('returns a stable validation reason without creating an Image when verification fails', async () => {
    authed()
    const ownKey = generateStorageKey(USER_ID, 'image/jpeg')
    setupVariantMocks()
    mocks.verifyUploadedImage.mockRejectedValue(
      new ApiProblemError({
        type: 'https://hana.app/problems/validation-error',
        title: 'Validation Error',
        status: 422,
        reason: 'validation_error',
        detail: '入力内容に誤りがあります',
        errors: [
          {
            path: 'body.storage_key',
            reason: 'invalid_image_content',
            message: '画像データを読み取れません',
          },
        ],
      }),
    )

    const res = await CONFIRM_POST(
      jsonRequest('/v1/uploads/confirm', {
        storage_key: ownKey,
      }),
    )

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      reason: 'validation_error',
      errors: [{ reason: 'invalid_image_content' }],
    })
    expect(mocks.imageCreate).not.toHaveBeenCalled()
  })

  it('logs only stable reasons when variant uploads fail', async () => {
    authed()
    setupVariantMocks()
    mocks.storageUpload
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'sensitive thumbnail storage detail' },
      })
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'sensitive preview storage detail' },
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
    expect(errSpy).toHaveBeenCalledWith('variant upload (thumbnail) failed', {
      reason: 'variant_thumbnail_upload_failed',
    })
    expect(errSpy).toHaveBeenCalledWith('variant upload (preview) failed', {
      reason: 'variant_preview_upload_failed',
    })
    const loggedCalls = JSON.stringify(errSpy.mock.calls)
    expect(loggedCalls).not.toContain('sensitive thumbnail storage detail')
    expect(loggedCalls).not.toContain('sensitive preview storage detail')

    errSpy.mockRestore()
  })

  it('logs a stable reason when variant generation crashes', async () => {
    authed()
    setupVariantMocks()
    mocks.thumbnailVariant.mockRejectedValue(new Error('sensitive image processor detail'))
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
    expect(errSpy).toHaveBeenCalledWith('variant generation crashed', {
      reason: 'variant_generation_failed',
    })
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain('sensitive image processor detail')

    errSpy.mockRestore()
  })
})
