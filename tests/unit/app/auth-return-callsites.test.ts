import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sources = {
  album: readFileSync(new URL('../../../src/app/album/page.tsx', import.meta.url), 'utf8'),
  memory: readFileSync(
    new URL('../../../src/app/memory/[memoryId]/page.tsx', import.meta.url),
    'utf8',
  ),
  onboarding: readFileSync(
    new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
    'utf8',
  ),
  record: readFileSync(new URL('../../../src/app/record/page.tsx', import.meta.url), 'utf8'),
  settings: readFileSync(new URL('../../../src/app/settings/page.tsx', import.meta.url), 'utf8'),
  memoryActions: readFileSync(
    new URL('../../../src/components/memory-actions.tsx', import.meta.url),
    'utf8',
  ),
  albumList: readFileSync(
    new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
    'utf8',
  ),
}

describe('protected screen sign-in return wiring', () => {
  it('uses the validated sign-in path at every unauthorized callsite', () => {
    for (const source of Object.values(sources)) {
      expect(source).toContain("import { signInPath } from '@/lib/auth/safe-redirect'")
      expect(source).toContain('signInPath(')
    }
  })

  it('retains only the allowlisted album and memory detail state on server redirects', () => {
    expect(sources.album).toContain(
      "redirect(signInPath(rawMonth ? `/album?month=${encodeURIComponent(month)}` : '/album'))",
    )
    expect(sources.memory).toContain(
      'redirect(signInPath(`/memory/${encodeURIComponent(memoryId)}${savedQuery}`))',
    )
  })

  it('keeps an owner-bound record draft across an expired-session round trip', () => {
    expect(sources.record).not.toMatch(/if \(isUnauthorized\) \{\s*recordDraftStore\.clear\(\)/)
    expect(sources.record).toContain(
      'router.push(signInPath(`${window.location.pathname}${window.location.search}`))',
    )
  })
})
