import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  processRevocations: vi.fn(),
}))

vi.mock('@/features/account-deletion/server/auth-revocation', () => ({
  processAccountDeletionAuthRevocations: mocks.processRevocations,
}))

import { GET } from '@/app/internal/account-deletion-revocations/route'

const originalSecret = process.env.CRON_SECRET

afterEach(() => {
  vi.clearAllMocks()
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
})

describe('GET /internal/account-deletion-revocations', () => {
  it('returns 404 and does not run when CRON_SECRET is missing', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-revocations'),
    )

    expect(response.status).toBe(404)
    expect(mocks.processRevocations).not.toHaveBeenCalled()
  })

  it('returns 404 and does not run for a mismatched secret', async () => {
    process.env.CRON_SECRET = 'expected-secret'

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-revocations', {
        headers: { Authorization: 'Bearer wrong-secret' },
      }),
    )

    expect(response.status).toBe(404)
    expect(mocks.processRevocations).not.toHaveBeenCalled()
  })

  it('runs only with the configured bearer secret', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    mocks.processRevocations.mockResolvedValue({ claimed: 1, succeeded: 1, failed: 0 })

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-revocations', {
        headers: { Authorization: 'Bearer expected-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ claimed: 1, succeeded: 1, failed: 0 })
    expect(mocks.processRevocations).toHaveBeenCalledOnce()
  })
})
