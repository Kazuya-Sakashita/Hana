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

describe('ISSUE-114 staged upload retry', () => {
  it('keeps upload checkpoints in tab memory and retries the recorded stage', () => {
    expect(recordSource).toContain('const uploadCacheRef = useRef<UploadCache | null>(null)')
    expect(recordSource).toContain(
      'const [uploadFailureStage, setUploadFailureStage] = useState<UploadFailureStage | null>(null)',
    )
    expect(recordSource).toContain('getUploadRetryStartStage(failedStage)')
    expect(recordSource).toContain("if (failedStage === 'put') cache.target = null")
    expect(recordSource).toContain('onClick={retryUpload}')
  })

  it('invalidates and aborts an older upload when the selected photo changes', () => {
    expect(recordSource).toContain('const uploadAttemptIdRef = useRef(0)')
    expect(recordSource).toContain('uploadAbortControllerRef.current?.abort()')
    expect(recordSource).toContain('uploadAttemptIdRef.current === attempt.id')
    expect(recordSource).toContain('signal: attempt.signal')
    expect(recordSource).toContain('if (!isCurrentUploadAttempt(attempt)) return')
    expect(recordSource).toContain("'べつの しゃしんを えらぶ'")
  })

  it('guards retry against rapid duplicate activation', () => {
    expect(recordSource).toContain('const uploadActionInFlightRef = useRef(false)')
    expect(recordSource).toContain(
      'if (uploadActionInFlightRef.current || !file || !uploadFailureStage) return',
    )
    expect(recordSource).toContain('uploadActionInFlightRef.current = true')
    expect(recordSource).toContain('uploadActionInFlightRef.current = false')
  })

  it('keeps sensitive upload values out of logs and persistent state', () => {
    expect(recordSource).not.toContain('console.')
    expect(recordSource).not.toMatch(/localStorage|sessionStorage|indexedDB/)
    expect(issueSource).toContain(
      'ログへ画像URL、presigned URL、`storage_key`、写真メタデータを出力しない',
    )
  })
})
