import { afterEach, describe, expect, it, vi } from 'vitest'

// Supabase / Prisma を vi.mock で差し替える。
// 重要: 各テストの直前に getUser / upsert の挙動を差し替えるため、
// vi.hoisted で参照を保持する。

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: {
      upsert: mocks.upsert,
    },
  },
}))

import { getCurrentUser, requireOwnership, requireUser } from '@/server/auth/current-user'
import { ApiProblemError } from '@/lib/api/error'

afterEach(() => {
  vi.clearAllMocks()
})

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'

const supabaseUser = {
  id: USER_ID,
  email: 'parent@example.com',
}

const profileRow = {
  id: USER_ID,
  displayName: null,
  aiConsentAt: null,
  createdAt: new Date('2026-05-14T09:30:00Z'),
  updatedAt: new Date('2026-05-14T09:30:00Z'),
}

describe('getCurrentUser', () => {
  it('returns null when no Supabase session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    expect(await getCurrentUser()).toBeNull()
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('returns AppUser shape on hit and upserts profile lazily', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.upsert.mockResolvedValue(profileRow)

    const user = await getCurrentUser()
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { id: USER_ID },
      create: { id: USER_ID },
      update: {},
    })
    expect(user).toEqual({
      id: USER_ID,
      email: 'parent@example.com',
      displayName: null,
      aiConsentAt: null,
      createdAt: '2026-05-14T09:30:00.000Z',
    })
  })

  it('serializes aiConsentAt when present', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.upsert.mockResolvedValue({
      ...profileRow,
      aiConsentAt: new Date('2026-06-01T00:00:00Z'),
    })
    const user = await getCurrentUser()
    expect(user?.aiConsentAt).toBe('2026-06-01T00:00:00.000Z')
  })
})

describe('requireUser', () => {
  it('throws ApiProblemError with reason=unauthorized when no session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    await expect(requireUser()).rejects.toBeInstanceOf(ApiProblemError)
    await expect(requireUser()).rejects.toMatchObject({
      reason: 'unauthorized',
      status: 401,
    })
  })

  it('returns AppUser when session exists', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: supabaseUser } })
    mocks.upsert.mockResolvedValue(profileRow)
    const user = await requireUser()
    expect(user.id).toBe(USER_ID)
  })
})

describe('requireOwnership', () => {
  it('is a no-op when ids match', () => {
    expect(() => requireOwnership(USER_ID, USER_ID)).not.toThrow()
  })

  it('throws ApiProblemError with reason=forbidden on mismatch', () => {
    let caught: unknown
    try {
      requireOwnership(USER_ID, 'other-user-id')
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(ApiProblemError)
    expect((caught as ApiProblemError).reason).toBe('forbidden')
    expect((caught as ApiProblemError).status).toBe(403)
  })
})
