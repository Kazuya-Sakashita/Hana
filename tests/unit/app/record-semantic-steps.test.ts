import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('src/app/record/page.tsx', 'utf8')

describe('record semantic steps', () => {
  it('uses an ordered list and exposes the current step', () => {
    expect(source).toContain('<ol')
    expect(source).toContain('aria-label="記録の進行"')
    expect(source).toContain("aria-current={active ? 'step' : undefined}")
  })

  it('announces current and completed states without color alone', () => {
    expect(source).toContain('現在のステップ: {currentStepLabel}')
    expect(source).toContain('<span className="sr-only"> 完了</span>')
  })
})
