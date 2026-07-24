import { afterEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

const mocks = vi.hoisted(() => ({
  waitlistUpsert: vi.fn(),
  waitlistUpdate: vi.fn(),
}))

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    waitlistSignup: {
      upsert: mocks.waitlistUpsert,
      update: mocks.waitlistUpdate,
    },
  },
}))

import { POST } from '@/app/v1/waitlist/route'
import {
  resetWaitlistRateLimitForTests,
  WAITLIST_RETRY_AFTER_SECONDS,
} from '@/features/waitlist/server/rate-limit'

const TEST_MAIL_DOMAIN = ['example', 'test'].join('.')

function testMail(local: string): string {
  return [local, TEST_MAIL_DOMAIN].join('@')
}

function jsonRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost:3000/v1/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  resetWaitlistRateLimitForTests()
})

describe('POST /v1/waitlist', () => {
  it('accepts waitlist signup and does not echo email or identifiers', async () => {
    const normalized = testMail('parent')
    mocks.waitlistUpsert.mockResolvedValue({})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(
      jsonRequest({
        email: `  ${testMail('Parent').replace(TEST_MAIL_DOMAIN, TEST_MAIL_DOMAIN.toUpperCase())} `,
        consent: true,
        source: 'current-lp',
        privacy_policy_version: 'prelaunch-2026-07-25',
      }),
    )

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ status: 'accepted' })
    expect(mocks.waitlistUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
        create: expect.objectContaining({
          email: normalized,
          emailHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          source: 'current-lp',
          privacyPolicyVersion: 'prelaunch-2026-07-25',
        }),
        update: expect.objectContaining({
          email: normalized,
        }),
      }),
    )

    const parsedLog = JSON.parse(logSpy.mock.calls[0]?.[0] as string)
    expect(parsedLog).toMatchObject({
      operation: 'waitlist-signup',
      status: 'accepted',
      source: 'current-lp',
      privacyPolicyVersion: 'prelaunch-2026-07-25',
    })
    expect(parsedLog).not.toHaveProperty('email')
    expect(parsedLog).not.toHaveProperty('emailHash')
    expect(parsedLog).not.toHaveProperty('id')
  })

  it('rejects invalid email with 422 before writing', async () => {
    const res = await POST(jsonRequest({ email: 'not-an-email', consent: true }))
    expect(res.status).toBe(422)
    expect(mocks.waitlistUpsert).not.toHaveBeenCalled()
  })

  it('rejects missing consent with 422 before writing', async () => {
    const res = await POST(jsonRequest({ email: testMail('parent'), consent: false }))
    expect(res.status).toBe(422)
    expect(mocks.waitlistUpsert).not.toHaveBeenCalled()
  })

  it('rejects unknown request fields before writing or logging', async () => {
    mocks.waitlistUpsert.mockResolvedValue({})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(
      jsonRequest({
        email: testMail('private'),
        consent: true,
        source: 'current-lp',
        child_name: 'private',
        secret: 'hidden',
      }),
    )

    expect(res.status).toBe(422)
    expect(mocks.waitlistUpsert).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('rejects client-controlled metadata outside known values before logging', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(
      jsonRequest({
        email: testMail('private'),
        consent: true,
        source: testMail('private'),
        privacy_policy_version: testMail('private'),
      }),
    )

    expect(res.status).toBe(422)
    expect(mocks.waitlistUpsert).not.toHaveBeenCalled()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('falls back to update on a unique-race P2002 without overwriting consent context', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique race', {
      code: 'P2002',
      clientVersion: 'test',
    })
    const normalized = testMail('parent')
    mocks.waitlistUpsert.mockRejectedValue(p2002)
    mocks.waitlistUpdate.mockResolvedValue({})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const res = await POST(
      jsonRequest({
        email: normalized,
        consent: true,
        source: 'current-lp',
        privacy_policy_version: 'prelaunch-2026-07-25',
      }),
    )

    expect(res.status).toBe(202)
    expect(mocks.waitlistUpdate).toHaveBeenCalledWith({
      where: { emailHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
      data: { email: normalized },
    })
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('rate-limits repeated submissions from the same client key', async () => {
    mocks.waitlistUpsert.mockResolvedValue({})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    for (let i = 0; i < 12; i += 1) {
      const res = await POST(
        jsonRequest(
          {
            email: testMail(`parent${i}`),
            consent: true,
            source: 'current-lp',
            privacy_policy_version: 'prelaunch-2026-07-25',
          },
          { 'x-forwarded-for': '203.0.113.10' },
        ),
      )
      expect(res.status).toBe(202)
    }

    const limited = await POST(
      jsonRequest(
        {
          email: testMail('parent-limited'),
          consent: true,
          source: 'current-lp',
          privacy_policy_version: 'prelaunch-2026-07-25',
        },
        { 'x-forwarded-for': '203.0.113.10' },
      ),
    )

    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe(String(WAITLIST_RETRY_AFTER_SECONDS))
  })
})
