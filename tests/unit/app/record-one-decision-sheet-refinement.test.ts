import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL(
    '../../../docs/issues/ISSUE-069-record-one-decision-sheet-refinement.md',
    import.meta.url,
  ),
  'utf8',
)

describe('ISSUE-069 record one-decision sheet refinement', () => {
  it('renders the unselected photo state as a quiet camera placeholder', () => {
    expect(recordSource).toContain("import { Camera } from 'lucide-react'")
    expect(recordSource).toContain('data-testid="record-photo-placeholder"')
    expect(recordSource).toContain('border border-dashed')
    expect(recordSource).toContain('rounded-[var(--radius-photo-mat)]')
    expect(recordSource).not.toContain(
      'photo-mat mt-6 flex min-h-[240px] flex-1 items-center justify-center overflow-hidden rounded-[var(--radius-sheet)]',
    )
    expect(recordSource).toContain('まずは 1まい')
    expect(recordSource).not.toContain('毎日続けましょう')
  })

  it('keeps bottom sheet footer, safe area, and the thumb-zone CTA contract', () => {
    expect(recordSource).toContain('data-testid="record-bottom-sheet"')
    expect(recordSource).toContain('sticky bottom-0')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-footer"')
    expect(recordSource).toContain('pb-[calc(env(safe-area-inset-bottom)+1rem)]')
    expect(recordSource).toContain('!hasSelectedPhoto ? (')
    expect(recordSource).toContain('しゃしんを えらぶ')
    expect(recordSource).toContain('このまま 残す')
  })

  it('keeps AI optional and consent explicit before generation', () => {
    expect(recordSource).toContain('data-testid="record-decision-cue"')
    expect(recordSource).toContain('選ぶだけでは、まだAIには送りません。')
    expect(recordSource).toContain('data-testid="record-ai-decision"')
    expect(recordSource).toContain('AI で 下書きする')
    expect(recordSource).toContain('AI を使わずに 書く')
    expect(recordSource).toContain('AI を つかわない')
    expect(recordSource).toContain('AI_CONSENT_SENT_COPY')
    expect(recordSource).toContain('AI_CONSENT_NOT_SENT_COPY')
    expect(recordSource).toContain('AI_CONSENT_RETENTION_COPY')
    expect(recordSource).toContain('initialFocusId="ai-consent-decline"')
  })

  it('keeps secondary editing folded and low-density after the primary decision', () => {
    expect(recordSource).toContain('data-testid="record-secondary-edits"')
    expect(recordSource).toContain('<details')
    expect(recordSource).toContain('ことば・日付を なおす')
    expect(recordSource).toContain('ほんぶん (任意)')
    expect(recordSource).toContain('てんき (任意)')
    expect(recordSource).toContain('AIの下書きか、ひとことのタイトルを足すかを選びます。')
    expect(recordSource).toContain('whitespace-pre-wrap break-words')
  })

  it('tracks the local issue scope and evidence safety boundary', () => {
    expect(issueSource).toContain('github_issue: 155')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('- [x] 写真未選択状態')
    expect(issueSource).toContain('AI 同意と送信境界は既存 privacy evidence を優先する')
    expect(issueSource).toContain('AI vendor 送信はサーバ側 consent gate の後')
    expect(issueSource).toContain('証跡には実写真、画像 URL、`storage_key`、prompt、AI 生成本文')
  })
})
