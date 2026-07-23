import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  albumLoadMoreStatus,
  deleteMemoryDescription,
  quietStateCopy,
  recordAiGeneratingCopy,
  recordSavedLandingTitle,
} from '@/lib/ui/quiet-state-copy'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const onboardingSource = readFileSync(
  new URL('../../../src/app/onboarding/page.tsx', import.meta.url),
  'utf8',
)
const signInSource = readFileSync(
  new URL('../../../src/app/sign-in/page.tsx', import.meta.url),
  'utf8',
)
const settingsSource = readFileSync(
  new URL('../../../src/app/settings/page.tsx', import.meta.url),
  'utf8',
)
const albumListSource = readFileSync(
  new URL('../../../src/features/memories/client/album-list.tsx', import.meta.url),
  'utf8',
)
const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)
const ledgerSource = readFileSync(
  new URL('../../../docs/design/quiet-copy-motion-ledger.md', import.meta.url),
  'utf8',
)
const quietStateCopySource = readFileSync(
  new URL('../../../src/lib/ui/quiet-state-copy.ts', import.meta.url),
  'utf8',
)

describe('Quiet state copy and motion contracts', () => {
  it('does not render technical reasons or provider errors in active UI state copy', () => {
    const activeUiSources = [
      recordSource,
      onboardingSource,
      signInSource,
      settingsSource,
      albumListSource,
      memoryActionsSource,
      quietStateCopySource,
    ]

    for (const source of activeUiSources) {
      const sourceWithoutPrivacyBoundary = source.replaceAll('presigned URL', 'presigned-url')
      expect(source).not.toContain('setError(e.message)')
      expect(source).not.toContain('(${e.reason})')
      expect(source).not.toContain('HTTP ${putRes.status}')
      expect(sourceWithoutPrivacyBoundary).not.toContain('signed URL')
    }
  })

  it('keeps AI waiting and save success quiet and reduced-motion-safe', () => {
    expect(recordAiGeneratingCopy('はな')).toBe(
      'はな ちゃんの ページに そえる ことばを 探しています…',
    )
    expect(quietStateCopy.record.aiFailed).toContain('AI を使わずに')
    expect(quietStateCopy.record.saveDoneTitle).toBe('ページを しまいました')
    expect(quietStateCopy.record.saveDoneDescription).toBe('できたページを ひらきます。')
    expect(recordSavedLandingTitle('はな')).toBe('はな ちゃんのページを しまいました')
    expect(recordSource).toContain('motion-safe:animate-pulse')
    expect(recordSource).toContain("tone: 'success'")
    expect(recordSource).toContain('role="status"')
    expect(recordSource).toContain(
      '<span className="sr-only">{recordAiGeneratingCopy(childName)}</span>',
    )
    expect(recordSource).toContain('aria-busy={aiStatus ===')
    expect(recordSource).toMatch(/uploadStatus === 'failed'[\s\S]+role="alert"/)
    expect(recordSource).toMatch(/aiError \?[\s\S]+role="alert"/)
    expect(recordSource).not.toContain("router.push('/record')")
    expect(recordSource).not.toContain('hadMemoryListCache')
    expect(recordSource).not.toContain('saveSubmitErrorState')
    expect(recordSource).not.toContain('hana.record.submit-error')
  })

  it('records adopted copy, blocked wording, and evidence-safe notes in the ledger', () => {
    expect(ledgerSource).toMatch(/\|\s*record\s*\|\s*AI waiting\s*\|/)
    expect(ledgerSource).toMatch(/\|\s*record\s*\|\s*save pending \/ success\s*\|/)
    expect(ledgerSource).toMatch(/\|\s*sign-in\s*\|\s*OAuth failure\s*\|/)
    expect(ledgerSource).toContain('error reason category without request body')
    expect(ledgerSource).toContain('AI generated memory text')
    expect(ledgerSource).not.toContain('| TBD')
  })

  it('keeps album and memory-detail toast/dialog copy in the shared ledgered module', () => {
    expect(albumLoadMoreStatus(2, true)).toBe('さらに 2 件 ひらきました。')
    expect(albumLoadMoreStatus(2, false)).toBe('さらに 2 件 ひらきました。すべて表示しました。')
    expect(deleteMemoryDescription('はな')).toBe(
      'はな ちゃんの このページは、アルバムに 表示されなくなります。',
    )
    expect(albumListSource).toContain('quietStateCopy.album.favoriteFailedTitle')
    expect(albumListSource).toContain('albumLoadMoreStatus')
    expect(memoryActionsSource).toContain('quietStateCopy.memoryDetail.deleteFailedTitle')
    expect(memoryActionsSource).toContain('deleteMemoryDescription(childName)')
  })
})
