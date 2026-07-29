import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  deleteConsent: vi.fn(),
  getCurrentUser: vi.fn(),
}))

vi.mock('@/lib/api/browser-client', () => ({
  getBrowserApiClient: () => ({
    DELETE: mocks.deleteConsent,
    GET: mocks.getCurrentUser,
  }),
}))

import { revokeAiConsent } from '@/features/me/client/use-current-user'

const revokedUser = {
  id: '8f7e6d5c-4b3a-4291-8765-0123456789ab',
  email: null,
  display_name: null,
  ai_consent_at: null,
  created_at: '2026-05-14T09:30:00.000Z',
}

beforeEach(() => vi.clearAllMocks())

describe('revokeAiConsent', () => {
  it('returns the DELETE response when it is confirmed', async () => {
    mocks.deleteConsent.mockResolvedValue({ data: revokedUser })

    await expect(revokeAiConsent()).resolves.toEqual(revokedUser)
    expect(mocks.getCurrentUser).not.toHaveBeenCalled()
  })

  it('treats response loss as success when GET confirms consent is absent', async () => {
    mocks.deleteConsent.mockRejectedValue(new Error('synthetic response loss'))
    mocks.getCurrentUser.mockResolvedValue({ data: revokedUser })

    await expect(revokeAiConsent()).resolves.toEqual(revokedUser)
  })

  it('keeps the original failure when current consent cannot be confirmed as revoked', async () => {
    const deleteError = new Error('synthetic response loss')
    mocks.deleteConsent.mockRejectedValue(deleteError)
    mocks.getCurrentUser.mockResolvedValue({
      data: { ...revokedUser, ai_consent_at: '2026-06-01T00:00:00.000Z' },
    })

    await expect(revokeAiConsent()).rejects.toBe(deleteError)
  })
})
