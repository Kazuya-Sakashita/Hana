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
const radiusSource = [
  '../../../src/app/page.tsx',
  '../../../src/app/record/page.tsx',
  '../../../src/app/album/page.tsx',
  '../../../src/app/memory/[memoryId]/page.tsx',
  '../../../src/features/memories/client/album-list.tsx',
  '../../../src/components/ui/toast.tsx',
  '../../../src/components/memory-actions.tsx',
]
  .map((path) => readFileSync(new URL(path, import.meta.url), 'utf8'))
  .join('\n')

describe('Quiet Heirloom common UI contracts', () => {
  it('defines paper and photo mat tokens used by the refreshed UI foundation', () => {
    expect(globalsCss).toContain('--bg-paper-slip:')
    expect(globalsCss).toContain('--bg-photo-mat:')
    expect(globalsCss).toContain('--accent-pressed:')
    expect(globalsCss).toContain('--success-leaf-deep:')
    expect(globalsCss).toContain('--radius-photo-inner:')
    expect(globalsCss).toContain('--radius-photo-mat:')
    expect(globalsCss).toContain('--radius-paper-slip:')
    expect(globalsCss).toContain('--radius-sheet:')
    expect(globalsCss).toContain('--bg-paper-slip: #252220')
    expect(globalsCss).toContain('--bg-photo-mat: #2d2825')
    expect(globalsCss).toContain('--primary: var(--success-leaf)')
    expect(globalsCss).toContain('--primary-foreground: var(--bg-paper-slip)')
    expect(globalsCss).toContain('.paper-surface')
    expect(globalsCss).toContain('.photo-mat')
    expect(globalsCss).toContain('.radius-photo-inner')
    expect(globalsCss).toContain('.radius-paper-slip')
  })

  it('keeps shared buttons and navigation at 44px or larger tap targets', () => {
    expect(globalsCss).toContain('.tap-target')
    expect(globalsCss).toContain('min-height: 44px')
    expect(globalsCss).toContain('min-width: 44px')
    expect(buttonSource).toContain('tap-target')
    expect(buttonSource).toContain('hover:bg-leaf-deep')
    expect(buttonSource).not.toContain('hover:bg-sakura-deep')
    expect(buttonSource).toContain('active:text-white')
    expect(buttonSource).toContain("sm: 'h-11")
    expect(buttonSource).toContain("icon: 'size-11")
    expect(bottomNavSource).toContain('tap-target')
    expect(bottomNavSource).toContain('hover:bg-leaf-deep')
    expect(bottomNavSource).not.toContain('hover:bg-sakura-deep')
  })

  it('uses override-friendly cards and icon-based bottom navigation without text glyphs', () => {
    expect(cardSource).toContain('bg-card')
    expect(cardSource).toContain('rounded-[var(--radius-paper-slip)]')
    expect(cardSource).not.toContain('paper-surface')
    expect(cardSource).not.toContain('tracking-tight')
    expect(globalsCss).toContain('letter-spacing: 0')
    expect(bottomNavSource).toContain("from 'lucide-react'")
    expect(bottomNavSource).toContain('ImagePlus')
    expect(bottomNavSource).toContain('QuietIcon')
    expect(bottomNavSource).toContain('text-leaf-deep')
    expect(bottomNavSource).toContain('dark:text-leaf')
    expect(bottomNavSource).toContain('data-active-indicator')
    expect(bottomNavSource).toContain('grid-cols-[1fr_1fr_72px_1fr_1fr]')
    expect(bottomNavSource).not.toContain("glyph: '")
    expect(bottomNavSource).not.toContain('import { BookOpen, Home, Plus')
    expect(bottomNavSource).toContain('aria-label="写真から あたらしく のこす"')
  })

  it('uses semantic radius tokens for primary paper and photo surfaces', () => {
    expect(radiusSource).toContain('rounded-[var(--radius-photo-inner)]')
    expect(radiusSource).toContain('rounded-[var(--radius-photo-mat)]')
    expect(radiusSource).toContain('rounded-[var(--radius-paper-slip)]')
    expect(radiusSource).toContain('rounded-[var(--radius-sheet)]')
    expect(radiusSource).not.toMatch(/rounded-\[(10|12|14|16|18|20|22|28)px\]/)
    expect(radiusSource).not.toMatch(/rounded-\[(1\.75rem|2rem)\]/)
    expect(radiusSource).not.toContain('rounded-2xl')
  })
})
