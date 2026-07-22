import { afterEach, describe, expect, it, vi } from 'vitest'

// Anthropic SDK / Supabase / Prisma を全モック
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  childFindFirst: vi.fn(),
  imageFindMany: vi.fn(),
  aiGenerationCount: vi.fn(),
  aiGenerationCreate: vi.fn(),
  storageDownload: vi.fn(),
  resizeForClaude: vi.fn(),
  messagesCreate: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ download: mocks.storageDownload }) },
  }),
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
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    child: { findFirst: mocks.childFindFirst },
    image: { findMany: mocks.imageFindMany },
    aiGeneration: {
      count: mocks.aiGenerationCount,
      create: mocks.aiGenerationCreate,
    },
  },
}))

import { POST } from '@/app/v1/ai/generate/route'

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

const supabaseUser = { id: USER_ID, email: 'parent@example.com' }
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

afterEach(() => vi.clearAllMocks())

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
  })

  it('returns 429 ai_quota_exceeded when monthly limit reached', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(20)
    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(429)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('ai_quota_exceeded')
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
    mockClaudeSuccess('{"title":"はじめて","body":"きょうは...","tags":["はじめて","おそと"]}')
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-1' })

    const res = await POST(jsonRequest(validBody))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      generation_id: string
      title: string
      body: string
      tags: string[]
    }
    expect(body.title).toBe('はじめて')
    expect(body.body).toBe('きょうは...')
    expect(body.tags).toEqual(['はじめて', 'おそと'])
    expect(body.generation_id).toBe('gen-1')
    // 成功ログが作成された
    expect(mocks.aiGenerationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ succeeded: true, userId: USER_ID }),
      }),
    )
  })

  it('starts download and resize for five images in parallel', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue(makeImageRows(IMAGE_IDS))
    mockClaudeSuccess('{"title":"はじめて","body":"きょうは...","tags":["はじめて","おそと"]}')
    mocks.aiGenerationCreate.mockResolvedValue({ id: 'gen-1' })

    const blob = {
      arrayBuffer: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0]).buffer,
    }
    const downloadResolvers: Array<(value: { data: typeof blob; error: null }) => void> = []
    const resizeResolvers: Array<() => void> = []
    mocks.storageDownload.mockImplementation(
      () =>
        new Promise((resolve) => {
          downloadResolvers.push(resolve)
        }),
    )
    mocks.resizeForClaude.mockImplementation(
      (buf: Buffer) =>
        new Promise((resolve) => {
          resizeResolvers.push(() => resolve({ buffer: buf, mediaType: 'image/jpeg' as const }))
        }),
    )

    const resPromise = POST(jsonRequest({ ...validBody, image_ids: IMAGE_IDS }))

    await vi.waitFor(() => {
      expect(mocks.storageDownload).toHaveBeenCalledTimes(5)
    })
    expect(mocks.resizeForClaude).not.toHaveBeenCalled()

    for (const resolve of downloadResolvers) {
      resolve({ data: blob, error: null })
    }

    await vi.waitFor(() => {
      expect(mocks.resizeForClaude).toHaveBeenCalledTimes(5)
    })
    expect(mocks.messagesCreate).not.toHaveBeenCalled()

    for (const resolve of resizeResolvers) {
      resolve()
    }

    const res = await resPromise
    expect(res.status).toBe(200)
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
    expect(mocks.aiGenerationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          succeeded: false,
          errorReason: 'internal_error',
        }),
      }),
    )
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
    // 失敗ログが作成された
    expect(mocks.aiGenerationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ succeeded: false }),
      }),
    )
  })
})
