import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const requestSource = readFileSync(
  new URL('../../../src/features/memories/client/record-ai-request.ts', import.meta.url),
  'utf8',
)
const footerSource = readFileSync(
  new URL('../../../src/features/memories/client/record-footer-state.ts', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-115-ai-timeout-recovery.md', import.meta.url),
  'utf8',
)

describe('ISSUE-115 AI timeout recovery', () => {
  it('uses a 30 second abortable request with a synchronous duplicate guard', () => {
    expect(requestSource).toContain('AI_GENERATION_TIMEOUT_MS = 30_000')
    expect(requestSource).toContain('controller.abort()')
    expect(recordSource).toContain('aiActionInFlightRef.current')
    expect(recordSource).toContain('if (aiActionInFlightRef.current) return null')
    expect(recordSource).toContain('signal,')
  })

  it('invalidates old work on photo replacement and ignores delayed responses', () => {
    expect(recordSource).toContain('cancelAiAttempt()')
    expect(recordSource).toContain('aiRequestIdRef.current += 1')
    expect(recordSource).toContain("if (result.kind === 'stale') return")
    expect(recordSource).toContain('aiAbortControllerRef.current?.abort()')
  })

  it('offers explicit retry and manual recovery after timeout', () => {
    expect(recordSource).toContain('quietStateCopy.record.aiTimedOut')
    expect(footerSource).toContain('if (aiTimedOut)')
    expect(footerSource).toContain("primaryAction: 'retry-ai'")
    expect(footerSource).toContain("secondaryAction: 'manual'")
    expect(footerSource).toContain('AI を使わずに 書く')
  })

  it('moves keyboard focus to the primary recovery action after timeout', () => {
    expect(recordSource).toContain('const aiRecoveryButtonRef = useRef<HTMLButtonElement>(null)')
    expect(recordSource).toMatch(
      /if \(aiStatus !== 'failed' \|\| !aiTimedOut\) return[\s\S]+aiRecoveryButtonRef\.current\?\.focus\(\)/,
    )
    expect(recordSource).toContain('ref={aiTimedOut ? aiRecoveryButtonRef : undefined}')
  })

  it('keeps inputs intact and keeps progress understandable without motion', () => {
    const timeoutBranch = recordSource.slice(
      recordSource.indexOf("if (result.kind === 'timeout')"),
      recordSource.indexOf("if (result.kind === 'success')"),
    )
    for (const setter of [
      'setTitle(',
      'setBody(',
      'setParentNote(',
      'setRecordedAt(',
      'setWeather(',
    ]) {
      expect(timeoutBranch).not.toContain(setter)
    }
    expect(recordSource).toContain('motion-safe:animate-pulse')
    expect(recordSource).toContain('role="status"')
    expect(recordSource).toContain('role="alert"')
  })

  it('records the privacy and evidence boundaries in the local issue', () => {
    expect(issueSource).toContain('github_issue: 250')
    expect(issueSource).toContain('親のひとことやAI生成本文をログへ出力しない')
    expect(issueSource).toContain('同意確認前にAI APIを呼ばない')
    expect(issueSource).toContain('Privacy / Product-UX / Accessibility専門レビュー')
  })
})
