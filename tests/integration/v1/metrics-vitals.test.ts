import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    profile: { findUnique: mocks.findUnique, create: mocks.create },
  },
}))

import { POST } from '@/app/v1/metrics/vitals/route'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'

function jsonRequest(body: unknown) {
  return new Request('http://localhost:3000/v1/metrics/vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const validPayload = {
  name: 'LCP',
  value: 2400,
  id: 'v1-1717068000000-12345',
  navigationType: 'navigate',
  route: '/album',
}

beforeEach(() => {
  // 匿名アクセスを既定とする
  mocks.getUser.mockResolvedValue({ data: { user: null } })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('POST /v1/metrics/vitals', () => {
  it('accepts anonymous payload and returns 204', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await POST(jsonRequest(validPayload))
    expect(res.status).toBe(204)
    expect(logSpy).toHaveBeenCalledTimes(1)
    const logged = logSpy.mock.calls[0]?.[0]
    expect(typeof logged).toBe('string')
    const parsed = JSON.parse(logged as string)
    expect(parsed.operation).toBe('web-vitals')
    expect(parsed.name).toBe('LCP')
    expect(parsed.value).toBe(2400)
    expect(parsed.route).toBe('/album')
    expect(parsed.userIdHash).toBeNull() // 匿名
    logSpy.mockRestore()
  })

  it('includes userIdHash (hashed) when authenticated', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID, email: 'a@b.c' } } })
    mocks.findUnique.mockResolvedValue({
      id: USER_ID,
      displayName: null,
      aiConsentAt: null,
      createdAt: new Date('2026-05-14T09:30:00Z'),
      updatedAt: new Date('2026-05-14T09:30:00Z'),
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await POST(jsonRequest(validPayload))
    expect(res.status).toBe(204)
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(parsed.userIdHash).toMatch(/^[0-9a-f]{16}$/) // SHA256 先頭 16 文字
    expect(parsed.userIdHash).not.toBe(USER_ID) // 生の user id は絶対に出ない
    logSpy.mockRestore()
  })

  it('rejects invalid metric name with 422', async () => {
    const res = await POST(jsonRequest({ ...validPayload, name: 'NOPE' }))
    expect(res.status).toBe(422)
  })

  it('rejects negative value with 422', async () => {
    const res = await POST(jsonRequest({ ...validPayload, value: -5 }))
    expect(res.status).toBe(422)
  })

  it('rejects missing id with 422', async () => {
    const { id: _id, ...rest } = validPayload
    void _id
    const res = await POST(jsonRequest(rest))
    expect(res.status).toBe(422)
  })

  it('rejects unknown navigationType with 422', async () => {
    const res = await POST(jsonRequest({ ...validPayload, navigationType: 'teleport' }))
    expect(res.status).toBe(422)
  })

  it('accepts null navigationType', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const res = await POST(jsonRequest({ ...validPayload, navigationType: null }))
    expect(res.status).toBe(204)
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(parsed.navigationType).toBeNull()
    logSpy.mockRestore()
  })

  it('does not leak request body / unknown fields into log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await POST(jsonRequest({ ...validPayload, email: 'pii@example.com', secret: '...' }))
    const parsed = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(parsed).not.toHaveProperty('email')
    expect(parsed).not.toHaveProperty('secret')
    logSpy.mockRestore()
  })
})
