import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const surfacesSource = readFileSync(
  new URL('../../../src/components/product/surfaces.tsx', import.meta.url),
  'utf8',
)
const textareaSource = readFileSync(
  new URL('../../../src/components/ui/textarea.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-078-record-lp-app-alignment.md', import.meta.url),
  'utf8',
)

describe('ISSUE-078 record LP-App visual alignment', () => {
  it('uses keepsake photo primitives for selected and unselected record states', () => {
    expect(recordSource).toContain('PhotoMat')
    expect(recordSource).toContain('PhotoInner')
    expect(recordSource).toContain('PhotoPlaceholder')
    expect(recordSource).toContain('data-testid="record-photo-mat-selected"')
    expect(recordSource).toContain('data-testid="record-photo-placeholder"')
    expect(recordSource).toContain('icon={ImagePlus}')
    expect(recordSource).not.toContain("import { Camera } from 'lucide-react'")
    expect(surfacesSource).toContain(
      "Omit<React.ComponentProps<typeof PhotoMat>, 'children' | 'title'>",
    )
  })

  it('connects decision, AI, preview, and secondary edits to paper primitives', () => {
    expect(recordSource).toContain('<PaperSlip')
    expect(recordSource).toContain('data-testid="record-decision-cue"')
    expect(recordSource).toContain('data-testid="record-ai-decision"')
    expect(recordSource).toContain('<KeepsakePreview')
    expect(recordSource).toContain('data-testid="record-story-preview"')
    expect(recordSource).toContain('PaperSlip className="px-4 py-3"')
    expect(recordSource).toContain('data-testid="record-secondary-edits"')
  })

  it('uses shared Textarea and keeps the bottom-sheet 30 second contract', () => {
    expect(recordSource).toContain("import { Textarea } from '@/components/ui/textarea'")
    expect(recordSource).toContain('<Textarea')
    expect(textareaSource).toContain('bg-paper-slip')
    expect(textareaSource).toContain('text-base')
    expect(textareaSource).toContain('focus-visible:ring-2')
    expect(recordSource).toContain('data-testid="record-bottom-sheet"')
    expect(recordSource).toContain('sticky bottom-0')
    expect(recordSource).toContain('data-testid="record-bottom-sheet-footer"')
    expect(recordSource).toContain('pb-[calc(env(safe-area-inset-bottom)+1rem)]')
  })

  it('keeps quiet icon language and avoids sakura as step active or primary CTA', () => {
    expect(recordSource).toContain('QuietIcon')
    expect(recordSource).toContain('function StepPill')
    expect(recordSource).toContain('border-leaf/35 bg-paper-slip text-leaf-deep')
    expect(recordSource).not.toContain('border-sakura/40 bg-paper-slip text-sakura-deep')
    expect(recordSource).not.toContain('focus-visible:border-sakura')
    expect(recordSource).toContain('AI を使わずに 書く')
    expect(recordSource).toContain('このまま 残す')
  })

  it('records local scope, acceptance, and evidence-safety boundaries', () => {
    expect(issueSource).toContain('github_issue: 175')
    expect(issueSource).toContain('status: done')
    expect(issueSource).toContain('API / DB / Auth / Storage / OpenAPI の変更')
    expect(issueSource).toContain(
      '写真 upload / confirm / AI generate / save の処理順や送信項目は変更しない',
    )
    expect(issueSource).toContain(
      'Evidence に実写真、画像 URL、signed URL、`storage_key`、prompt、AI 生成本文、メール',
    )
  })
})
