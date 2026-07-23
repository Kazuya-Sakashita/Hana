import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../../../src/app/layout.tsx', import.meta.url), 'utf8')

function token(name: string): string {
  const match = globalsCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
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
  it('keeps helper and status text tokens at AA contrast on warm surfaces', () => {
    const foregrounds = ['ink-tertiary', 'success-leaf', 'warning-amber']
    const backgrounds = ['bg-canvas', 'bg-elevated', 'bg-warm']
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

  it('does not lock browser zoom in viewport metadata', () => {
    expect(layoutSource).not.toMatch(/maximumScale\s*:/)
    expect(layoutSource).not.toMatch(/userScalable\s*:\s*false/)
  })
})
