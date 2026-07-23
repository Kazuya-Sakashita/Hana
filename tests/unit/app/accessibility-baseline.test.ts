import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../../src/app/layout.tsx', import.meta.url), 'utf8')
const darkTokenBlock = globalsCss.match(/\.dark\s*{(?<body>[^}]+)}/)?.groups?.body ?? ''

function token(name: string, source = globalsCss): string {
  const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`Missing CSS token: --${name}`)
  return match[1]
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map((part) => {
    const value = Number.parseInt(part, 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground)
  const backgroundLuminance = relativeLuminance(background)
  const lighter = Math.max(foregroundLuminance, backgroundLuminance)
  const darker = Math.min(foregroundLuminance, backgroundLuminance)
  return (lighter + 0.05) / (darker + 0.05)
}

describe('Hana accessibility baseline', () => {
  it('keeps body text token near AAA contrast on app surfaces', () => {
    const backgrounds = ['bg-canvas', 'bg-elevated', 'bg-warm', 'bg-paper-slip', 'bg-photo-mat']
    const failures: string[] = []

    for (const background of backgrounds) {
      const ratio = contrastRatio(token('ink-primary'), token(background))
      if (ratio < 7) {
        failures.push(`ink-primary on ${background}: ${ratio.toFixed(2)}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('keeps helper and status text tokens at AA contrast on warm surfaces', () => {
    const foregrounds = ['ink-tertiary', 'success-leaf', 'warning-amber']
    const backgrounds = ['bg-canvas', 'bg-elevated', 'bg-warm', 'bg-paper-slip', 'bg-photo-mat']
    const failures: string[] = []

    for (const foreground of foregrounds) {
      for (const background of backgrounds) {
        const ratio = contrastRatio(token(foreground), token(background))
        if (ratio < 4.5) {
          failures.push(`${foreground} on ${background}: ${ratio.toFixed(2)}`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('keeps dark-mode paper and status tokens readable', () => {
    const bodyBackgrounds = ['bg-elevated', 'bg-warm', 'bg-paper-slip', 'bg-photo-mat']
    const helperForegrounds = ['ink-tertiary', 'success-leaf', 'warning-amber']
    const failures: string[] = []

    for (const background of bodyBackgrounds) {
      const ratio = contrastRatio(
        token('ink-primary', darkTokenBlock),
        token(background, darkTokenBlock),
      )
      if (ratio < 7) {
        failures.push(`dark ink-primary on ${background}: ${ratio.toFixed(2)}`)
      }
    }

    for (const foreground of helperForegrounds) {
      for (const background of bodyBackgrounds) {
        const ratio = contrastRatio(
          token(foreground, darkTokenBlock),
          token(background, darkTokenBlock),
        )
        if (ratio < 4.5) {
          failures.push(`dark ${foreground} on ${background}: ${ratio.toFixed(2)}`)
        }
      }
    }

    expect(failures).toEqual([])
  })

  it('keeps primary and focus indicator token states readable', () => {
    const checks: Array<[string, string, string, number]> = [
      ['primary button text', 'ink-primary', 'accent-sakura', 4.5],
      ['dark primary button text', 'primary-foreground', 'accent-sakura', 4.5],
      ['active nav text', 'accent-deep', 'bg-elevated', 4.5],
      ['dark active nav text', 'success-leaf', 'bg-elevated', 4.5],
      ['pressed primary text', 'bg-elevated', 'accent-pressed', 4.5],
      ['focus ring on canvas', 'accent-sakura', 'bg-canvas', 3],
      ['focus ring on elevated', 'accent-sakura', 'bg-elevated', 3],
    ]
    const failures: string[] = []

    for (const [label, foreground, background, minimum] of checks) {
      const foregroundToken =
        label === 'dark primary button text' || label === 'dark active nav text'
          ? token(foreground, darkTokenBlock)
          : token(foreground)
      const backgroundToken =
        label === 'dark active nav text' ? token(background, darkTokenBlock) : token(background)
      const ratio = contrastRatio(foregroundToken, backgroundToken)
      if (ratio < minimum) {
        failures.push(`${label}: ${ratio.toFixed(2)}`)
      }
    }

    expect(failures).toEqual([])
  })

  it('does not lock browser zoom in viewport metadata', () => {
    expect(layoutSource).not.toMatch(/maximumScale\s*:/)
    expect(layoutSource).not.toMatch(/userScalable\s*:\s*false/)
  })
})
