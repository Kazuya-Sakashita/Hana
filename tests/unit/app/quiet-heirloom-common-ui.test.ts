import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')
const buttonSource = readFileSync(
  new URL('../../../src/components/ui/button.tsx', import.meta.url),
  'utf8',
)
const cardSource = readFileSync(
  new URL('../../../src/components/ui/card.tsx', import.meta.url),
  'utf8',
)
const bottomNavSource = readFileSync(
  new URL('../../../src/components/bottom-nav.tsx', import.meta.url),
  'utf8',
)

describe('Quiet Heirloom common UI contracts', () => {
  it('defines paper and photo mat tokens used by the refreshed UI foundation', () => {
    expect(globalsCss).toContain('--bg-paper-slip:')
    expect(globalsCss).toContain('--bg-photo-mat:')
    expect(globalsCss).toContain('--accent-pressed:')
    expect(globalsCss).toContain('--success-leaf-deep:')
    expect(globalsCss).toContain('--bg-paper-slip: #252220')
    expect(globalsCss).toContain('--bg-photo-mat: #2d2825')
    expect(globalsCss).toContain('.paper-surface')
    expect(globalsCss).toContain('.photo-mat')
  })

  it('keeps shared buttons and navigation at 44px or larger tap targets', () => {
    expect(globalsCss).toContain('.tap-target')
    expect(globalsCss).toContain('min-height: 44px')
    expect(globalsCss).toContain('min-width: 44px')
    expect(buttonSource).toContain('tap-target')
    expect(buttonSource).toContain('active:text-white')
    expect(buttonSource).toContain("sm: 'h-11")
    expect(buttonSource).toContain("icon: 'size-11")
    expect(bottomNavSource).toContain('tap-target')
  })

  it('uses override-friendly cards and icon-based bottom navigation without text glyphs', () => {
    expect(cardSource).toContain('bg-card')
    expect(cardSource).not.toContain('paper-surface')
    expect(cardSource).not.toContain('tracking-tight')
    expect(globalsCss).toContain('letter-spacing: 0')
    expect(bottomNavSource).toContain("from 'lucide-react'")
    expect(bottomNavSource).toContain('dark:text-leaf')
    expect(bottomNavSource).not.toContain("glyph: '")
    expect(bottomNavSource).toContain('aria-label="あたらしく のこす"')
  })
})
