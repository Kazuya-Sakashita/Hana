import { Prisma } from '@prisma/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  childFindFirst: vi.fn(),
  imageFindMany: vi.fn(),
  memoryFindFirst: vi.fn(),
  memoryFindMany: vi.fn(),
  memoryCount: vi.fn(),
  memoryUpdate: vi.fn(),
  transaction: vi.fn(),
  advisoryLock: vi.fn(),
  txMemoryCreate: vi.fn(),
  txMemoryUpdateMany: vi.fn(),
  txImageFindMany: vi.fn(),
  txImageUpdateMany: vi.fn(),
  txMemoryFindUniqueOrThrow: vi.fn(),
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
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    child: { findFirst: mocks.childFindFirst },
    image: { findMany: mocks.imageFindMany },
    memory: {
      findFirst: mocks.memoryFindFirst,
      findMany: mocks.memoryFindMany,
      count: mocks.memoryCount,
      update: mocks.memoryUpdate,
    },
    $transaction: mocks.transaction,
  },
}))

import { GET as LIST_GET, POST as LIST_POST } from '@/app/v1/memories/route'
import { encodeCursor } from '@/features/memories/server/parse'
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
const IMAGE_ID_2 = 'b2c3d4e5-2345-4e9f-8bcd-fedcba987655'
const IDEMPOTENCY_KEY = '123e4567-e89b-42d3-a456-426614174000'

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
  idempotencyKey: IDEMPOTENCY_KEY,
  title: 'はじめての すなあそび',
  body: null,
  recordedAt: new Date('2026-05-23T00:00:00Z'),
  weather: null,
  isFavorite: false,
  aiGenerated: false,
  createdAt: new Date('2026-05-23T11:00:00Z'),
  updatedAt: new Date('2026-05-23T11:00:00Z'),
  deletedAt: null,
  images: [
    {
      id: IMAGE_ID,
      createdAt: new Date('2026-05-23T10:00:00Z'),
      memoryPosition: 0,
      storageKey: 'uploads/abc/202605/img.jpg',
    },
  ],
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileRow)
  mocks.memoryCount.mockResolvedValue(0)
  mocks.memoryFindFirst.mockResolvedValue(null)
  mocks.advisoryLock.mockResolvedValue(1)
  mocks.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      $executeRaw: mocks.advisoryLock,
      memory: {
        create: mocks.txMemoryCreate,
        updateMany: mocks.txMemoryUpdateMany,
        findUniqueOrThrow: mocks.txMemoryFindUniqueOrThrow,
      },
      image: {
        findMany: mocks.txImageFindMany,
        updateMany: mocks.txImageUpdateMany,
      },
    }),
  )
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

function jsonRequest(
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const requestHeaders: Record<string, string> = {
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...headers,
  }
  if (method === 'POST' && path === '/v1/memories' && !Object.hasOwn(headers, 'Idempotency-Key')) {
    requestHeaders['Idempotency-Key'] = IDEMPOTENCY_KEY
  }
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  })
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

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
    expect(await res.json()).toEqual({
      data: [],
      page: { next_cursor: null, total_count: 0 },
    })
  })

  it('returns 200 + one memory + null cursor when no more pages', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([memoryRow])
    mocks.memoryCount.mockResolvedValue(1)
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/thumb-1' },
      error: null,
    })
    const res = await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ id: string; cover_thumbnail_url: string | null }>
      page: { next_cursor: string | null; total_count: number }
    }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]?.id).toBe(MEMORY_ID)
    expect(body.data[0]?.cover_thumbnail_url).toBe('https://example.com/thumb-1')
    expect(body.page.next_cursor).toBeNull()
    expect(body.page.total_count).toBe(1)
  })

  it('returns multiple memories without collapsing the list', async () => {
    authed()
    const olderMemory = {
      ...memoryRow,
      id: '00000000-0000-4000-8000-000000000003',
      title: 'ふたつめのページ',
      recordedAt: new Date('2026-05-22T00:00:00Z'),
      createdAt: new Date('2026-05-22T11:00:00Z'),
      updatedAt: new Date('2026-05-22T11:00:00Z'),
      images: [
        {
          id: '00000000-0000-4000-8000-000000000030',
          createdAt: new Date('2026-05-22T10:00:00Z'),
          storageKey: 'uploads/abc/202605/img-older.jpg',
        },
      ],
    }
    mocks.memoryFindMany.mockResolvedValue([memoryRow, olderMemory])
    mocks.memoryCount.mockResolvedValue(2)
    mocks.createSignedUrl
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/thumb-1' }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: 'https://example.com/thumb-2' }, error: null })

    const res = await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))

    expect(res.status).toBe(200)
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, deletedAt: null },
        orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
        take: 21,
        include: expect.objectContaining({
          images: expect.objectContaining({
            where: { deletedAt: null },
          }),
        }),
      }),
    )
    const body = (await res.json()) as {
      data: Array<{ id: string; title: string; cover_thumbnail_url: string | null }>
      page: { next_cursor: string | null }
    }
    expect(body.data.map((memory) => memory.id)).toEqual([MEMORY_ID, olderMemory.id])
    expect(body.data.map((memory) => memory.cover_thumbnail_url)).toEqual([
      'https://example.com/thumb-1',
      'https://example.com/thumb-2',
    ])
    expect(body.page.next_cursor).toBeNull()
  })

  it('includes cover_thumbnail_url via pre-generated _thumb.webp variant (BFF, ISSUE-031)', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([memoryRow])
    mocks.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://example.com/thumb-bff' },
      error: null,
    })

    await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))
    expect(mocks.createSignedUrl).toHaveBeenCalledWith('uploads/abc/202605/img_thumb.webp', 1800)
  })

  it('returns cover_thumbnail_url=null when memory has no images', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([{ ...memoryRow, images: [] }])
    const res = await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ cover_thumbnail_url: string | null }>
    }
    expect(body.data[0]?.cover_thumbnail_url).toBeNull()
    expect(mocks.createSignedUrl).not.toHaveBeenCalled()
  })

  it('returns cover_thumbnail_url=null when signed URL generation fails', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([memoryRow])
    mocks.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await LIST_GET(jsonRequest('/v1/memories?limit=20', 'GET'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      data: Array<{ cover_thumbnail_url: string | null }>
    }
    expect(body.data[0]?.cover_thumbnail_url).toBeNull()

    spy.mockRestore()
  })

  it('rejects invalid cursor with 422', async () => {
    authed()
    const res = await LIST_GET(jsonRequest('/v1/memories?cursor=garbage', 'GET'))
    expect(res.status).toBe(422)
  })

  it('applies the owner, deletion and requested month range to list and count queries', async () => {
    authed()
    mocks.memoryFindMany.mockResolvedValue([memoryRow])
    mocks.memoryCount.mockResolvedValue(1)

    const res = await LIST_GET(
      jsonRequest('/v1/memories?recorded_from=2026-05-01&recorded_before=2026-06-01', 'GET'),
    )

    expect(res.status).toBe(200)
    const range = {
      gte: new Date('2026-05-01T00:00:00.000Z'),
      lt: new Date('2026-06-01T00:00:00.000Z'),
    }
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, deletedAt: null, recordedAt: range },
      }),
    )
    expect(mocks.memoryCount).toHaveBeenCalledWith({
      where: { userId: USER_ID, deletedAt: null, recordedAt: range },
    })
  })

  it('keeps cursor pagination within the same owner and month range', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue({ id: MEMORY_ID })
    mocks.memoryFindMany.mockResolvedValue([])
    const cursor = encodeCursor(MEMORY_ID)

    const res = await LIST_GET(
      jsonRequest(
        `/v1/memories?recorded_from=2026-05-01&recorded_before=2026-06-01&cursor=${cursor}`,
        'GET',
      ),
    )

    expect(res.status).toBe(200)
    expect(mocks.memoryFindFirst).toHaveBeenCalledWith({
      where: {
        id: MEMORY_ID,
        userId: USER_ID,
        deletedAt: null,
        recordedAt: {
          gte: new Date('2026-05-01T00:00:00.000Z'),
          lt: new Date('2026-06-01T00:00:00.000Z'),
        },
      },
      select: { id: true },
    })
    expect(mocks.memoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: MEMORY_ID }, skip: 1 }),
    )
  })

  it('rejects a cursor from another owner or month before listing memories', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    const cursor = encodeCursor('00000000-0000-4000-8000-000000000099')

    const res = await LIST_GET(
      jsonRequest(
        `/v1/memories?recorded_from=2026-05-01&recorded_before=2026-06-01&cursor=${cursor}`,
        'GET',
      ),
    )
    const body = (await res.json()) as {
      reason: string
      errors: Array<{ reason: string }>
    }

    expect(res.status).toBe(422)
    expect(body.reason).toBe('validation_error')
    expect(body.errors[0]?.reason).toBe('cursor_out_of_scope')
    expect(mocks.memoryFindMany).not.toHaveBeenCalled()
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

  it('returns 422 when Idempotency-Key is missing', async () => {
    authed()
    const res = await LIST_POST(
      jsonRequest('/v1/memories', 'POST', validBody, { 'Idempotency-Key': '' }),
    )

    expect(res.status).toBe(422)
    const body = (await res.json()) as {
      errors: Array<{ path: string; reason: string }>
    }
    expect(body.errors).toContainEqual({
      path: 'header.Idempotency-Key',
      reason: 'required',
      message: 'Idempotency-Key ヘッダーが必要です',
    })
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
    expect(mocks.txMemoryCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: IDEMPOTENCY_KEY }),
      }),
    )
    expect(mocks.txImageUpdateMany).toHaveBeenCalledWith({
      where: {
        id: IMAGE_ID,
        userId: USER_ID,
        memoryId: null,
        deletedAt: null,
      },
      data: { memoryId: MEMORY_ID, memoryPosition: 0 },
    })
  })

  it('rolls back with 422 when an image becomes linked during creation', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([{ id: IMAGE_ID, userId: USER_ID, memoryId: null }])
    mocks.txMemoryCreate.mockResolvedValue({ id: MEMORY_ID })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 0 })

    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))

    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({
      reason: 'validation_error',
      errors: [{ path: 'body.image_ids', reason: 'already_linked' }],
    })
    expect(mocks.txMemoryFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('rolls back the whole transaction when one of multiple images cannot be linked', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([
      { id: IMAGE_ID, userId: USER_ID, memoryId: null },
      { id: IMAGE_ID_2, userId: USER_ID, memoryId: null },
    ])
    mocks.txMemoryCreate.mockResolvedValue({ id: MEMORY_ID })
    mocks.txImageUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })

    const res = await LIST_POST(
      jsonRequest('/v1/memories', 'POST', {
        ...validBody,
        image_ids: [IMAGE_ID, IMAGE_ID_2],
      }),
    )

    expect(res.status).toBe(422)
    expect(mocks.txImageUpdateMany).toHaveBeenCalledTimes(2)
    expect(mocks.txMemoryFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('returns the existing Memory for the same owner, key and content', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)

    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: MEMORY_ID, image_ids: [IMAGE_ID] })
    expect(mocks.childFindFirst).not.toHaveBeenCalled()
    expect(mocks.txMemoryCreate).not.toHaveBeenCalled()
  })

  it('compares multi-image retries using the persisted request display order', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue({
      ...memoryRow,
      images: [
        {
          id: IMAGE_ID_2,
          createdAt: new Date('2026-05-23T09:00:00Z'),
          memoryPosition: 1,
          storageKey: 'uploads/abc/202605/img-2.jpg',
        },
        {
          id: IMAGE_ID,
          createdAt: new Date('2026-05-23T10:00:00Z'),
          memoryPosition: 0,
          storageKey: 'uploads/abc/202605/img.jpg',
        },
      ],
    })

    const res = await LIST_POST(
      jsonRequest('/v1/memories', 'POST', {
        ...validBody,
        image_ids: [IMAGE_ID, IMAGE_ID_2],
      }),
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ image_ids: [IMAGE_ID, IMAGE_ID_2] })
    expect(mocks.txMemoryCreate).not.toHaveBeenCalled()
  })

  it('returns stable 409 when the same key is reused with different content', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)

    const res = await LIST_POST(
      jsonRequest('/v1/memories', 'POST', { ...validBody, title: '別の合成タイトル' }),
    )

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: 'memory_idempotency_conflict' })
    expect(mocks.txMemoryCreate).not.toHaveBeenCalled()
  })

  it('scopes an idempotency key to the current owner', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([{ id: IMAGE_ID, userId: USER_ID, memoryId: null }])
    mocks.txMemoryCreate.mockResolvedValue({ id: MEMORY_ID })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txMemoryFindUniqueOrThrow.mockResolvedValue(memoryRow)

    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))

    expect(res.status).toBe(201)
    expect(mocks.memoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: USER_ID, idempotencyKey: IDEMPOTENCY_KEY },
      }),
    )
  })

  it('converges on an existing Memory when concurrent creates race', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(memoryRow)
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID, userId: USER_ID })
    mocks.imageFindMany.mockResolvedValue([{ id: IMAGE_ID, userId: USER_ID, memoryId: null }])
    mocks.txMemoryCreate.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('synthetic idempotency race', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    )

    const res = await LIST_POST(jsonRequest('/v1/memories', 'POST', validBody))

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: MEMORY_ID })
    expect(mocks.memoryFindFirst).toHaveBeenCalledTimes(2)
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

  it('uses the same 404 for a memory outside the owner and active scope', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    const res = await DETAIL_GET(jsonRequest(`/v1/memories/${MEMORY_ID}`, 'GET'), ctx(MEMORY_ID))
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      reason: 'not_found',
      detail: '記録が見つかりません',
    })
    expect(mocks.memoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMORY_ID, userId: USER_ID, deletedAt: null },
      }),
    )
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
    mocks.txMemoryUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txMemoryFindUniqueOrThrow.mockResolvedValue({ ...memoryRow, title: 'なおした' })
    const res = await DETAIL_PUT(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'PUT', { title: 'なおした' }),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string }
    expect(body.title).toBe('なおした')
    expect(mocks.txMemoryUpdateMany).toHaveBeenCalledWith({
      where: {
        id: MEMORY_ID,
        userId: USER_ID,
        deletedAt: null,
      },
      data: { title: 'なおした' },
    })
  })

  it('returns 404 without reading an updated row when deletion wins the race', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.txMemoryUpdateMany.mockResolvedValue({ count: 0 })
    const res = await DETAIL_PUT(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'PUT', { weather: 'くもり' }),
      ctx(MEMORY_ID),
    )

    expect(res.status).toBe(404)
    expect(mocks.txMemoryFindUniqueOrThrow).not.toHaveBeenCalled()
  })

  it('returns the same 404 for a foreign, deleted, or missing update without logging fields', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = await DETAIL_PUT(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'PUT', {
        title: '非公開の合成タイトル',
        body: '非公開の合成本文',
        weather: '合成の天気',
      }),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      reason: 'not_found',
      detail: '記録が見つかりません',
    })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    expect(consoleInfo).not.toHaveBeenCalled()
    consoleError.mockRestore()
    consoleWarn.mockRestore()
    consoleInfo.mockRestore()
  })
})

describe('DELETE /v1/memories/{memoryId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ memoryId: id }) })

  it('returns 204 on success', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.txImageFindMany.mockResolvedValue([{ id: IMAGE_ID }])
    mocks.txMemoryUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 1 })
    const res = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(204)
    expect(mocks.advisoryLock).toHaveBeenCalledTimes(1)
    expect(mocks.txMemoryUpdateMany).toHaveBeenCalledWith({
      where: {
        id: MEMORY_ID,
        userId: USER_ID,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mocks.txImageUpdateMany).toHaveBeenCalledWith({
      where: {
        memoryId: MEMORY_ID,
        userId: USER_ID,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    })
    expect(mocks.txImageUpdateMany.mock.calls[0]?.[0].data.deletedAt).toBe(
      mocks.txMemoryUpdateMany.mock.calls[0]?.[0].data.deletedAt,
    )
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5_000,
      timeout: 35_000,
    })
  })

  it('returns the same 404 for a foreign, deleted, or missing memory', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(null)
    const res = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({
      reason: 'not_found',
      detail: '記録が見つかりません',
    })
    expect(mocks.txMemoryUpdateMany).not.toHaveBeenCalled()
    expect(mocks.txImageUpdateMany).not.toHaveBeenCalled()
  })

  it('does not overwrite deletion timestamps when concurrent deletion already won', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.txImageFindMany.mockResolvedValue([{ id: IMAGE_ID }])
    mocks.txMemoryUpdateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 1 })

    const first = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )
    const second = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )

    expect(first.status).toBe(204)
    expect(second.status).toBe(204)
    expect(mocks.txImageUpdateMany).toHaveBeenCalledTimes(1)
  })

  it('sets the shared deletion timestamp only after acquiring image locks', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-29T00:00:00.000Z'))
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.txImageFindMany.mockResolvedValue([{ id: IMAGE_ID }])
    mocks.advisoryLock.mockImplementation(async () => {
      vi.setSystemTime(new Date('2026-07-29T00:00:05.000Z'))
      return 1
    })
    mocks.txMemoryUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 1 })

    const response = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )

    expect(response.status).toBe(204)
    expect(mocks.txMemoryUpdateMany.mock.calls[0]?.[0].data.deletedAt).toEqual(
      new Date('2026-07-29T00:00:05.000Z'),
    )
  })

  it('does not lock or modify unrelated images when the memory has no active images', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    mocks.txImageFindMany.mockResolvedValue([])
    mocks.txMemoryUpdateMany.mockResolvedValue({ count: 1 })
    mocks.txImageUpdateMany.mockResolvedValue({ count: 0 })

    const response = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )

    expect(response.status).toBe(204)
    expect(mocks.advisoryLock).not.toHaveBeenCalled()
    expect(mocks.txImageUpdateMany).toHaveBeenCalledWith({
      where: {
        memoryId: MEMORY_ID,
        userId: USER_ID,
        deletedAt: null,
      },
      data: { deletedAt: expect.any(Date) },
    })
  })

  it('returns 500 and rolls back state in the transaction-behavior harness', async () => {
    authed()
    mocks.memoryFindFirst.mockResolvedValue(memoryRow)
    let memoryDeletedAt: Date | null = null
    let imageDeletedAt: Date | null = null
    mocks.transaction.mockImplementationOnce(
      async (
        fn: (transaction: {
          $executeRaw: typeof mocks.advisoryLock
          memory: { updateMany: typeof mocks.txMemoryUpdateMany }
          image: {
            findMany: typeof mocks.txImageFindMany
            updateMany: typeof mocks.txImageUpdateMany
          }
        }) => Promise<unknown>,
      ) => {
        const snapshot = { memoryDeletedAt, imageDeletedAt }
        try {
          return await fn({
            $executeRaw: mocks.advisoryLock,
            memory: {
              updateMany: vi.fn(async ({ data }: { data: { deletedAt: Date } }) => {
                memoryDeletedAt = data.deletedAt
                return { count: 1 }
              }),
            },
            image: {
              findMany: vi.fn(async () => [{ id: IMAGE_ID }]),
              updateMany: vi.fn(async ({ data }: { data: { deletedAt: Date } }) => {
                imageDeletedAt = data.deletedAt
                throw new Error('synthetic image update failure')
              }),
            },
          })
        } catch (error) {
          memoryDeletedAt = snapshot.memoryDeletedAt
          imageDeletedAt = snapshot.imageDeletedAt
          throw error
        }
      },
    )
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await DETAIL_DELETE(
      jsonRequest(`/v1/memories/${MEMORY_ID}`, 'DELETE'),
      ctx(MEMORY_ID),
    )

    expect(response.status).toBe(500)
    expect(memoryDeletedAt).toBeNull()
    expect(imageDeletedAt).toBeNull()
    errorSpy.mockRestore()
  })
})
