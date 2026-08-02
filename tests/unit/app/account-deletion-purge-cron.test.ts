import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  inspect: vi.fn(),
  process: vi.fn(),
}))

vi.mock('@/features/account-deletion/server/physical-purge', () => ({
  inspectAccountPhysicalPurge: mocks.inspect,
  processAccountPhysicalPurges: mocks.process,
}))

import { GET } from '@/app/internal/account-deletion-purges/route'

const originalSecret = process.env.CRON_SECRET
const originalApply = process.env.ACCOUNT_PHYSICAL_PURGE_APPLY

afterEach(() => {
  vi.clearAllMocks()
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalApply === undefined) delete process.env.ACCOUNT_PHYSICAL_PURGE_APPLY
  else process.env.ACCOUNT_PHYSICAL_PURGE_APPLY = originalApply
})

describe('GET /internal/account-deletion-purges', () => {
  it('returns 404 without the configured secret', async () => {
    delete process.env.CRON_SECRET

    const response = await GET(new Request('http://localhost/internal/account-deletion-purges'))

    expect(response.status).toBe(404)
    expect(mocks.inspect).not.toHaveBeenCalled()
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it('runs a read-only dry-run for an authorized operator', async () => {
    process.env.CRON_SECRET = 'synthetic-cron-secret'
    mocks.inspect.mockResolvedValue({
      eligibleAccounts: 1,
      leasedAccounts: 0,
      imageRows: 2,
      dbExpectedObjects: 6,
      listedStorageObjects: 7,
      storageListingFailures: 0,
      failedAccounts: 0,
    })

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-purges?dry_run=1', {
        headers: { Authorization: 'Bearer synthetic-cron-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.inspect).toHaveBeenCalledOnce()
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it('defaults an authorized scheduled request to read-only inspection', async () => {
    process.env.CRON_SECRET = 'synthetic-cron-secret'
    delete process.env.ACCOUNT_PHYSICAL_PURGE_APPLY
    mocks.inspect.mockResolvedValue({ eligibleAccounts: 1 })

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-purges', {
        headers: { Authorization: 'Bearer synthetic-cron-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.inspect).toHaveBeenCalledOnce()
    expect(mocks.process).not.toHaveBeenCalled()
  })

  it('runs the worker only when server-side apply is confirmed', async () => {
    process.env.CRON_SECRET = 'synthetic-cron-secret'
    process.env.ACCOUNT_PHYSICAL_PURGE_APPLY = 'confirmed'
    mocks.process.mockResolvedValue({ claimed: 1, purged: 1, failed: 0 })

    const response = await GET(
      new Request('http://localhost/internal/account-deletion-purges', {
        headers: { Authorization: 'Bearer synthetic-cron-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.process).toHaveBeenCalledOnce()
    expect(mocks.inspect).not.toHaveBeenCalled()
  })
})
