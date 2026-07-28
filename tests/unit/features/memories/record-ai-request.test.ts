import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_GENERATION_TIMEOUT_MS,
  runTimedAiRequest,
} from '@/features/memories/client/record-ai-request'

afterEach(() => {
  vi.useRealTimers()
})

describe('runTimedAiRequest', () => {
  it('returns success before the 30 second limit', async () => {
    const controller = new AbortController()

    await expect(
      runTimedAiRequest({
        controller,
        isCurrent: () => true,
        request: async () => 'draft',
      }),
    ).resolves.toEqual({ kind: 'success', value: 'draft' })
    expect(controller.signal.aborted).toBe(false)
  })

  it('aborts and returns timeout at the configured limit', async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    const pending = runTimedAiRequest({
      controller,
      isCurrent: () => true,
      request: () => new Promise<string>(() => {}),
    })

    await vi.advanceTimersByTimeAsync(AI_GENERATION_TIMEOUT_MS)

    await expect(pending).resolves.toEqual({ kind: 'timeout' })
    expect(controller.signal.aborted).toBe(true)
  })

  it('ignores a delayed result after the attempt is replaced', async () => {
    let resolveRequest: ((value: string) => void) | undefined
    let current = true
    const pending = runTimedAiRequest({
      controller: new AbortController(),
      isCurrent: () => current,
      request: () =>
        new Promise<string>((resolve) => {
          resolveRequest = resolve
        }),
    })

    await Promise.resolve()
    current = false
    resolveRequest?.('old draft')

    await expect(pending).resolves.toEqual({ kind: 'stale' })
  })

  it('returns a recoverable failure without exposing or changing request content', async () => {
    const syntheticFailure = new Error('synthetic disconnect')

    const result = await runTimedAiRequest({
      controller: new AbortController(),
      isCurrent: () => true,
      request: async () => {
        throw syntheticFailure
      },
    })

    expect(result).toEqual({ kind: 'failed', error: syntheticFailure })
  })
})
