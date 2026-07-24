import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import {
  DEFAULT_PRIVACY_POLICY_VERSION,
  DEFAULT_WAITLIST_SOURCE,
  parseWaitlistSignupCreate,
  waitlistEmailHash,
} from '@/features/waitlist/server/parse'

function expectValidationError(fn: () => void, expectedPath: string) {
  try {
    fn()
    throw new Error('Expected ApiProblemError to be thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(ApiProblemError)
    if (e instanceof ApiProblemError) {
      expect(e.reason).toBe('validation_error')
      expect(e.status).toBe(422)
      const paths = (e.problem.errors ?? []).map((x) => x.path)
      expect(paths).toContain(expectedPath)
    }
  }
}

describe('parseWaitlistSignupCreate', () => {
  it('normalizes email, trims metadata, and creates a stable hash', () => {
    const input = parseWaitlistSignupCreate({
      email: '  Parent+Beta@Example.COM ',
      consent: true,
      source: ' current-lp ',
      privacy_policy_version: ' prelaunch-2026-07-25 ',
    })

    expect(input).toEqual({
      email: 'parent+beta@example.com',
      emailHash: waitlistEmailHash('parent+beta@example.com'),
      source: DEFAULT_WAITLIST_SOURCE,
      privacyPolicyVersion: 'prelaunch-2026-07-25',
    })
    expect(input.emailHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses the server-side privacy policy default when omitted', () => {
    const input = parseWaitlistSignupCreate({
      email: 'parent@example.com',
      consent: true,
    })

    expect(input.privacyPolicyVersion).toBe(DEFAULT_PRIVACY_POLICY_VERSION)
    expect(input.source).toBe(DEFAULT_WAITLIST_SOURCE)
  })

  it('rejects non-object body', () => {
    expectValidationError(() => parseWaitlistSignupCreate('not an object'), 'body')
  })

  it('rejects invalid email', () => {
    expectValidationError(
      () => parseWaitlistSignupCreate({ email: 'not-an-email', consent: true }),
      'body.email',
    )
  })

  it('rejects missing or false consent', () => {
    expectValidationError(
      () => parseWaitlistSignupCreate({ email: 'parent@example.com', consent: false }),
      'body.consent',
    )
  })

  it('rejects unknown fields', () => {
    expectValidationError(
      () =>
        parseWaitlistSignupCreate({
          email: 'parent@example.com',
          consent: true,
          source: 'current-lp',
          child_name: 'private',
        }),
      'body.unknown',
    )
  })

  it('rejects source values outside the allowlist', () => {
    expectValidationError(
      () =>
        parseWaitlistSignupCreate({
          email: 'parent@example.com',
          consent: true,
          source: 'private@example.com',
        }),
      'body.source',
    )
  })

  it('rejects privacy policy versions outside the allowlist', () => {
    expectValidationError(
      () =>
        parseWaitlistSignupCreate({
          email: 'parent@example.com',
          consent: true,
          privacy_policy_version: 'private@example.com',
        }),
      'body.privacy_policy_version',
    )
  })
})
