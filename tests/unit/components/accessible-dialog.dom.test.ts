// @vitest-environment jsdom

import { act, createElement, type ComponentProps, type ComponentType, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccessibleDialog } from '@/components/ui/dialog'

type TestDialogProps = Omit<ComponentProps<typeof AccessibleDialog>, 'children'> & {
  children?: ReactNode
}

const TestDialog = AccessibleDialog as ComponentType<TestDialogProps>

describe('AccessibleDialog DOM behavior', () => {
  let container: HTMLDivElement
  let opener: HTMLButtonElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('CSS', { escape: (value: string) => value })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)

    opener = document.createElement('button')
    opener.textContent = '同意設定を開く'
    document.body.append(opener)
    opener.focus()

    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    opener.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function renderDialog({
    pending = false,
    onClose = vi.fn(),
  }: {
    pending?: boolean
    onClose?: () => void
  } = {}) {
    act(() => {
      root.render(
        createElement(
          TestDialog,
          {
            titleId: 'test-dialog-title',
            descriptionId: 'test-dialog-description',
            initialFocusId: 'test-dialog-cancel',
            pending,
            onClose,
          },
          createElement('h2', { id: 'test-dialog-title' }, 'AI利用の同意を取り消しますか？'),
          createElement('p', { id: 'test-dialog-description' }, '既存記録は削除されません。'),
          createElement(
            'button',
            { id: 'test-dialog-cancel', type: 'button', 'aria-disabled': pending },
            '同意をそのままにする',
          ),
          createElement(
            'button',
            { id: 'test-dialog-confirm', type: 'button', 'aria-disabled': pending },
            '同意を取り消す',
          ),
        ),
      )
    })
  }

  it('associates its accessible name and description and focuses the safe action', () => {
    renderDialog()

    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    expect(dialog?.getAttribute('aria-labelledby')).toBe('test-dialog-title')
    expect(dialog?.getAttribute('aria-describedby')).toBe('test-dialog-description')
    expect(document.activeElement?.id).toBe('test-dialog-cancel')
  })

  it('closes on Escape, restores focus and traps Tab within the dialog', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    const cancel = document.querySelector<HTMLButtonElement>('#test-dialog-cancel')!
    const confirm = document.querySelector<HTMLButtonElement>('#test-dialog-confirm')!

    confirm.focus()
    act(() => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
    })
    expect(document.activeElement).toBe(cancel)

    cancel.focus()
    act(() => {
      cancel.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      )
    })
    expect(document.activeElement).toBe(confirm)

    act(() => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()

    act(() => root.unmount())
    expect(document.activeElement).toBe(opener)
    root = createRoot(container)
  })

  it('keeps focus inside across pending and failure transitions', () => {
    const onClose = vi.fn()
    renderDialog({ onClose })
    let dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    let confirm = document.querySelector<HTMLButtonElement>('#test-dialog-confirm')!
    confirm.focus()

    renderDialog({ pending: true, onClose })
    dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    confirm = document.querySelector<HTMLButtonElement>('#test-dialog-confirm')!

    expect(dialog.getAttribute('aria-busy')).toBe('true')
    expect(confirm.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(confirm)
    act(() => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).not.toHaveBeenCalled()

    renderDialog({ onClose })
    confirm = document.querySelector<HTMLButtonElement>('#test-dialog-confirm')!
    expect(document.activeElement).toBe(confirm)
    act(() => {
      confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
