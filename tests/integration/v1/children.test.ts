import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertOpenApiResponse } from '../../helpers/openapi-response-contract'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  profileFindUnique: vi.fn(),
  profileCreate: vi.fn(),
  childFindFirst: vi.fn(),
  childFindMany: vi.fn(),
  childCreate: vi.fn(),
  childUpdate: vi.fn(),
  withChildOwnerScope: vi.fn(),
  childAccessStatus: vi.fn(),
}))

const scopedTransaction = {
  child: {
    findFirst: mocks.childFindFirst,
    findMany: mocks.childFindMany,
    create: mocks.childCreate,
    update: mocks.childUpdate,
  },
}

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.profileFindUnique, create: mocks.profileCreate },
    child: {
      findFirst: mocks.childFindFirst,
      findMany: mocks.childFindMany,
      create: mocks.childCreate,
      update: mocks.childUpdate,
    },
  },
}))

vi.mock('@/server/db/child-owner-scope', () => ({
  withChildOwnerScope: mocks.withChildOwnerScope,
  childAccessStatus: mocks.childAccessStatus,
}))

import { GET, POST } from '@/app/v1/children/route'
import { GET as GET_BY_ID, PUT } from '@/app/v1/children/[childId]/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const CHILD_ID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'

const supabaseUser = { id: USER_ID, email: 'parent@example.com' }
const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}
const childRow = {
  id: CHILD_ID,
  userId: USER_ID,
  name: 'はると',
  birthdate: new Date('2026-01-13T00:00:00Z'),
  avatarUrl: null,
  createdAt: new Date('2026-05-23T01:30:00Z'),
  updatedAt: new Date('2026-05-23T01:30:00Z'),
  deletedAt: null,
}

function authed() {
  mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
  mocks.profileFindUnique.mockResolvedValue(profileRow)
  mocks.withChildOwnerScope.mockImplementation(
    async (
      _userId: string,
      operation: (transaction: typeof scopedTransaction) => Promise<unknown>,
    ) => operation(scopedTransaction),
  )
  mocks.childAccessStatus.mockResolvedValue('missing')
}

function unauthed() {
  mocks.getUser.mockResolvedValue({ data: { user: null } })
}

function jsonRequest(method: string, body: unknown) {
  return new Request('http://localhost:3000/v1/children', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

afterEach(() => vi.clearAllMocks())

describe('GET /v1/children', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    await assertOpenApiResponse({ method: 'GET', route: '/children', response: res })
  })

  it('returns 200 with empty data when no children', async () => {
    authed()
    mocks.childFindMany.mockResolvedValue([])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ data: [] })
  })

  it('returns 200 with one child', async () => {
    authed()
    mocks.childFindMany.mockResolvedValue([childRow])
    const res = await GET()
    expect(res.status).toBe(200)
    await assertOpenApiResponse({ method: 'GET', route: '/children', response: res })
    const body = (await res.json()) as { data: Array<Record<string, unknown>> }
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      id: CHILD_ID,
      name: 'はると',
      birthdate: '2026-01-13',
      avatar_url: null,
    })
  })
})

describe('POST /v1/children', () => {
  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await POST(jsonRequest('POST', { name: 'はると', birthdate: '2026-01-13' }))
    expect(res.status).toBe(401)
  })

  it('returns 422 on invalid body', async () => {
    authed()
    const res = await POST(jsonRequest('POST', { name: '', birthdate: 'not-a-date' }))
    expect(res.status).toBe(422)
    await assertOpenApiResponse({ method: 'POST', route: '/children', response: res })
    const body = (await res.json()) as { reason: string; errors: Array<{ path: string }> }
    expect(body.reason).toBe('validation_error')
    const paths = body.errors.map((e) => e.path)
    expect(paths).toContain('body.name')
    expect(paths).toContain('body.birthdate')
  })

  it('returns 201 with created child shape', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(null)
    mocks.childCreate.mockResolvedValue(childRow)

    const res = await POST(
      jsonRequest('POST', { name: 'はると', birthdate: '2026-01-13', avatar_url: null }),
    )
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      id: CHILD_ID,
      name: 'はると',
      birthdate: '2026-01-13',
      avatar_url: null,
      created_at: '2026-05-23T01:30:00.000Z',
      updated_at: '2026-05-23T01:30:00.000Z',
    })
    expect(mocks.childCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: USER_ID, name: 'はると' }),
      }),
    )
  })

  it('returns 409 child_limit_reached when user already has a child', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue({ id: CHILD_ID })

    const res = await POST(jsonRequest('POST', { name: 'はると', birthdate: '2026-01-13' }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('child_limit_reached')
    expect(mocks.childCreate).not.toHaveBeenCalled()
  })
})

describe('GET /v1/children/{childId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ childId: id }) })

  it('returns 401 when unauthenticated', async () => {
    unauthed()
    const res = await GET_BY_ID(new Request('http://localhost/'), ctx(CHILD_ID))
    expect(res.status).toBe(401)
  })

  it('returns 404 for invalid UUID', async () => {
    authed()
    const res = await GET_BY_ID(new Request('http://localhost/'), ctx('not-a-uuid'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when child does not exist', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(null)
    const res = await GET_BY_ID(new Request('http://localhost/'), ctx(CHILD_ID))
    expect(res.status).toBe(404)
    await assertOpenApiResponse({
      method: 'GET',
      route: '/children/{childId}',
      response: res,
    })
  })

  it('returns 403 when child belongs to another user', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(null)
    mocks.childAccessStatus.mockResolvedValue('foreign')
    const res = await GET_BY_ID(new Request('http://localhost/'), ctx(CHILD_ID))
    expect(res.status).toBe(403)
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('forbidden')
  })

  it('returns 200 with child for owner', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(childRow)
    const res = await GET_BY_ID(new Request('http://localhost/'), ctx(CHILD_ID))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ id: CHILD_ID, name: 'はると' })
  })
})

describe('PUT /v1/children/{childId}', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ childId: id }) })

  it('returns 403 when child belongs to another user', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(null)
    mocks.childAccessStatus.mockResolvedValue('foreign')
    const res = await PUT(
      new Request('http://localhost/', {
        method: 'PUT',
        body: JSON.stringify({ name: 'changed' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      ctx(CHILD_ID),
    )
    expect(res.status).toBe(403)
    expect(mocks.childUpdate).not.toHaveBeenCalled()
  })

  it.each([
    [{ name: '   ' }, 'body.name'],
    [{ birthdate: '2026-02-31' }, 'body.birthdate'],
    [{ birthdate: '2999-01-01' }, 'body.birthdate'],
  ])('returns 422 without updating for invalid profile input', async (input, path) => {
    authed()
    mocks.childFindFirst.mockResolvedValue(childRow)
    const res = await PUT(
      new Request('http://localhost/', {
        method: 'PUT',
        body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' },
      }),
      ctx(CHILD_ID),
    )
    expect(res.status).toBe(422)
    const body = (await res.json()) as { reason: string; errors: Array<{ path: string }> }
    expect(body.reason).toBe('validation_error')
    expect(body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path })]))
    expect(mocks.childUpdate).not.toHaveBeenCalled()
  })

  it('returns 200 with updated child when only name is changed', async () => {
    authed()
    mocks.childFindFirst.mockResolvedValue(childRow)
    mocks.childUpdate.mockResolvedValue({ ...childRow, name: 'ゆいな' })

    const res = await PUT(
      new Request('http://localhost/', {
        method: 'PUT',
        body: JSON.stringify({ name: 'ゆいな' }),
        headers: { 'Content-Type': 'application/json' },
      }),
      ctx(CHILD_ID),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { name: string }
    expect(body.name).toBe('ゆいな')
    expect(mocks.childUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: CHILD_ID },
        data: { name: 'ゆいな' },
      }),
    )
  })
})
