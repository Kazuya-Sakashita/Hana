import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: { profile: { upsert: mocks.upsert } },
}))

import { GET } from '@/app/v1/me/route'

afterEach(() => vi.clearAllMocks())

describe('GET /v1/me', () => {
  it('returns 401 + ProblemDetails when not authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } })
    const res = await GET()
    expect(res.status).toBe(401)
    expect(res.headers.get('Content-Type')).toBe('application/problem+json')
    const body = (await res.json()) as { reason: string }
    expect(body.reason).toBe('unauthorized')
  })

  it('returns 200 + AppUser when authenticated', async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: '8f7e6d5c-4b3a-4291-8765-0123456789ab', email: 'parent@example.com' } },
    })
    mocks.upsert.mockResolvedValue({
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      displayName: null,
      aiConsentAt: null,
      createdAt: new Date('2026-05-14T09:30:00Z'),
      updatedAt: new Date('2026-05-14T09:30:00Z'),
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
      email: 'parent@example.com',
      display_name: null,
      ai_consent_at: null,
      created_at: '2026-05-14T09:30:00.000Z',
    })
  })
})
