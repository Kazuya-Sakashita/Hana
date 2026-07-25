import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import {
  DEFAULT_PRIVACY_POLICY_VERSION,
  DEFAULT_WAITLIST_SOURCE,
  parseWaitlistSignupCreate,
  waitlistEmailHash,
} from '@/features/waitlist/server/parse'

const TEST_MAIL_DOMAIN = ['example', 'test'].join('.')

function testMail(local: string): string {
  return [local, TEST_MAIL_DOMAIN].join('@')
}

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
    const normalized = testMail('parent+beta')
    const input = parseWaitlistSignupCreate({
      email: `  ${testMail('Parent+Beta').replace(TEST_MAIL_DOMAIN, TEST_MAIL_DOMAIN.toUpperCase())} `,
      consent: true,
      source: ' current-lp ',
      privacy_policy_version: ' prelaunch-2026-07-25 ',
    })

    expect(input).toEqual({
      email: normalized,
      emailHash: waitlistEmailHash(normalized),
      source: DEFAULT_WAITLIST_SOURCE,
      privacyPolicyVersion: 'prelaunch-2026-07-25',
    })
    expect(input.emailHash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('uses the server-side privacy policy default when omitted', () => {
    const input = parseWaitlistSignupCreate({
      email: testMail('parent'),
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
      () => parseWaitlistSignupCreate({ email: testMail('parent'), consent: false }),
      'body.consent',
    )
  })

  it('rejects unknown fields', () => {
    expectValidationError(
      () =>
        parseWaitlistSignupCreate({
          email: testMail('parent'),
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
          email: testMail('parent'),
          consent: true,
          source: testMail('private'),
        }),
      'body.source',
    )
  })

  it('rejects privacy policy versions outside the allowlist', () => {
    expectValidationError(
      () =>
        parseWaitlistSignupCreate({
          email: testMail('parent'),
          consent: true,
          privacy_policy_version: testMail('private'),
        }),
      'body.privacy_policy_version',
    )
  })
})
