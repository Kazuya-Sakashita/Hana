import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ runRepairs: vi.fn() }))

vi.mock('@/features/uploads/server/image-variant-repair', () => ({
  runImageVariantRepairs: mocks.runRepairs,
  VariantRepairError: class VariantRepairError extends Error {},
}))

vi.mock('@/server/db/prisma', () => ({ prisma: { marker: 'prisma' } }))

import { POST } from '@/app/internal/image-variant-repairs/route'

const originalSecret = process.env.CRON_SECRET
const originalApply = process.env.IMAGE_VARIANT_REPAIR_APPLY

afterEach(() => {
  vi.clearAllMocks()
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalApply === undefined) delete process.env.IMAGE_VARIANT_REPAIR_APPLY
  else process.env.IMAGE_VARIANT_REPAIR_APPLY = originalApply
})

function request(secret?: string) {
  return new Request('http://localhost/internal/image-variant-repairs', {
    method: 'POST',
    ...(secret ? { headers: { Authorization: `Bearer ${secret}` } } : {}),
  })
}

describe('POST /internal/image-variant-repairs', () => {
  it('returns 404 without a configured secret', async () => {
    delete process.env.CRON_SECRET

    const response = await POST(request())

    expect(response.status).toBe(404)
    expect(mocks.runRepairs).not.toHaveBeenCalled()
  })

  it('returns 404 for a mismatched secret', async () => {
    process.env.CRON_SECRET = 'expected-secret'

    const response = await POST(request('wrong-secret'))

    expect(response.status).toBe(404)
    expect(mocks.runRepairs).not.toHaveBeenCalled()
  })

  it('defaults to dry-run and returns counts only', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    delete process.env.IMAGE_VARIANT_REPAIR_APPLY
    mocks.runRepairs.mockResolvedValue({
      mode: 'dry-run',
      eligibleTotal: 2,
      deadLetterTotal: 0,
      scanned: 2,
      repaired: 0,
      alreadyReady: 0,
      protected: 0,
      retried: 0,
      deadLetter: 0,
    })

    const response = await POST(request('expected-secret'))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(mocks.runRepairs).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ apply: false, limit: 1, workTimeoutMs: 30_000 }),
    )
    expect(body).not.toHaveProperty('storageKey')
    expect(body).not.toHaveProperty('url')
  })

  it('applies repairs only for the exact confirmation value', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    process.env.IMAGE_VARIANT_REPAIR_APPLY = 'confirmed'
    mocks.runRepairs.mockResolvedValue({ mode: 'apply', scanned: 0 })

    const response = await POST(request('expected-secret'))

    expect(response.status).toBe(200)
    expect(mocks.runRepairs).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ apply: true, limit: 1, workTimeoutMs: 30_000 }),
    )
  })
})
