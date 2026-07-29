import { describe, expect, it, vi } from 'vitest'
import { focusFirstFormError } from '@/lib/ui/form-error-focus'

describe('focusFirstFormError', () => {
  it('focuses the first invalid field in the declared visual order', () => {
    const titleFocus = vi.fn()
    const dateFocus = vi.fn()
    const fallbackFocus = vi.fn()

    const focusedField = focusFirstFormError({
      errors: { recordedAt: '日付を確認してください', title: 'タイトルを入力してください' },
      fieldOrder: ['title', 'recordedAt'] as const,
      fieldTargets: {
        title: { focus: titleFocus },
        recordedAt: { focus: dateFocus },
      },
      fallbackTarget: { focus: fallbackFocus },
    })

    expect(focusedField).toBe('title')
    expect(titleFocus).toHaveBeenCalledOnce()
    expect(dateFocus).not.toHaveBeenCalled()
    expect(fallbackFocus).not.toHaveBeenCalled()
  })

  it('focuses the error summary when the first invalid field has no available target', () => {
    const fallbackFocus = vi.fn()

    const focusedField = focusFirstFormError({
      errors: { imageIds: '写真を確認してください' },
      fieldOrder: ['imageIds'] as const,
      fieldTargets: { imageIds: null },
      fallbackTarget: { focus: fallbackFocus },
    })

    expect(focusedField).toBeNull()
    expect(fallbackFocus).toHaveBeenCalledOnce()
  })

  it('focuses the error summary for a non-field blocking error', () => {
    const fallbackFocus = vi.fn()

    const focusedField = focusFirstFormError({
      errors: {},
      fieldOrder: ['title'] as const,
      fieldTargets: {},
      fallbackTarget: { focus: fallbackFocus },
    })

    expect(focusedField).toBeNull()
    expect(fallbackFocus).toHaveBeenCalledOnce()
  })
})
