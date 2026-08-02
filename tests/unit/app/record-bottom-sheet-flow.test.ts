import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const footerStateSource = readFileSync(
  new URL('../../../src/features/memories/client/record-footer-state.ts', import.meta.url),
  'utf8',
)
const photoListSource = readFileSync(
  new URL('../../../src/features/memories/components/record-photo-list.tsx', import.meta.url),
  'utf8',
)
const qaNoteSource = readFileSync(
  new URL('../../../docs/design/record-bottom-sheet-capture-qa.md', import.meta.url),
  'utf8',
)
const stopwatchScriptSource = readFileSync(
  new URL('../../../scripts/qa/issue-055-record-stopwatch.cjs', import.meta.url),
  'utf8',
)
const privacyEvidenceSource = readFileSync(
  new URL('../../../docs/design/ai-consent-privacy-evidence.md', import.meta.url),
  'utf8',
)

describe('record bottom-sheet capture flow', () => {
  it('places the 30-second primary flow in a mobile bottom sheet', () => {
    expect(recordSource).toContain('data-testid="record-bottom-sheet"')
    expect(recordSource).toContain('sticky bottom-0')
    expect(recordSource).toContain('max-h-[68dvh]')
    expect(recordSource).toContain('overflow-hidden')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-body"')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-footer"')
    expect(recordSource).toContain('overflow-y-auto')
    expect(recordSource).toContain('pb-[calc(env(safe-area-inset-bottom)+1rem)]')
    expect(recordSource).toContain('PhotoMat')
    expect(recordSource).toContain('PhotoPlaceholder')
    expect(recordSource).toContain('30びょう 記録')
    expect(recordSource).toContain('しゃしんを えらぶ')
    expect(footerStateSource).toContain('AI で 下書きする')
    expect(footerStateSource).toContain('このまま 残す')
  })

  it('keeps AI optional while preserving the consent boundary', () => {
    expect(footerStateSource).toContain('AI を使わずに 書く')
    expect(recordSource).toContain('focusManualTitle')
    expect(recordSource).toContain('ref={titleInputRef}')
    expect(recordSource).toContain('initialFocusId="ai-consent-decline"')
    expect(recordSource).toContain('onClose={onDecline}')
    expect(recordSource).toContain('AI を つかわない')
    expect(recordSource).toContain('Anthropic Claude API')
    expect(recordSource).toContain('しゃしん、登録した呼び名、月齢、ひにち、てんき')
    expect(recordSource).toContain('あなたが書いたメモ')
    expect(recordSource).toContain('位置情報')
    expect(recordSource).toContain('presigned URL')
    expect(recordSource).toContain('保存先のキー')
    expect(recordSource).toContain('商用 API 条件')
    expect(recordSource).toContain('プライバシーレビュー')
    expect(recordSource).not.toContain('通常30日以内に削除されます')
    expect(privacyEvidenceSource).toContain('Name the data not sent')
    expect(privacyEvidenceSource).toContain('image URL, presigned URL, and storage_key')
  })

  it('keeps AI story confirmation visible and secondary edits folded', () => {
    expect(recordSource).toContain('data-testid="record-story-preview"')
    expect(recordSource).toContain('KeepsakePreview')
    expect(recordSource).toContain('のこす ことば')
    expect(recordSource).toContain('<details')
    expect(recordSource).toContain('<Textarea')
    expect(recordSource).toContain('ことば・日付を なおす')
  })

  it('keeps failure recovery and interaction targets accessible', () => {
    expect(recordSource).toContain('tap-target absolute')
    expect(recordSource).toContain('aria-label="やめて とじる"')
    expect(recordSource).toContain('resetPhotoInput')
    expect(recordSource).toContain("event.currentTarget.value = ''")
    expect(recordSource).toContain('openPhotoPicker')
    expect(recordSource).toContain('fileInputRef.current?.click()')
    expect(recordSource).toContain('tabIndex={-1}')
    expect(recordSource).toContain('aria-label="しゃしんを えらぶ"')
    expect(recordSource).toContain('quietStateCopy.record.uploadPrepareFailed')
    expect(recordSource).toContain('quietStateCopy.record.uploadPutFailed')
    expect(recordSource).toContain('quietStateCopy.record.uploadConfirmFailed')
    expect(recordSource).toContain('quietStateCopy.record.aiFailed')
    expect(recordSource).toContain('quietStateCopy.record.saveFailedDescription')
    expect(photoListSource).not.toContain('role="alert"')
    expect(photoListSource).toContain('role="status"')
    expect(recordSource).toMatch(/aiError \?[\s\S]+role="alert"/)
    expect(recordSource).toMatch(/formErrorMessage \?[\s\S]+role="alert"/)
    expect(recordSource).toMatch(/fieldErrors\.title \?[\s\S]+id="memory-title-error"/)
    expect(recordSource).toMatch(/fieldErrors\.imageIds \?[\s\S]+id="memory-photo-error"/)
    expect(recordSource).not.toContain("router.push('/record')")
  })

  it('locks manual content during generation and preserves AI provenance across retry failure', () => {
    expect(recordSource).toContain(
      'const [hasAiGeneratedContent, setHasAiGeneratedContent] = useState(false)',
    )
    expect(recordSource).not.toContain('setHasAiGeneratedContent(false)')
    expect(recordSource).toContain('setHasAiGeneratedContent(true)')
    expect(recordSource).toContain('ai_generated: hasAiGeneratedContent')
    expect(recordSource).toMatch(/id="memory-title"[\s\S]+disabled=\{aiStatus === 'generating'\}/)
    expect(recordSource).toMatch(/id="memory-body"[\s\S]+disabled=\{aiStatus === 'generating'\}/)
  })

  it('records timing conditions and evidence-safety policy for the PR', () => {
    expect(qaNoteSource).toContain('core AI path')
    expect(qaNoteSource).toContain('AI skip / manual save path')
    expect(qaNoteSource).toContain('first consent path')
    expect(qaNoteSource).toContain('failure recovery path')
    expect(qaNoteSource).toContain('Synthetic stopwatch pass: 2579ms / 30s')
    expect(qaNoteSource).toContain('Synthetic stopwatch pass: 1291ms / 30s')
    expect(qaNoteSource).toContain('Synthetic stopwatch pass: 1805ms / 60s')
    expect(qaNoteSource).toContain('Static pass')
    expect(stopwatchScriptSource).toContain("evidence: 'synthetic-only'")
    expect(stopwatchScriptSource).not.toContain("storage_key: 'uploads/")
    expect(qaNoteSource).toContain('ISSUE-059')
    expect(qaNoteSource).toContain('実写真、画像 URL、presigned URL、storage_key 実値')
    expect(qaNoteSource).toContain('prompt、AI 生成本文は載せない')
  })
})
