import { afterEach, describe, expect, it, vi } from 'vitest'

const originalFetch = global.fetch

import { signOutAndClear } from '@/features/auth/client/sign-out'

function clearers() {
  return {
    clearQueryCache: vi.fn(),
    clearImageCache: vi.fn(),
    clearRecordDraft: vi.fn(),
  }
}

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

describe('signOutAndClear', () => {
  it('clears local state only after the server confirms success', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const callbacks = clearers()
    await signOutAndClear(callbacks)
    expect(callbacks.clearQueryCache).toHaveBeenCalledOnce()
    expect(callbacks.clearImageCache).toHaveBeenCalledOnce()
    expect(callbacks.clearRecordDraft).toHaveBeenCalledOnce()
  })

  it('keeps all local state when the server returns a failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    const callbacks = clearers()
    await expect(signOutAndClear(callbacks)).rejects.toThrow('sign_out_failed')
    expect(callbacks.clearQueryCache).not.toHaveBeenCalled()
    expect(callbacks.clearImageCache).not.toHaveBeenCalled()
    expect(callbacks.clearRecordDraft).not.toHaveBeenCalled()
  })

  it('keeps all local state when the network fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('synthetic network failure'))
    const callbacks = clearers()
    await expect(signOutAndClear(callbacks)).rejects.toThrow()
    expect(callbacks.clearQueryCache).not.toHaveBeenCalled()
    expect(callbacks.clearImageCache).not.toHaveBeenCalled()
    expect(callbacks.clearRecordDraft).not.toHaveBeenCalled()
  })
})
