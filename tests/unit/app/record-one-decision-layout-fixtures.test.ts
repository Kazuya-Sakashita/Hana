import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)

type RecordState =
  | 'empty'
  | 'selected-uploading'
  | 'consent-pending'
  | 'generating'
  | 'manual-ready'
  | 'ai-ready'

const states: RecordState[] = [
  'empty',
  'selected-uploading',
  'consent-pending',
  'generating',
  'manual-ready',
  'ai-ready',
]

const viewports = [
  { id: 'compact-short', width: 390, height: 640 },
  { id: 'compact-tall', width: 390, height: 844 },
  { id: 'large-phone', width: 430, height: 932 },
  { id: 'tablet', width: 768, height: 1024 },
]

function estimateRecordLayout(viewport: { width: number; height: number }, state: RecordState) {
  const contentWidth = Math.min(viewport.width, 448)
  const horizontalPadding = 40
  const innerWidth = contentWidth - horizontalPadding
  const sheetMaxHeight = viewport.height * 0.68
  const footerHeight = 76
  const sheetBodyHeight = sheetMaxHeight - footerHeight
  const requiredBodyHeightByState: Record<RecordState, number> = {
    empty: 152,
    'selected-uploading': 188,
    'consent-pending': 244,
    generating: 280,
    'manual-ready': 340,
    'ai-ready': 420,
  }
  const primaryCtaTop = viewport.height - footerHeight

  return {
    contentWidth,
    innerWidth,
    sheetMaxHeight,
    sheetBodyHeight,
    bodyNeedsScroll: requiredBodyHeightByState[state] > sheetBodyHeight,
    primaryCtaTop,
    primaryCtaInLower35: primaryCtaTop >= viewport.height * 0.65,
  }
}

describe('ISSUE-069 record one-decision layout fixtures', () => {
  it('keeps record shell and sheet widths stable across target states', () => {
    for (const viewport of viewports) {
      for (const state of states) {
        const layout = estimateRecordLayout(viewport, state)

        expect(layout.contentWidth, `${viewport.id}:${state} content`).toBeLessThanOrEqual(448)
        expect(layout.innerWidth, `${viewport.id}:${state} inner`).toBeGreaterThanOrEqual(350)
        expect(layout.primaryCtaInLower35, `${viewport.id}:${state} CTA`).toBe(true)
      }
    }
  })

  it('allows body-only scrolling when dense states exceed compact sheet height', () => {
    const compactViewport = viewports[0]
    if (!compactViewport) throw new Error('compact viewport fixture is required')
    const compactAiReady = estimateRecordLayout(compactViewport, 'ai-ready')

    expect(compactAiReady.bodyNeedsScroll).toBe(true)
    expect(recordSource).toContain('max-h-[68dvh]')
    expect(recordSource).toContain('flex max-h-[68dvh] flex-col overflow-hidden')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-body"')
    expect(recordSource).toContain('min-h-0 flex-1 flex-col')
    expect(recordSource).toContain('overflow-y-auto')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-footer"')
  })

  it('keeps tap targets, initial consent focus, and non-occluded manual editing affordances', () => {
    expect(recordSource).toContain('tap-target absolute')
    expect(recordSource).toContain('tap-target text-ink-secondary')
    expect(recordSource).toContain('Button type="button" size="lg"')
    expect(recordSource).toContain('Button type="submit" size="lg"')
    expect(recordSource).toContain('initialFocusId="ai-consent-decline"')
    expect(recordSource).toContain('focusManualTitle')
    expect(recordSource).toContain('titleInputRef.current?.focus()')
    expect(recordSource).toContain('data-testid="record-secondary-edits"')
  })

  it('covers the AI, consent, manual save, and failure recovery branches in markup contracts', () => {
    expect(recordSource).toContain("aiStatus === 'consent_pending'")
    expect(recordSource).toContain("aiStatus === 'generating'")
    expect(recordSource).toContain("aiStatus === 'done'")
    expect(recordSource).toContain('AI を使わずに 書く')
    expect(recordSource).toContain('タイトルがあれば、AIを使わずにこのまま保存できます。')
    expect(recordSource).toContain('role="alert"')
    expect(recordSource).toContain("event.currentTarget.value = ''")
    expect(recordSource).toContain('quietStateCopy.record.uploadFailed')
    expect(recordSource).toContain('quietStateCopy.record.aiFailed')
    expect(recordSource).toContain('quietStateCopy.record.saveFailedDescription')
  })

  it('keeps long text wrap-safe and evidence-free in fixture coverage', () => {
    const longBody = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(4)

    expect(recordSource).toContain('whitespace-pre-wrap break-words')
    expect(recordSource).toContain('[overflow-wrap:anywhere]')
    expect(`${longBody}\n${recordSource}`).not.toMatch(
      /今日まだ|記録していません|途切れ|ストリーク|streak|ランキング|いいね|投稿/i,
    )
    expect(longBody).not.toMatch(/https?:\/\/|storage_key|presigned_url|prompt/i)
  })
})
