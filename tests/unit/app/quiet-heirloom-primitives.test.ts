import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const surfacesSource = readFileSync(
  new URL('../../../src/components/product/surfaces.tsx', import.meta.url),
  'utf8',
)
const iconsSource = readFileSync(
  new URL('../../../src/components/product/icons.tsx', import.meta.url),
  'utf8',
)
const textareaSource = readFileSync(
  new URL('../../../src/components/ui/textarea.tsx', import.meta.url),
  'utf8',
)
const dialogSource = readFileSync(
  new URL('../../../src/components/ui/dialog.tsx', import.meta.url),
  'utf8',
)
const toastSource = readFileSync(
  new URL('../../../src/components/ui/toast.tsx', import.meta.url),
  'utf8',
)
const issueSource = readFileSync(
  new URL('../../../docs/issues/ISSUE-077-keepsake-primitives-icon-language.md', import.meta.url),
  'utf8',
)

describe('ISSUE-077 Quiet Heirloom primitives and icon language', () => {
  it('adds reusable keepsake photo and paper primitives before screen-level polish', () => {
    expect(surfacesSource).toContain('export function PhotoMat')
    expect(surfacesSource).toContain('export function PhotoInner')
    expect(surfacesSource).toContain('export function PhotoPlaceholder')
    expect(surfacesSource).toContain('export function PaperSlip')
    expect(surfacesSource).toContain('export function KeepsakePreview')
    expect(surfacesSource).toContain('photo-mat')
    expect(surfacesSource).toContain('rounded-[var(--radius-photo-mat)]')
    expect(surfacesSource).toContain('rounded-[var(--radius-photo-inner)]')
    expect(surfacesSource).toContain('rounded-[var(--radius-paper-slip)]')
    expect(surfacesSource).toContain('QuietIcon')
  })

  it('centralizes quiet lucide icon tone, stroke, active, and fill rules', () => {
    expect(iconsSource).toContain("import type { LucideIcon } from 'lucide-react'")
    expect(iconsSource).toContain('export function QuietIcon')
    expect(iconsSource).toContain('export function QuietIconButton')
    expect(iconsSource).toContain('strokeWidth={active ? 1.9 : iconStrokeWidth[size]}')
    expect(iconsSource).toContain('sm: 1.75')
    expect(iconsSource).toContain('display: 1.55')
    expect(iconsSource).toContain("favorite: 'text-ink-tertiary'")
    expect(iconsSource).toContain(
      "const toneClass = tone === 'favorite' && active ? 'text-sakura-deep' : iconToneClasses[tone]",
    )
    expect(iconsSource).toContain("primary: 'text-leaf-deep dark:text-leaf'")
    expect(iconsSource).toContain(
      "const fill = tone === 'favorite' && active ? 'currentColor' : 'none'",
    )
    expect(iconsSource).toContain('fill={fill}')
    expect(iconsSource).not.toContain('fillOnActive')
    expect(iconsSource).toContain('decorative: false')
    expect(iconsSource).toContain('label: string')
    expect(iconsSource).toContain('tap-target')
    expect(iconsSource).toContain('size-11')
  })

  it('adds a paper-slip textarea and warm dialog overlay', () => {
    expect(textareaSource).toContain('export { Textarea }')
    expect(textareaSource).toContain('bg-paper-slip')
    expect(textareaSource).toContain('border-hairline')
    expect(textareaSource).toContain('rounded-[var(--radius-paper-slip)]')
    expect(textareaSource).toContain('text-base')
    expect(textareaSource).toContain('focus-visible:ring-2')
    expect(dialogSource).not.toContain('bg-black/40')
    expect(dialogSource).toContain('bg-[rgba(58,38,30,0.26)]')
    expect(dialogSource).not.toContain('backdrop-blur')
  })

  it('keeps toast close as an accessible icon button with 44px target', () => {
    expect(toastSource).toContain('QuietIconButton')
    expect(toastSource).toContain('icon={X}')
    expect(toastSource).toContain('label="toast を とじる"')
    expect(toastSource).not.toContain('px-2 py-1 text-xs')
    expect(toastSource).not.toContain('>とじる<')
  })

  it('keeps ISSUE-077 scoped away from API, storage, and screen redesign', () => {
    expect(issueSource).toContain('Home / Record / Album / Memory Detail の画面構成変更')
    expect(issueSource).toContain('BottomNav の中央 action 再設計')
    expect(issueSource).toContain('API / DB / Auth / Storage / OpenAPI の変更')
    expect(issueSource).toContain('screenshot / PR body に実写真')
  })
})
