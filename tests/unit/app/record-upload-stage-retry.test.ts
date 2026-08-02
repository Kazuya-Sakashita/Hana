import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-114-upload-stage-retry.md', import.meta.url),
  'utf8',
)
const photoStateSource = readFileSync(
  new URL('../../../src/features/memories/client/record-photo-state.ts', import.meta.url),
  'utf8',
)

describe('ISSUE-114 staged upload retry', () => {
  it('keeps upload checkpoints in tab memory and retries the recorded stage', () => {
    expect(recordSource).toContain('uploadRuntimeRef = useRef(new Map<string, UploadRuntime>())')
    expect(photoStateSource).toContain('failureStage: UploadFailureStage | null')
    expect(recordSource).toContain('getUploadRetryStartStage(retryStage)')
    expect(recordSource).toContain("if (retryStage === 'put') cache.target = null")
    expect(recordSource).toContain('onRetry={retryUpload}')
  })

  it('invalidates and aborts an older upload when the selected photo changes', () => {
    expect(recordSource).toContain('runtime.controller?.abort()')
    expect(recordSource).toContain('runtime?.attemptId === attempt.id')
    expect(recordSource).toContain('signal: attempt.signal')
    expect(recordSource).toContain('if (!isCurrentUploadAttempt(attempt)) return')
    expect(recordSource).toContain("'しゃしんを 追加する'")
  })

  it('guards retry against rapid duplicate activation', () => {
    expect(recordSource).toContain('if (runtime.inFlight) return null')
    expect(recordSource).toContain('runtime.inFlight = true')
    expect(recordSource).toContain('runtime.inFlight = false')
  })

  it('keeps sensitive upload values out of logs and persistent state', () => {
    expect(recordSource).not.toContain('console.')
    expect(recordSource).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    expect(issueSource).toContain(
      'ログへ画像URL、presigned URL、`storage_key`、写真メタデータを出力しない',
    )
  })
})
