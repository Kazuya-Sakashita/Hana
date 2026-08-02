import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ run: vi.fn(), discover: vi.fn() }))

vi.mock('@/features/uploads/server/unconfirmed-upload-cleanup', () => ({
  runUnconfirmedUploadCleanup: mocks.run,
}))
vi.mock('@/features/uploads/server/legacy-upload-discovery', () => ({
  discoverLegacyUnconfirmedUploads: mocks.discover,
}))
vi.mock('@/lib/supabase/admin', () => ({
  createSupabaseAdminClient: () => ({
    storage: { from: () => ({ list: vi.fn(), remove: vi.fn() }) },
  }),
}))
vi.mock('@/server/db/prisma', () => ({ prisma: {} }))

import { POST } from '@/app/internal/unconfirmed-upload-cleanups/route'

const originalSecret = process.env.CRON_SECRET
const originalApply = process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY

afterEach(() => {
  vi.clearAllMocks()
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalApply === undefined) delete process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY
  else process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY = originalApply
})

describe('POST /internal/unconfirmed-upload-cleanups', () => {
  it('returns 404 without exposing whether the cron exists when the secret is missing or wrong', async () => {
    delete process.env.CRON_SECRET
    const missing = await POST(new Request('http://localhost/internal/unconfirmed-upload-cleanups'))
    process.env.CRON_SECRET = 'expected-secret'
    const wrong = await POST(
      new Request('http://localhost/internal/unconfirmed-upload-cleanups', {
        method: 'POST',
        headers: { authorization: 'Bearer wrong-secret' },
      }),
    )

    expect(missing.status).toBe(404)
    expect(wrong.status).toBe(404)
    expect(mocks.run).not.toHaveBeenCalled()
  })

  it('defaults to dry-run even with a valid cron secret', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    delete process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY
    mocks.discover.mockResolvedValue({ legacyScanned: 0, legacyDiscovered: 0, legacyInvalid: 0 })
    mocks.run.mockResolvedValue({ mode: 'dry-run', scanned: 0 })

    const response = await POST(
      new Request('http://localhost/internal/unconfirmed-upload-cleanups', {
        method: 'POST',
        headers: { authorization: 'Bearer expected-secret' },
      }),
    )

    expect(response.status).toBe(200)
    expect(mocks.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ apply: false, limit: 50 }),
    )
  })

  it('enables deletion only with the separate explicit apply confirmation', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY = 'confirmed'
    mocks.discover.mockResolvedValue({ legacyScanned: 0, legacyDiscovered: 0, legacyInvalid: 0 })
    mocks.run.mockResolvedValue({ mode: 'apply', scanned: 0 })

    await POST(
      new Request('http://localhost/internal/unconfirmed-upload-cleanups', {
        method: 'POST',
        headers: { authorization: 'Bearer expected-secret' },
      }),
    )

    expect(mocks.run).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ apply: true }),
    )
  })
})
