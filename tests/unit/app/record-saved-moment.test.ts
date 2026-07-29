import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { quietStateCopy, recordSavedLandingTitle } from '@/lib/ui/quiet-state-copy'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const memoryDetailSource = readFileSync(
  new URL('../../../src/app/memory/[memoryId]/page.tsx', import.meta.url),
  'utf8',
)
const savedMomentQaSource = readFileSync(
  new URL('../../../docs/design/record-saved-moment-qa.md', import.meta.url),
  'utf8',
)
const recordBottomSheetQaSource = readFileSync(
  new URL('../../../docs/design/record-bottom-sheet-capture-qa.md', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-063-record-saved-moment-memory-landing.md', import.meta.url),
  'utf8',
)
const savedNoticeSource =
  memoryDetailSource.match(
    /function SavedMemoryNotice[\s\S]+?function MemoryDetailSkeleton/,
  )?.[0] ?? ''

describe('record saved moment and memory landing', () => {
  it('opens the created memory detail instead of dropping the user into album', () => {
    expect(recordSource).toContain('const created = await createMemoryMutation.mutateAsync')
    expect(recordSource).toContain('router.push(`/memory/${created.id}?saved=1`)')
    expect(recordSource).not.toContain("router.push('/album')")
    expect(quietStateCopy.record.saveDoneTitle).toBe('ページを しまいました')
    expect(quietStateCopy.record.saveDoneDescription).toBe('できたページを ひらきます。')
  })

  it('shows a reduced-motion-safe saved notice on memory detail', () => {
    expect(memoryDetailSource).toContain(
      'searchParams: Promise<{ saved?: string | string[]; updated?: string | string[] }>',
    )
    expect(memoryDetailSource).toContain("const showSavedMoment = query.saved === '1'")
    expect(memoryDetailSource).toContain('<SavedMemoryNotice />')
    expect(memoryDetailSource).toMatch(
      /showSavedMoment \? \(\s*<SavedMemoryNotice \/>\s*\) : showUpdatedMoment \? \(\s*<UpdatedMemoryNotice \/>\s*\) : \(\s*<Link[\s\S]+absolute left-3 top-3/,
    )
    expect(memoryDetailSource).toMatch(
      /<SavedMemoryNotice \/>\s*\) : showUpdatedMoment[\s\S]+<Suspense fallback={<MemoryDetailSkeleton \/>}>/,
    )
    expect(savedNoticeSource).toContain('アルバムへ')
    expect(memoryDetailSource).toContain('role="status"')
    expect(memoryDetailSource).toContain('aria-live="polite"')
    expect(memoryDetailSource).toContain("recordSavedLandingTitle('')")
    expect(savedNoticeSource).not.toContain('motion-safe:')
    expect(savedNoticeSource).not.toContain('animate-')
    expect(recordSavedLandingTitle('はな')).toBe('はな ちゃんのページを しまいました')
    expect(recordSavedLandingTitle('')).toBe('ページを しまいました')
  })

  it('preserves failure recovery on record while updating the finish condition', () => {
    expect(recordSource).toContain('rollback()')
    expect(recordSource).toContain('setTopMessage(quietStateCopy.record.saveFailedDescription)')
    expect(recordSource).toMatch(/fieldErrors\.title \?[\s\S]+id="memory-title-error"/)
    expect(recordSource).toMatch(/fieldErrors\.imageIds \?[\s\S]+id="memory-photo-error"/)
    expect(recordSource).toMatch(/formErrorMessage \?[\s\S]+role="alert"/)
    expect(recordBottomSheetQaSource).toContain('`/memory/{id}?saved=1` 遷移')
    expect(recordBottomSheetQaSource).toContain('写真、登録した呼び名、月齢、日付、天気')
    expect(recordBottomSheetQaSource).not.toContain('写真、名前、月齢')
    expect(savedMomentQaSource).toContain('memory detail の画像取得は保存完了後の見返し体験であり')
  })

  it('records privacy-safe QA policy for the saved moment', () => {
    expect(savedMomentQaSource).toContain('State Matrix')
    expect(savedMomentQaSource).toContain('role="status" aria-live="polite"')
    expect(savedMomentQaSource).toContain(
      'production account の screenshot / trace / HAR は使わない',
    )
    expect(savedMomentQaSource).toContain('実写真、実名、メール、生年月日')
    expect(savedMomentQaSource).toContain('presigned URL、`storage_key`、prompt、AI 生成本文')
    expect(savedMomentQaSource).toContain('memory id は `{memoryId}`')
    expect(issueSource).toContain('保存後の状態別 QA 方針が docs/design に残っている')
  })
})
