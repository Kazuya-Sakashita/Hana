import { describe, expect, it } from 'vitest'
import {
  getUploadRetryCopy,
  getUploadRetryStartStage,
  runUploadStages,
} from '@/features/memories/client/record-upload-retry'

describe('getUploadRetryCopy', () => {
  it('distinguishes preparation, transfer, and confirmation recovery without color', () => {
    expect(getUploadRetryCopy('prepare')).toEqual({
      primaryLabel: '同じ写真で もういちど',
      statusLabel: '写真を送る準備が途中でした。同じ写真でやり直せます',
    })
    expect(getUploadRetryCopy('put')).toEqual({
      primaryLabel: '同じ写真を もういちど送る',
      statusLabel: '写真を送りきれませんでした。同じ写真でやり直せます',
    })
    expect(getUploadRetryCopy('confirm')).toEqual({
      primaryLabel: '保存の確認を もういちど',
      statusLabel: '写真は届いています。保存の確認からやり直せます',
    })
  })

  it('refreshes a one-time upload target after PUT failure but reuses it for confirm', () => {
    expect(getUploadRetryStartStage('prepare')).toBe('prepare')
    expect(getUploadRetryStartStage('put')).toBe('prepare')
    expect(getUploadRetryStartStage('confirm')).toBe('confirm')
  })

  it('returns a PUT checkpoint without calling confirm when transfer fails', async () => {
    const calls: string[] = []
    const result = await runUploadStages({
      startStage: 'prepare',
      target: null,
      isCurrent: () => true,
      onStageChange: (stage) => calls.push(`stage:${stage}`),
      prepare: async () => {
        calls.push('prepare')
        return { token: 'opaque-target' }
      },
      put: async () => {
        calls.push('put')
        throw new Error('synthetic-transfer-failure')
      },
      confirm: async () => {
        calls.push('confirm')
        return 'confirmed'
      },
    })

    expect(result).toMatchObject({ kind: 'failed', stage: 'put' })
    expect(calls).toEqual(['stage:prepare', 'prepare', 'stage:put', 'put'])
  })

  it('retries confirmation without preparing or transferring again', async () => {
    const calls: string[] = []
    const result = await runUploadStages({
      startStage: 'confirm',
      target: { token: 'opaque-target' },
      isCurrent: () => true,
      onStageChange: (stage) => calls.push(`stage:${stage}`),
      prepare: async () => {
        calls.push('prepare')
        return { token: 'unexpected' }
      },
      put: async () => {
        calls.push('put')
      },
      confirm: async () => {
        calls.push('confirm')
        return 'confirmed'
      },
    })

    expect(result).toEqual({
      kind: 'success',
      target: { token: 'opaque-target' },
      value: 'confirmed',
    })
    expect(calls).toEqual(['stage:confirm', 'confirm'])
  })

  it('ignores a delayed preparation result after the selected photo changes', async () => {
    let current = true
    let releasePrepare: ((target: { token: string }) => void) | undefined
    const calls: string[] = []
    const preparePromise = new Promise<{ token: string }>((resolve) => {
      releasePrepare = resolve
    })
    const resultPromise = runUploadStages({
      startStage: 'prepare',
      target: null,
      isCurrent: () => current,
      onStageChange: (stage) => calls.push(`stage:${stage}`),
      prepare: async () => preparePromise,
      put: async () => {
        calls.push('put')
      },
      confirm: async () => {
        calls.push('confirm')
        return 'confirmed'
      },
    })

    current = false
    releasePrepare?.({ token: 'stale-target' })

    await expect(resultPromise).resolves.toEqual({ kind: 'stale' })
    expect(calls).toEqual(['stage:prepare'])
  })
})
