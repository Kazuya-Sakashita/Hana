import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => ({
    auth: { signOut: mocks.signOut },
  }),
}))

import { POST } from '@/app/sign-out/route'

afterEach(() => vi.clearAllMocks())

describe('POST /sign-out', () => {
  it('returns 204 only after global sign-out succeeds', async () => {
    mocks.signOut.mockResolvedValue({ error: null })
    const response = await POST()
    expect(response.status).toBe(204)
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('returns fixed ProblemDetails when Supabase rejects sign-out', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('synthetic failure') })
    const response = await POST()
    expect(response.status).toBe(503)
    expect(response.headers.get('Content-Type')).toBe('application/problem+json')
    expect(await response.json()).toMatchObject({
      status: 503,
      reason: 'sign_out_failed',
    })
  })

  it('returns a safe failure when the Supabase call throws', async () => {
    mocks.signOut.mockRejectedValue(new Error('synthetic network failure'))
    const response = await POST()
    expect(response.status).toBe(503)
    expect(await response.json()).toMatchObject({
      reason: 'sign_out_failed',
    })
  })
})
