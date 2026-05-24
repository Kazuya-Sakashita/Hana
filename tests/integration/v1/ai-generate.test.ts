import { afterEach, describe, expect, it, vi } from 'vitest'

// Anthropic SDK / Supabase / Prisma を全モック
const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileUpsert: vi.fn(),
  childFindFirst: vi.fn(),
  imageFindMany: vi.fn(),
  aiGenerationCount: vi.fn(),
  aiGenerationCreate: vi.fn(),
  storageDownload: vi.fn(),
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

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { upsert: mocks.profileUpsert },
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
  storageKey: 'uploads/abc/202605/foo.jpg',
  contentType: 'image/jpeg',
}

function authedWithConsent() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileUpsert.mockResolvedValue(profileConsented)
}
function authedNoConsent() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileUpsert.mockResolvedValue(profileNoConsent)
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

  it('returns 500 ai_generation_failed when Claude returns invalid JSON', async () => {
    authedWithConsent()
    mocks.aiGenerationCount.mockResolvedValue(0)
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.imageFindMany.mockResolvedValue([imageRow])
    mockStorageReturnsImage()
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
