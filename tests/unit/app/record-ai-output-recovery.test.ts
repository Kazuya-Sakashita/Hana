import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { quietStateCopy } from '@/lib/ui/quiet-state-copy'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)

describe('ISSUE-117 AI output recovery', () => {
  it('keeps manual input and explicit retry available after an output rejection', () => {
    expect(recordSource).toContain("case 'ai_output_rejected':")
    expect(recordSource).toContain("setAiStatus('failed')")
    expect(recordSource).toContain('onClick={requestAiGenerate}')
    expect(recordSource).toContain('onClick={focusManualTitle}')
    expect(quietStateCopy.record.aiFailed).toContain('AI を使わずに')
  })
})
