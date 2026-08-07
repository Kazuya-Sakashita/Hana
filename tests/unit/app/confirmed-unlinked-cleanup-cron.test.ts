import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ runCleanup: vi.fn() }))

vi.mock('@/features/uploads/server/confirmed-unlinked-cleanup', () => ({
  CONFIRMED_UNLINKED_CLEANUP_MINIMUM_ITEM_BUDGET_MS: 22_000,
  CONFIRMED_UNLINKED_CLEANUP_ROUTE_BUDGET_MS: 25_000,
  runConfirmedUnlinkedCleanup: mocks.runCleanup,
}))
vi.mock('@/server/db/prisma', () => ({ prisma: { marker: 'prisma' } }))

import { POST } from '@/app/internal/confirmed-unlinked-image-cleanups/route'

const originalSecret = process.env.CRON_SECRET
const originalApply = process.env.CONFIRMED_UNLINKED_CLEANUP_APPLY
const workflow = readFileSync(
  new URL('../../../.github/workflows/confirmed-unlinked-image-cleanup.yml', import.meta.url),
  'utf8',
)

afterEach(() => {
  vi.clearAllMocks()
  if (originalSecret === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = originalSecret
  if (originalApply === undefined) delete process.env.CONFIRMED_UNLINKED_CLEANUP_APPLY
  else process.env.CONFIRMED_UNLINKED_CLEANUP_APPLY = originalApply
})

function request(secret?: string) {
  return new Request('http://localhost/internal/confirmed-unlinked-image-cleanups', {
    method: 'POST',
    ...(secret ? { headers: { Authorization: `Bearer ${secret}` } } : {}),
  })
}

describe('POST /internal/confirmed-unlinked-image-cleanups', () => {
  it('runs every fifteen minutes without overlapping invocations', () => {
    expect(workflow).toContain("cron: '3,18,33,48 * * * *'")
    expect(workflow).toContain('cancel-in-progress: false')
  })

  it('returns 404 and does no work without the exact secret', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    const response = await POST(request('wrong-secret'))
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({ status: 404, reason: 'not_found' })
    expect(mocks.runCleanup).not.toHaveBeenCalled()
  })

  it('returns Problem Details when cleanup fails unexpectedly', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    mocks.runCleanup.mockRejectedValue(new Error('synthetic failure'))

    const response = await POST(request('expected-secret'))

    expect(response.status).toBe(500)
    expect(response.headers.get('content-type')).toBe('application/problem+json')
    await expect(response.json()).resolves.toMatchObject({
      status: 500,
      reason: 'internal_server_error',
    })
  })

  it('defaults to dry-run and returns count-only output', async () => {
    process.env.CRON_SECRET = 'expected-secret'
    delete process.env.CONFIRMED_UNLINKED_CLEANUP_APPLY
    mocks.runCleanup.mockResolvedValue({
      mode: 'dry-run',
      eligibleTotal: 2,
      deadLetterTotal: 1,
      scanned: 2,
      deleted: 0,
      protected: 0,
      retried: 0,
      deadLetter: 0,
      failed: 0,
      pending: 2,
      failureReasons: {
        storage_unavailable: 0,
        finalize_failed: 0,
        processing_timeout: 0,
        claim_failed: 0,
        retry_state_unavailable: 0,
      },
    })

    const response = await POST(request('expected-secret'))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(mocks.runCleanup).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        apply: false,
        limit: 3,
        deadlineAt: expect.any(Number),
        minimumItemBudgetMs: 22_000,
      }),
    )
    expect(body).not.toHaveProperty('storageKey')
    expect(body).not.toHaveProperty('url')
    expect(body).not.toHaveProperty('imageId')
    expect(body.pending).toBe(2)
    expect(Object.keys(body).sort()).toEqual([
      'deadLetter',
      'deadLetterTotal',
      'deleted',
      'eligibleTotal',
      'failed',
      'failureReasons',
      'mode',
      'pending',
      'protected',
      'retried',
      'scanned',
    ])
    expect(JSON.stringify(body)).not.toContain('uploads/')
  })
})
