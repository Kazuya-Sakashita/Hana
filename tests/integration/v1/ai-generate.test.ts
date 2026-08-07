import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Anthropic SDK / Supabase / Prisma を全モック
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  profileUpdate: vi.fn(),
  childFindFirst: vi.fn(),
  imageFindMany: vi.fn(),
  aiGenerationCount: vi.fn(),
  aiGenerationCreate: vi.fn(),
  aiGenerationUpdateMany: vi.fn(),
  advisoryLock: vi.fn(),
  transaction: vi.fn(),
  storageDownload: vi.fn(),
  adminSignals: [] as AbortSignal[],
  resizeForClaude: vi.fn(),
  messagesCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: ({ signal }: { signal: AbortSignal }) => {
    mocks.adminSignals.push(signal)
    return {
      storage: { from: () => ({ download: mocks.storageDownload }) },
    }
  },
}))

vi.mock('@/lib/ai/client', () => ({
  createAnthropicClient: () => ({
    messages: { create: mocks.messagesCreate },
  }),
  getAiModel: () => 'claude-haiku-4-5',
}))

// resize は単体テストで検証。integration では bypass (identity transform)
vi.mock('@/features/ai/server/resize', () => ({
  resizeForClaude: mocks.resizeForClaude,
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    child: { findFirst: mocks.childFindFirst },
    image: { findMany: mocks.imageFindMany },
    aiGeneration: {
      count: mocks.aiGenerationCount,
      create: mocks.aiGenerationCreate,
      updateMany: mocks.aiGenerationUpdateMany,
    },
  },
}))

import { POST } from '@/app/v1/ai/generate/route'
import { DELETE as REVOKE_CONSENT } from '@/app/v1/me/ai-consent/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555'
const CHILD_ID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'
const IMAGE_ID = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'
const IMAGE_IDS = [
  IMAGE_ID,
  'b1b2c3d4-1234-4d8e-9abc-fedcba987654',
  'c1b2c3d4-1234-4d8e-9abc-fedcba987654',
  'd1b2c3d4-1234-4d8e-9abc-fedcba987654',
  'e1b2c3d4-1234-4d8e-9abc-fedcba987654',
]

const supabaseUser = {
  id: USER_ID,
  email: 'parent@example.com',
  last_sign_in_at: '2026-08-07T00:00:00.000Z',
}
const profileConsented = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: new Date('2026-05-23T00:00:00Z'),
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-23T00:00:00Z'),
}
const profileNoConsent = { ...profileConsented, aiConsentAt: null }
const childRow = {
  id: CHILD_ID,
  userId: USER_ID,
  name: 'はると',
  birthdate: new Date('2026-01-13T00:00:00Z'),
}
const imageRow = {
  id: IMAGE_ID,
  userId: USER_ID,
  storageKey: 'image-fixture-key-001',
  contentType: 'image/jpeg',
}

function makeImageRows(ids: string[]) {
  return ids.map((id, index) => ({
    ...imageRow,
    id,
    storageKey: `image-fixture-key-${String(index + 1).padStart(3, '0')}`,
  }))
}

function authedWithConsent() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileConsented)
}
function authedNoConsent() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileNoConsent)
}
function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

function jsonRequest(body: unknown) {
  return new Request('http://localhost:3000/v1/ai/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validBody = {
  child_id: CHILD_ID,
  image_ids: [IMAGE_ID],
  recorded_at: '2026-05-23',
  weather: 'はれ',
  parent_note: null,
}

function mockClaudeSuccess(text: string) {
  mocks.messagesCreate.mockResolvedValue({
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  })
}

function syntheticClaudeJson(body = 'あ'.repeat(80)) {
  return JSON.stringify({ title: 'きろく', body, tags: ['合成'] })
}

function mockStorageReturnsImage() {
  // Blob with arrayBuffer() that returns a small fake JPEG byte sequence
  const blob = {
    arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
  }
  mocks.storageDownload.mockResolvedValue({ data: blob, error: null })
}

function mockResizeIdentity() {
  mocks.resizeForClaude.mockImplementation(async (buf: Buffer) => ({
    buffer: buf,
    mediaType: 'image/jpeg' as const,
  }))
}

beforeEach(() => {
  mocks.adminSignals.length = 0
  mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-default' })
  mocks.aiGenerationUpdateMany.mockResolvedValue({ count: 1 })
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(
    async (
      callback: (transaction: {
        $executeRaw: typeof mocks.advisoryLock
        image: { findMany: typeof mocks.imageFindMany }
        profile: { findUnique: typeof mocks.profileFindUnique }
        child: { findFirst: typeof mocks.childFindFirst }
        aiGeneration: {
          count: typeof mocks.aiGenerationCount
          create: typeof mocks.aiGenerationCreate
          updateMany: typeof mocks.aiGenerationUpdateMany
        }
      }) => Promise<unknown>,
    ) =>
      callback({
        $executeRaw: mocks.advisoryLock,
        image: { findMany: mocks.imageFindMany },
        profile: { findUnique: mocks.profileFindUnique },
        child: { findFirst: mocks.childFindFirst },
        aiGeneration: {
          count: mocks.aiGenerationCount,
          create: mocks.aiGenerationCreate,
          updateMany: mocks.aiGenerationUpdateMany,
        },
      }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('POST /v1/ai/generate', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(401)
  })

  it('returns 403 ai_consent_required when not consented', async () => {
    authedNoConsent()
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('ai_consent_required')
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
  })

  it('returns 429 ai_quota_exceeded when monthly limit reached', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(20)
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(429)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('ai_quota_exceeded')
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
  })

  it('returns 404 when child not found', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(null)
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(404)
  })

  it('returns 403 when child belongs to another user', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue({ ...childRow, userId: OTHER_USER_ID })
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(403)
  })

  it('returns 422 when image_id does not exist', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([])
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(422)
    expect(mocks.imageFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: [IMAGE_ID] },
        userId: USER_ID,
        deletedAt: null,
        memoryId: null,
        metadataSanitizedAt: { not: null },
      },
      select: { id: true, userId: true, storageKey: true, contentType: true },
    })
    expect(mocks.storageDownload).not.toHaveBeenCalled()
  })

  it('returns 422 for HEIC images (not supported by Claude)', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([{ ...imageRow, contentType: 'image/heic' }])
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { errors: Array<{ reason: string }> }
    expect(body.errors[0]?.reason).toBe('media_type_not_supported_for_ai')
  })

  it('returns 200 with title/body/tags on success', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mockClaudeSuccess(syntheticClaudeJson())
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-1' })

    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      generation_id: string
      title: string
      body: string
      tags: string[]
    }
    expect(body.title).toBe('きろく')
    expect(body.body).toBe('あ'.repeat(80))
    expect(body.tags).toEqual(['合成'])
    expect(body.generation_id).toBe('gen-1')
    // vendor呼び出し前にquota枠を予約し、claim後に同じ行を成功状態へ更新する
    expect(mocks.aiGenerationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: false,
          status: 'reserved',
          countsTowardQuota: false,
          errorReason: 'in_progress',
          userId: USER_ID,
        }),
      }),
    )
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'gen-1', status: 'processing' }),
        data: expect.objectContaining({ status: 'succeeded', succeeded: true, errorReason: null }),
      }),
    )
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'gen-1', status: 'reserved' }),
        data: expect.objectContaining({
          status: 'processing',
          countsTowardQuota: true,
          quotaCountedAt: expect.any(Date),
        }),
      }),
    )
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(5)
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 5_000,
    })
    expect(mocks.transaction).toHaveBeenCalledTimes(3)
    expect(mocks.messagesCreate.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(AbortSignal),
    })
  })

  it('downloads and sends images in request order even when the database returns another order', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    const requestedIds = IMAGE_IDS.slice(0, 2)
    const rows = makeImageRows(requestedIds)
    mocks.imageFindMany.mockResolvedValue([rows[1], rows[0]])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mockClaudeSuccess(syntheticClaudeJson())

    const response = await POST(jsonRequest({ ...validBody, image_ids: requestedIds }))

    expect(response.status).toBe(200)
    expect(mocks.storageDownload.mock.calls.map(([key]) => key)).toEqual([
      rows[0]?.storageKey,
      rows[1]?.storageKey,
    ])
  })

  it('stops before external AI submission when consent is revoked during image preparation', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.profileFindUnique
      .mockResolvedValueOnce(profileConsented)
      .mockResolvedValueOnce(profileNoConsent)
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()

    const res = await POST(jsonRequest(validBody))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reason: 'ai_consent_required' })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
  })

  it('rechecks consent under the shared lock immediately before vendor submission', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.profileFindUnique
      .mockResolvedValueOnce(profileConsented)
      .mockResolvedValueOnce(profileConsented)
      .mockResolvedValueOnce(profileNoConsent)
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()

    const res = await POST(jsonRequest(validBody))

    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reason: 'ai_consent_required' })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationCreate).toHaveBeenCalledOnce()
  })

  it('stops before external AI submission when an image is deleted during preparation', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValueOnce([imageRow]).mockResolvedValueOnce([])
    mockStorageReturnsImage()
    mockResizeIdentity()

    const res = await POST(jsonRequest(validBody))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      reason: 'validation_error',
      errors: [{ path: 'body.image_ids', reason: 'image_not_found' }],
    })
    expect(mocks.imageFindMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: { in: [IMAGE_ID] },
        userId: USER_ID,
        deletedAt: null,
        memoryId: null,
        metadataSanitizedAt: { not: null },
      },
      select: { id: true },
    })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationCreate).toHaveBeenCalledTimes(1)
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: false,
          errorReason: 'validation_error',
        }),
      }),
    )
  })

  it('releases every database transaction before the external AI attempt finishes', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-lock-order' })

    let resolveVendor: ((value: ReturnType<typeof syntheticClaudeJson>) => void) | undefined
    mocks.messagesCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVendor = (text) =>
            resolve({
              content: [{ type: 'text', text }],
              usage: { input_tokens: 100, output_tokens: 50 },
            })
        }),
    )
    let activeTransactions = 0
    mocks.transaction.mockImplementation(
      async (
        callback: (transaction: {
          $executeRaw: typeof mocks.advisoryLock
          image: { findMany: typeof mocks.imageFindMany }
          profile: { findUnique: typeof mocks.profileFindUnique }
          child: { findFirst: typeof mocks.childFindFirst }
          aiGeneration: {
            count: typeof mocks.aiGenerationCount
            create: typeof mocks.aiGenerationCreate
            updateMany: typeof mocks.aiGenerationUpdateMany
          }
        }) => Promise<unknown>,
        options?: { timeout?: number },
      ) => {
        activeTransactions += 1
        try {
          return await callback({
            $executeRaw: mocks.advisoryLock,
            image: { findMany: mocks.imageFindMany },
            profile: { findUnique: mocks.profileFindUnique },
            child: { findFirst: mocks.childFindFirst },
            aiGeneration: {
              count: mocks.aiGenerationCount,
              create: mocks.aiGenerationCreate,
              updateMany: mocks.aiGenerationUpdateMany,
            },
          })
        } finally {
          activeTransactions -= 1
        }
      },
    )

    const responsePromise = POST(jsonRequest(validBody))
    await vi.waitFor(() => expect(mocks.messagesCreate).toHaveBeenCalledTimes(1))

    expect(mocks.advisoryLock).toHaveBeenCalledTimes(3)
    expect(activeTransactions).toBe(0)

    resolveVendor?.(syntheticClaudeJson())
    const response = await responsePromise

    expect(response.status).toBe(200)
    expect(activeTransactions).toBe(0)
  })

  it('commits revocation during vendor work and discards the completed output', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    let currentProfile: typeof profileConsented | typeof profileNoConsent = {
      ...profileConsented,
    }
    mocks.profileFindUnique.mockImplementation(async () => currentProfile)
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mocks.profileUpdate.mockImplementation(async () => {
      currentProfile = { ...profileNoConsent }
      return currentProfile
    })
    mockStorageReturnsImage()
    mockResizeIdentity()

    let resolveVendor: ((value: unknown) => void) | undefined
    mocks.messagesCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVendor = resolve
        }),
    )

    let consentLocked = false
    const consentWaiters: Array<() => void> = []
    mocks.transaction.mockImplementation(
      async (callback: (transaction: never) => Promise<unknown>) => {
        let releaseConsent: (() => void) | undefined
        const transaction = {
          $executeRaw: async (_strings: TemplateStringsArray, value: unknown) => {
            if (typeof value === 'string' && value.startsWith('hana:ai-consent:')) {
              if (consentLocked) await new Promise<void>((resolve) => consentWaiters.push(resolve))
              consentLocked = true
              releaseConsent = () => {
                consentLocked = false
                consentWaiters.shift()?.()
              }
            }
            return 1
          },
          profile: { findUnique: mocks.profileFindUnique, update: mocks.profileUpdate },
          image: { findMany: mocks.imageFindMany },
          child: { findFirst: mocks.childFindFirst },
          aiGeneration: {
            count: mocks.aiGenerationCount,
            create: mocks.aiGenerationCreate,
            updateMany: mocks.aiGenerationUpdateMany,
          },
        }
        try {
          return await callback(transaction as never)
        } finally {
          releaseConsent?.()
        }
      },
    )

    const generationResponse = POST(jsonRequest(validBody))
    await vi.waitFor(() => expect(mocks.messagesCreate).toHaveBeenCalledOnce())

    const revokeResponse = REVOKE_CONSENT()
    expect((await revokeResponse).status).toBe(200)
    expect(mocks.profileUpdate).toHaveBeenCalledOnce()

    resolveVendor?.({
      content: [{ type: 'text', text: syntheticClaudeJson() }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const response = await generationResponse
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ reason: 'ai_consent_required' })
    expect(mocks.profileUpdate).toHaveBeenCalledWith({
      where: { id: USER_ID },
      data: { aiConsentAt: null },
    })
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'processing' }),
        data: expect.objectContaining({
          status: 'discarded',
          countsTowardQuota: true,
          errorReason: 'ai_consent_required',
        }),
      }),
    )
  })

  it('discards the completed output when an image is deleted during vendor work', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany
      .mockResolvedValueOnce([imageRow])
      .mockResolvedValueOnce([{ id: IMAGE_ID }])
      .mockResolvedValueOnce([])
    mockStorageReturnsImage()
    mockResizeIdentity()

    let resolveVendor: ((value: unknown) => void) | undefined
    mocks.messagesCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVendor = resolve
        }),
    )

    const responsePromise = POST(jsonRequest(validBody))
    await vi.waitFor(() => expect(mocks.messagesCreate).toHaveBeenCalledOnce())
    expect(mocks.imageFindMany).toHaveBeenCalledTimes(2)

    resolveVendor?.({
      content: [{ type: 'text', text: syntheticClaudeJson() }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const response = await responsePromise
    const body = (await response.json()) as Record<string, unknown>
    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      reason: 'validation_error',
      errors: [{ path: 'body.image_ids', reason: 'image_not_found' }],
    })
    expect(body.title).not.toBe('きろく')
    expect(body).not.toHaveProperty('body')
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'processing' }),
        data: expect.objectContaining({
          status: 'discarded',
          countsTowardQuota: true,
          errorReason: 'image_not_found',
        }),
      }),
    )
  })

  it('does not return output when a fenced finalization no longer owns the processing claim', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mockClaudeSuccess(syntheticClaudeJson())
    mocks.aiGenerationUpdateMany.mockImplementation(async ({ data }) => ({
      count: data.status === 'processing' ? 1 : 0,
    }))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const response = await POST(jsonRequest(validBody))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(500)
    expect(body.reason).toBe('ai_generation_failed')
    expect(body.title).not.toBe('きろく')
    expect(body).not.toHaveProperty('body')
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'processing',
          claimToken: expect.any(String),
        }),
        data: expect.objectContaining({ status: 'succeeded' }),
      }),
    )
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'processing',
          claimToken: expect.any(String),
          leaseExpiresAt: { gt: expect.any(Date) },
        }),
        data: expect.objectContaining({ status: 'failed' }),
      }),
    )
    errorLog.mockRestore()
  })

  it('does not count a reserved generation when revocation wins before vendor send', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mocks.profileFindUnique
      .mockResolvedValueOnce(profileConsented)
      .mockResolvedValueOnce({ aiConsentAt: new Date('2026-05-23T00:00:00Z') })
      .mockResolvedValueOnce({ aiConsentAt: null })
    mockStorageReturnsImage()
    mockResizeIdentity()

    const response = await POST(jsonRequest(validBody))

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ reason: 'ai_consent_required' })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: 'gen-default', status: 'reserved' }),
      data: expect.objectContaining({
        succeeded: false,
        countsTowardQuota: false,
        errorReason: 'ai_consent_required',
      }),
    })
  })

  it('aborts all external image and AI work within the twelve second product deadline', async () => {
    vi.useFakeTimers()
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-deadline' })

    let vendorSignal: AbortSignal | undefined
    mocks.messagesCreate.mockImplementation(
      (_payload: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          vendorSignal = options?.signal
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    const responsePromise = POST(jsonRequest(validBody))
    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1)
    expect(vendorSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(12_000)
    const response = await responsePromise

    expect(response.status).toBe(500)
    expect(vendorSignal?.aborted).toBe(true)
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'gen-deadline', status: 'processing' }),
        data: expect.objectContaining({
          status: 'failed',
          succeeded: false,
          countsTowardQuota: true,
          errorReason: 'internal_error',
        }),
      }),
    )
  })

  it('counts five-image preparation time toward the twelve second product deadline', async () => {
    vi.useFakeTimers()
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue(makeImageRows(IMAGE_IDS))
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-five-image-deadline' })
    mockResizeIdentity()

    const blob = {
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    }
    mocks.storageDownload.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ data: blob, error: null }), 3_000)),
    )

    let vendorSignal: AbortSignal | undefined
    mocks.messagesCreate.mockImplementation(
      (_payload: unknown, options?: { signal?: AbortSignal }) =>
        new Promise((_, reject) => {
          vendorSignal = options?.signal
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'))
          })
        }),
    )

    const responsePromise = POST(jsonRequest({ ...validBody, image_ids: IMAGE_IDS }))
    await vi.advanceTimersByTimeAsync(9_000)

    expect(mocks.storageDownload).toHaveBeenCalledTimes(5)
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(1)
    expect(vendorSignal?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(3_000)
    const response = await responsePromise

    expect(response.status).toBe(500)
    expect(vendorSignal?.aborted).toBe(true)
  })

  it('prepares five images with concurrency two and preserves all inputs', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue(makeImageRows(IMAGE_IDS))
    mockClaudeSuccess(syntheticClaudeJson())
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-1' })

    const blob = {
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    }
    let activePreparations = 0
    let maxActivePreparations = 0
    mocks.storageDownload.mockImplementation(async () => {
      activePreparations += 1
      maxActivePreparations = Math.max(maxActivePreparations, activePreparations)
      await new Promise((resolve) => setTimeout(resolve, 5))
      activePreparations -= 1
      return { data: blob, error: null }
    })
    mockResizeIdentity()

    const res = await POST(jsonRequest({ ...validBody, image_ids: IMAGE_IDS }))
    expect(res.status).toBe(200)
    expect(maxActivePreparations).toBe(2)
    expect(mocks.storageDownload).toHaveBeenCalledTimes(5)
    expect(mocks.resizeForClaude).toHaveBeenCalledTimes(5)
  })

  it('returns 500 and skips Claude when one image download fails', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue(makeImageRows(IMAGE_IDS.slice(0, 2)))
    mockResizeIdentity()

    const blob = {
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    }
    mocks.storageDownload
      .mockResolvedValueOnce({ data: blob, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'not found' } })
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'failed-gen-1' })

    const res = await POST(jsonRequest({ ...validBody, image_ids: IMAGE_IDS.slice(0, 2) }))

    expect(res.status).toBe(500)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('ai_generation_failed')
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
  })

  it('aborts an in-flight sibling and does not start queued images after preparation fails', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue(makeImageRows(IMAGE_IDS.slice(0, 3)))
    mockResizeIdentity()
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    mocks.storageDownload.mockImplementation(async (storageKey: string) => {
      const signal = mocks.adminSignals.at(-1)!
      if (storageKey.endsWith('001')) {
        return { data: null, error: { message: 'synthetic failure' } }
      }
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), {
          once: true,
        })
      })
    })

    const response = await POST(jsonRequest({ ...validBody, image_ids: IMAGE_IDS.slice(0, 3) }))

    expect(response.status).toBe(500)
    expect(mocks.storageDownload).toHaveBeenCalledTimes(2)
    expect(mocks.adminSignals).toHaveLength(2)
    expect(mocks.adminSignals[1]?.aborted).toBe(true)
    expect(mocks.resizeForClaude).not.toHaveBeenCalled()
    expect(mocks.messagesCreate).not.toHaveBeenCalled()
    expect(mocks.aiGenerationCreate).not.toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it('returns 500 ai_generation_failed when Claude returns invalid JSON', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mockClaudeSuccess('完全に JSON でないテキスト')

    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(500)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('ai_generation_failed')
    // 予約済み行が失敗状態へ更新された
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ succeeded: false }),
      }),
    )
  })

  it('regenerates once and returns only the accepted synthetic output', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    const rejectedBody = '奇跡のような瞬間でした'.padEnd(80, 'あ')
    mocks.messagesCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: syntheticClaudeJson(rejectedBody) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: syntheticClaudeJson() }],
        usage: { input_tokens: 110, output_tokens: 55 },
      })
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-safe-retry' })

    const res = await POST(jsonRequest(validBody))

    expect(res.status).toBe(200)
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(2)
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: true,
          inputTokens: 210,
          outputTokens: 105,
          attemptCount: 2,
          policyCategoryIds: ['exaggerated_expression'],
          policyOutcome: 'accepted_after_retry',
        }),
      }),
    )
    const secondRequest = mocks.messagesCreate.mock.calls[1]?.[0]
    expect(JSON.stringify(secondRequest)).toContain(
      '前回の出力はHanaの安全基準を満たしませんでした',
    )
    expect(JSON.stringify(secondRequest)).not.toContain(rejectedBody)
  })

  it('stops after one retry and returns 422 without rejected output details', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mocks.messagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: syntheticClaudeJson('発達が早いです'.padEnd(80, 'あ')) }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-safety-rejected' })

    const res = await POST(jsonRequest(validBody))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(422)
    expect(body.reason).toBe('ai_output_rejected')
    expect(body.title).toBe('Unprocessable Entity')
    expect(body).not.toHaveProperty('body')
    expect(body).not.toHaveProperty('categoryIds')
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(2)
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: false,
          inputTokens: 200,
          outputTokens: 100,
          attemptCount: 2,
          policyCategoryIds: ['medical_development_claim'],
          policyOutcome: 'rejected_after_retry',
          errorReason: 'ai_output_rejected',
        }),
      }),
    )
    expect(JSON.stringify(mocks.aiGenerationUpdateMany.mock.calls)).not.toContain('発達が早いです')
  })

  it('records safe metadata when the retry fails without logging the external error message', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
    mockResizeIdentity()
    mocks.messagesCreate
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: syntheticClaudeJson('奇跡のような瞬間'.padEnd(80, 'あ')) }],
        usage: { input_tokens: 100, output_tokens: 50 },
      })
      .mockRejectedValueOnce(new Error('SENSITIVE_SENTINEL'))
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-retry-failed' })
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const res = await POST(jsonRequest(validBody))
    const body = (await res.json()) as Record<string, unknown>

    expect(res.status).toBe(500)
    expect(body.reason).toBe('ai_generation_failed')
    expect(mocks.messagesCreate).toHaveBeenCalledTimes(2)
    expect(mocks.aiGenerationUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: false,
          inputTokens: 100,
          outputTokens: 50,
          attemptCount: 2,
          policyCategoryIds: ['exaggerated_expression'],
          policyOutcome: 'retry_failed',
          errorReason: 'internal_error',
        }),
      }),
    )
    expect(errorLog).toHaveBeenCalledWith('AI generate failed', { reason: 'internal_error' })
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('SENSITIVE_SENTINEL')
    expect(JSON.stringify(body)).not.toContain('SENSITIVE_SENTINEL')
  })
})
