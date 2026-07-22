import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dialogSource = readFileSync(
  new URL('../../../src/components/ui/dialog.tsx', import.meta.url),
  'utf8',
)
const recordSource = readFileSync(
  new URL('../../../src/app/record/page.tsx', import.meta.url),
  'utf8',
)
const memoryActionsSource = readFileSync(
  new URL('../../../src/components/memory-actions.tsx', import.meta.url),
  'utf8',
)

describe('dialog accessibility foundation', () => {
  it('centralizes dialog semantics, keyboard handling, and body scroll lock', () => {
    expect(dialogSource).toContain('role="dialog"')
    expect(dialogSource).toContain('aria-modal="true"')
    expect(dialogSource).toContain('aria-labelledby={titleId}')
    expect(dialogSource).toContain('aria-describedby={descriptionId}')
    expect(dialogSource).toContain("event.key === 'Escape'")
    expect(dialogSource).toContain('if (!pending) onClose()')
    expect(dialogSource).toContain("event.key !== 'Tab'")
    expect(dialogSource).toContain('document.body.style.overflow =')
    expect(dialogSource).toContain("document.body.style.overflow = 'hidden'")
    expect(dialogSource).toContain('previousOverflow')
    expect(dialogSource).toContain('getFocusableElements')
  })

  it('migrates existing dialogs to the shared foundation', () => {
    const callers = `${recordSource}\n${memoryActionsSource}`
    const usages = callers.match(/<AccessibleDialog/g) ?? []

    expect(recordSource).toContain("from '@/components/ui/dialog'")
    expect(memoryActionsSource).toContain("from '@/components/ui/dialog'")
    expect(usages).toHaveLength(3)
    expect(recordSource).not.toContain('role="dialog"')
    expect(memoryActionsSource).not.toContain('role="dialog"')
  })

  it('keeps stable title and description associations for every current dialog', () => {
    const callers = `${recordSource}\n${memoryActionsSource}`

    for (const id of ['ai-consent', 'cancel-confirm', 'delete-confirm']) {
      expect(callers).toContain(`titleId="${id}-title"`)
      expect(callers).toContain(`descriptionId="${id}-description"`)
      expect(callers).toContain(`id="${id}-title"`)
      expect(callers).toContain(`id="${id}-description"`)
    }
  })
})
