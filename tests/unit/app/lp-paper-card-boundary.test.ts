import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalsCss = readFileSync(new URL('../../../src/app/globals.css', import.meta.url), 'utf8')
const lpSource = readFileSync(new URL('../../../src/app/lp/page.tsx', import.meta.url), 'utf8')
const waitlistFormSource = readFileSync(
  new URL('../../../src/components/waitlist-signup-form.tsx', import.meta.url),
  'utf8',
)
const evaluationSource = readFileSync(
  new URL('../../../docs/design/current-lp-evaluation.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-101-lp-paper-card-boundary.md', import.meta.url),
  'utf8',
)
const issueIndexSource = readFileSync(
  new URL('../../../docs/issues/README.md', import.meta.url),
  'utf8',
)

describe('ISSUE-101 LP paper/card boundary refinement', () => {
  it('adds paper-specific LP primitives without changing global radius tokens', () => {
    expect(globalsCss).toContain('.lp-paper-surface')
    expect(globalsCss).toContain('.lp-paper-slip')
    expect(globalsCss).toContain('.lp-paper-link')
    expect(globalsCss).toContain('.lp-paper-field')
    expect(globalsCss).toContain('.lp-paper-divider')
    expect(globalsCss).toContain('box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68)')
    expect(globalsCss).toContain('--radius-photo-mat: 1rem')
    expect(globalsCss).toContain('--radius-paper-slip: 1.125rem')
    expect(globalsCss).not.toContain('0 18px 42px rgba(58, 38, 30, 0.045)')
  })

  it('uses paper slip and photo mat roles on the public LP surfaces', () => {
    expect(lpSource).toContain('paper-surface lp-soft-frame p-3 sm:p-4 lp-paper-surface')
    expect(lpSource).toContain('bg-paper-slip/80 lp-soft-card mt-5 p-5 lp-paper-slip')
    expect(lpSource).toContain('paper-surface lp-soft-card px-5 py-5 lp-paper-surface')
    expect(lpSource).toContain('last:pb-0 lp-paper-divider')
    expect(lpSource).toContain('text-sm lp-paper-link')
    expect(lpSource).toContain('text-sm leading-7 lp-paper-slip')
  })

  it('softens the waitlist form surfaces while preserving large controls', () => {
    expect(waitlistFormSource).toContain(
      'paper-surface lp-soft-form mt-8 grid gap-4 p-4 sm:p-5 lp-paper-surface',
    )
    expect(waitlistFormSource).toContain('min-h-[52px] w-full border px-5 text-base lp-paper-field')
    expect(waitlistFormSource).toContain('text-sm leading-7 lp-paper-slip')
    expect(waitlistFormSource).toContain('bg-warm/70 lp-soft-card grid gap-2 p-3 lp-paper-slip')
    expect(waitlistFormSource).toContain('tap-target')
  })

  it('records LP-P2-02 and issue state without adding private evidence', () => {
    expect(evaluationSource).toContain('LP-P2-02')
    expect(evaluationSource).toContain('対応済み。ISSUE-101')
    expect(evaluationSource).toContain('paper surface / paper slip / paper link primitive')
    expect(issueSource).toContain('github_issue: 226')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('public trust copy、API、保存処理、ログ出力は変更していない')
    expect(issueIndexSource).toContain('`ISSUE-101`')
    expect(issueIndexSource).toContain('`#226`')
    expect(issueIndexSource).toContain(
      'prelaunch validation completed: `ISSUE-089`, `ISSUE-091`, `ISSUE-093`, `ISSUE-095`, `ISSUE-097`, `ISSUE-099`, `ISSUE-101`, `ISSUE-103`',
    )
    expect(`${lpSource}\n${waitlistFormSource}\n${issueSource}`).not.toMatch(
      /uploads\/|previewUrl|storage_key\s*[:=]|presigned_url\s*[:=]|prompt\s*[:=]/i,
    )
  })
})
