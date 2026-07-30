import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createApiClient: vi.fn(() => ({ kind: 'api-client' })),
}))

vi.mock('@/lib/api/client', () => ({
  createApiClient: mocks.createApiClient,
}))

describe('getBrowserApiClient', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.createApiClient.mockClear()
  })

  it('uses the same-origin session cookie without adding a duplicate bearer token', async () => {
    const { getBrowserApiClient } = await import('@/lib/api/browser-client')

    expect(getBrowserApiClient()).toEqual({ kind: 'api-client' })
    expect(mocks.createApiClient).toHaveBeenCalledWith({ baseUrl: '/v1' })
    expect(mocks.createApiClient).toHaveBeenCalledOnce()
  })
})
