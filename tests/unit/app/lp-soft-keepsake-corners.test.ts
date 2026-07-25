import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')
const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const waitlistFormSource = readFileSync(
  new URL('../../../src/components/waitlist-signup-form.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-083-lp-soft-keepsake-corners.md', import.meta.url),
  'utf8',
)
const publicQaIssueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-075-lp-public-qa-trust-gate.md', import.meta.url),
  'utf8',
)

describe('ISSUE-083 LP soft keepsake corners', () => {
  it('adds LP-specific soft radius primitives without changing global Hana tokens', () => {
    expect(globalsCss).toContain('.lp-soft-frame')
    expect(globalsCss).toContain('.lp-soft-form')
    expect(globalsCss).toContain('.lp-soft-card')
    expect(globalsCss).toContain('.lp-soft-photo-mat')
    expect(globalsCss).toContain('.lp-soft-photo-inner')
    expect(globalsCss).toContain('.lp-soft-field')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-sheet) + 0.25rem)')
    expect(globalsCss).toContain('border-radius: var(--radius-sheet)')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-paper-slip) + 0.125rem)')
    expect(globalsCss).toContain('border-radius: var(--radius-photo-mat)')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-photo-inner) + 0.125rem)')
    expect(globalsCss).toContain('--radius-sheet: 1.5rem')
  })

  it('softens the hero keepsake image frame and caption as one warm surface', () => {
    expect(lpSource).toContain('paper-surface lp-soft-frame')
    expect(lpSource).toContain('photo-mat lp-soft-photo-mat')
    expect(lpSource).toContain('className="lp-soft-photo-inner w-full"')
    expect(lpSource).toContain('bg-paper-slip/70 lp-soft-card')
    expect(lpSource).toContain('実ユーザー写真ではない synthetic preview')
  })

  it('uses the same soft paper card language for value and trust surfaces', () => {
    expect(lpSource.match(/bg-paper-slip lp-soft-card border p-5/g) ?? []).toHaveLength(4)
    expect(lpSource).toContain('写真のみ')
    expect(lpSource).toContain('AI 利用を曖昧にしません。')
  })

  it('turns the waitlist form into a soft paper slip without reducing tap targets', () => {
    expect(waitlistFormSource).toContain('bg-paper-slip/[0.08] lp-soft-form')
    expect(waitlistFormSource).toContain(
      'className="border-paper-slip/45 bg-paper-slip text-ink lp-soft-field',
    )
    expect(waitlistFormSource).toContain('bg-paper-slip/[0.07] lp-soft-card')
    expect(waitlistFormSource).toContain('bg-paper-slip/[0.06] lp-soft-card')
    expect(waitlistFormSource).toContain('tap-target')
    expect(waitlistFormSource).toContain('min-h-[52px]')
  })

  it('keeps the design feedback scoped away from the public trust launch blocker', () => {
    expect(issueSource).toContain('trust copy の公開判断')
    expect(issueSource).toContain('privacy / legal review の完了扱い')
    expect(issueSource).toContain('- [x] 44px 以上の tap target')
    expect(publicQaIssueSource).toContain('status: blocked')
    expect(publicQaIssueSource).toContain('公開 copy の privacy / legal review')
  })
})
