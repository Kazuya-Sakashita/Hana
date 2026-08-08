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
    expect(globalsCss).toContain('.lp-paper-surface')
    expect(globalsCss).toContain('.lp-paper-slip')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-sheet) + 0.25rem)')
    expect(globalsCss).toContain('border-radius: var(--radius-sheet)')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-paper-slip) - 0.0625rem)')
    expect(globalsCss).toContain('border-radius: var(--radius-photo-mat)')
    expect(globalsCss).toContain('border-radius: calc(var(--radius-photo-inner) + 0.125rem)')
    expect(globalsCss).toContain('--radius-sheet: 1.5rem')
  })

  it('softens the hero keepsake image frame and caption as one warm surface', () => {
    expect(lpSource).toContain('paper-surface lp-soft-frame')
    expect(lpSource).toContain('photo-mat lp-soft-photo-mat')
    expect(lpSource).toContain('className="lp-soft-photo-inner w-full"')
    expect(lpSource).toContain('bg-paper-slip/80 lp-soft-card')
    expect(lpSource).toContain('公開前検証用の合成イメージです。実ユーザー写真ではありません。')
  })

  it('turns repeated value cards into one keepsake journey and trust bridge', () => {
    expect(lpSource).toContain('data-lp-keepsake-journey="photo-to-memory"')
    expect(lpSource).toContain('paper-surface lp-soft-card px-5 py-5')
    expect(lpSource).toContain('写真を選ぶ')
    expect(lpSource).toContain('写真 + タイトル')
    expect(lpSource).toContain('写真 + 短い本文')
    expect(lpSource).toContain('data-lp-trust-bridge="waitlist"')
    expect(lpSource).toContain('AI 同意は記録時に別で確認します')
  })

  it('turns the waitlist form into a soft paper slip without reducing tap targets', () => {
    expect(waitlistFormSource).toContain('paper-surface lp-soft-form')
    expect(waitlistFormSource).toContain(
      'className="border-hairline bg-paper-slip text-ink lp-soft-field',
    )
    expect(waitlistFormSource).toContain('bg-warm/70 lp-soft-card')
    expect(waitlistFormSource).toContain('tap-target')
    expect(waitlistFormSource).toContain('min-h-[52px]')
  })

  it('keeps the design feedback scoped away from the public trust launch blocker', () => {
    expect(issueSource).toContain('trust copy の公開判断')
    expect(issueSource).toContain('privacy / legal review の完了扱い')
    expect(issueSource).toContain('- [x] 44px 以上の tap target')
    expect(publicQaIssueSource).toContain('status: done')
    expect(publicQaIssueSource).toContain('Privacy / Legal Human Review 済み')
  })
})
