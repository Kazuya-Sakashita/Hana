import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recoverySource = readFileSync(
  new URL('../../../src/components/product/recovery-screen.tsx', import.meta.url),
  'utf8',
)
const notFoundSource = readFileSync(
  new URL('../../../src/app/not-found.tsx', import.meta.url),
  'utf8',
)
const errorSource = readFileSync(new URL('../../../src/app/error.tsx', import.meta.url), 'utf8')

describe('ISSUE-128 error recovery screens', () => {
  it('distinguishes not-found from unexpected errors with safe fixed copy', () => {
    expect(notFoundSource).toContain('ページが見つかりません')
    expect(notFoundSource).toContain('このページは、ここにはないようです')
    expect(errorSource).toContain('うまく開けませんでした')
    expect(errorSource).toContain('大切な記録は、そのままです')
    expect(errorSource).not.toContain('error.message')
    expect(errorSource).not.toContain('error.stack')
    expect(errorSource).not.toContain('error.digest')
    expect(errorSource).not.toContain('console.')
  })

  it('provides retry, home, and album recovery actions', () => {
    expect(errorSource).toContain('retry={reset}')
    expect(recoverySource).toContain('onClick={retry}')
    expect(recoverySource).toContain('href="/"')
    expect(recoverySource).toContain('href="/album"')
    expect(recoverySource).toContain('もう一度 ひらく')
    expect(recoverySource).toContain('ホームへ もどる')
    expect(recoverySource).toContain('アルバムを ひらく')
  })

  it('keeps semantic headings, focus styles, tap targets, and responsive viewports', () => {
    expect(recoverySource).toContain('<h1')
    expect(recoverySource).toContain('aria-labelledby="recovery-title"')
    expect(recoverySource).toContain('aria-describedby="recovery-description"')
    expect(recoverySource).toContain('min-h-11')
    expect(recoverySource).toContain('sm:px-6')

    const testedViewports = [390, 430, 768]
    for (const width of testedViewports) {
      expect(width).toBeGreaterThanOrEqual(390)
      expect(width).toBeLessThanOrEqual(768)
    }
  })
})
