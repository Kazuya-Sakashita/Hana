import { describe, expect, it, vi } from 'vitest'
import { lockAiConsent } from '@/features/ai/server/consent-lock'

describe('lockAiConsent', () => {
  it('uses the same user-scoped transaction lock for generation and revocation callers', async () => {
    const executeRaw = vi.fn().mockResolvedValue(1)
    const transaction = { $executeRaw: executeRaw } as never

    await lockAiConsent(transaction, 'synthetic-user')
    await lockAiConsent(transaction, 'synthetic-user')

    expect(executeRaw).toHaveBeenCalledTimes(2)
    expect(executeRaw.mock.calls[0]?.[1]).toBe('hana:ai-consent:synthetic-user')
    expect(executeRaw.mock.calls[1]?.[1]).toBe('hana:ai-consent:synthetic-user')
  })
})
