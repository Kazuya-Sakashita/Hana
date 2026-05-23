import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileUpsert: vi.fn(),
  childFindFirst: vi.fn(),
  imageFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryUpdate: vi.fn(),
  transaction: vi.fn(),
  txMemoryCreate: vi.fn(),
  txImageUpdateMany: vi.fn(),
  txMemoryFindUniqueOrThrow: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { upsert: mocks.profileUpsert },
    child: { findFirst: mocks.childFindFirst },
    image: { findMany: mocks.imageFindMany },
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
      update: mocks.memoryUpdate,
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        memory: {
          create: mocks.txMemoryCreate,
          findUniqueOrThrow: mocks.txMemoryFindUniqueOrThrow,
        },
        image: {
          updateMany: mocks.txImageUpdateMany,
        },
      }),
  },
}))

import { GET as LIST_GET, POST as LIST_POST } from '@/app/v1/memories/route'
import {
  DELETE as DETAIL_DELETE,
  GET as DETAIL_GET,
  PUT as DETAIL_PUT,
} from '@/app/v1/memories/[memoryId]/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555'
const CHILD_ID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'
const MEMORY_ID = '7d6e5f4c-3b2a-4291-8765-0123456789ab'
const IMAGE_ID = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'

const supabaseUser = { id: USER_ID, email: 'parent@example.com' }
const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}
const memoryRow = {
  id: MEMORY_ID,
  userId: USER_ID,
  childId: CHILD_ID,
  title: 'はじめての すなあそび',
  body: null,
  recordedAt: new Date('2026-05-23T00:00:00Z'),
  weather: null,
  isFavorite: false,
  aiGenerated: false,
  createdAt: new Date('2026-05-23T11:00:00Z'),
  updatedAt: new Date('2026-05-23T11:00:00Z'),
  deletedAt: null,
  images: [{ id: IMAGE_ID, createdAt: new Date('2026-05-23T10:00:00Z') }],
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileUpsert.mockResolvedValue(profileRow)
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

function jsonRequest(path: string, method: string, body?: unknown) {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

afterEach(() => vi.clearAllMocks())

describe('GET /v1/memories', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await LIST_GET(jsonRequest('/v1/memories', 'GET'))
    expect(res.status).toBe(401)
  })

  it('returns 200 + empty when no memories', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([])
    const res = await LIST_GET(jsonRequest('/v1/memories', 'GET'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [], page: { next_cursor: null } })
  })

  it('returns 200 + one memory + null cursor when no more pages', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([memoryRow])
    const res = await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ id: string }>
      page: { next_cursor: string | null }
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe(MEMORY_ID)
    expect(body.page.next_cursor).toBeNull()
  })

  it('rejects invalid cursor with 422', async () => {
    authed()
    const res = await LIST_GET(jsonRequest('/v1/memories?cursor=garbage', 'GET'))
    expect(res.status).toBe(422)
  })
})

describe('POST /v1/memories', () => {
  const validBody = {
    child_id: CHILD_ID,
    title: 'はじめての すなあそび',
    recorded_at: '2026-05-23',
    image_ids: [IMAGE_ID],
    ai_generated: false,
  }

  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(401)
  })

  it('returns 422 on invalid body', async () => {
    authed()
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', { ...validBody, title: '' }))
    expect(res.status).toBe(422)
  })

  it('returns 404 when child not found', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(null)
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(404)
  })

  it('returns 403 when child belongs to another user', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: OTHER_USER_ID })
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(403)
  })

  it('returns 422 when an image_id does not exist', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([]) // none found
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { errors: Array<{ reason: string }> }
    expect(body.errors[0]?.reason).toBe('image_not_found')
  })

  it('returns 403 when an image belongs to another user', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([{ id: IMAGE_ID, userId: OTHER_USER_ID, memoryId: null }])
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(403)
  })

  it('returns 422 when an image is already linked', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([
      { id: IMAGE_ID, userId: USER_ID, memoryId: 'other-memory' },
    ])
    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(422)
    const body = (await res.json()) as { errors: Array<{ reason: string }> }
    expect(body.errors[0]?.reason).toBe('already_linked')
  })

  it('returns 201 + Memory with image_ids when all checks pass', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([{ id: IMAGE_ID, userId: USER_ID, memoryId: null }])
    mocks.txMemoryCreate.mockResolvedValue({ id: MEMORY_ID })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txMemoryFindUniqueOrThrow.mockResolvedValue(memoryRow)

    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))
    expect(res.status).toBe(201)
    const body = (await res.json()) as { id: string; image_ids: string[] }
    expect(body.id).toBe(MEMORY_ID)
    expect(body.image_ids).toEqual([IMAGE_ID])
  })
})

describe('GET /v1/memories/{memoryId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ memoryId: id }) })

  it('returns 404 for invalid UUID', async () => {
    authed()
    const res = await DETAIL_GET(jsonRequest('/v1/memories/not-uuid', 'GET'), ctx('not-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when not found', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    const res = await DETAIL_GET(jsonRequest(`/v1/memories/${MEMORY_ID}`, 'GET'), ctx(MEMORY_ID))
    expect(res.status).toBe(404)
  })

  it('returns 403 when memory belongs to another user', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue({ ...memoryRow, userId: OTHER_USER_ID })
    const res = await DETAIL_GET(jsonRequest(`/v1/memories/${MEMORY_ID}`, 'GET'), ctx(MEMORY_ID))
    expect(res.status).toBe(403)
  })

  it('returns 200 + Memory for owner', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    const res = await DETAIL_GET(jsonRequest(`/v1/memories/${MEMORY_ID}`, 'GET'), ctx(MEMORY_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string }
    expect(body.id).toBe(MEMORY_ID)
  })
})

describe('PUT /v1/memories/{memoryId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ memoryId: id }) })

  it('returns 200 with updated title only', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.memoryUpdate.mockResolvedValue({ ...memoryRow, title: 'なおした' })
    const res = await DETAIL_PUT(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'PUT', { title: 'なおした' }),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string }
    expect(body.title).toBe('なおした')
  })

  it('returns 403 for foreign memory', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue({ ...memoryRow, userId: OTHER_USER_ID })
    const res = await DETAIL_PUT(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'PUT', { title: 'なおした' }),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(403)
  })
})

describe('DELETE /v1/memories/{memoryId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ memoryId: id }) })

  it('returns 204 on success', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.memoryUpdate.mockResolvedValue({ ...memoryRow, deletedAt: new Date() })
    const res = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(204)
    expect(mocks.memoryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }),
    )
  })

  it('returns 403 for foreign memory', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue({ ...memoryRow, userId: OTHER_USER_ID })
    const res = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(403)
  })
})
