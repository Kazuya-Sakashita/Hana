import { afterEach, describe, expect, it, vi } from 'vitest'

const originalFetch = global.fetch

import { clearLocalSessionState, signOutAndClear } from '@/features/auth/client/sign-out'

function clearers() {
  return [vi.fn(), vi.fn(), vi.fn()]
}

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('signOutAndClear', () => {
  it('clears local state only after the server confirms success', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const callbacks = clearers()
    await signOutAndClear({ clearLocalState: () => clearLocalSessionState(callbacks) })
    for (const callback of callbacks) expect(callback).toHaveBeenCalledOnce()
  })

  it('keeps all local state when the server returns a failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const callbacks = clearers()
    await expect(
      signOutAndClear({ clearLocalState: () => clearLocalSessionState(callbacks) }),
    ).rejects.toThrow('sign_out_failed')
    for (const callback of callbacks) expect(callback).not.toHaveBeenCalled()
  })

  it('keeps all local state when the network fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('synthetic network failure'))
    const callbacks = clearers()
    await expect(
      signOutAndClear({ clearLocalState: () => clearLocalSessionState(callbacks) }),
    ).rejects.toThrow()
    for (const callback of callbacks) expect(callback).not.toHaveBeenCalled()
  })

  it('finishes sign-out and attempts every local cleanup after server success', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const callbacks = [vi.fn(), vi.fn(() => void 0), vi.fn()]
    callbacks[0]!.mockImplementation(() => {
      throw new Error('synthetic local cleanup failure')
    })

    await expect(
      signOutAndClear({ clearLocalState: () => clearLocalSessionState(callbacks) }),
    ).resolves.toBeUndefined()
    for (const callback of callbacks) expect(callback).toHaveBeenCalledOnce()
  })
})
