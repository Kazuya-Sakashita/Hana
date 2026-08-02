// @vitest-environment jsdom

import { act, createElement, createRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RecordPhotoList,
  type RecordPhotoListItem,
} from '@/features/memories/components/record-photo-list'

const initialItems: RecordPhotoListItem[] = [
  { clientId: 'synthetic-a', status: 'done' },
  { clientId: 'synthetic-b', status: 'failed' },
  { clientId: 'synthetic-c', status: 'uploading' },
]

describe('RecordPhotoList', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  function render(
    items: readonly RecordPhotoListItem[],
    callbacks: {
      onMove?: (clientId: string, direction: 'up' | 'down') => void
      onRemove?: (clientId: string) => void
      onRetry?: (clientId: string) => void
      onAnnounce?: (message: string) => void
    } = {},
  ) {
    act(() => {
      root.render(
        createElement(RecordPhotoList, {
          items,
          onMove: callbacks.onMove ?? vi.fn(),
          onRemove: callbacks.onRemove ?? vi.fn(),
          onRetry: callbacks.onRetry ?? vi.fn(),
          onAnnounce: callbacks.onAnnounce,
        }),
      )
    })
  }

  function button(label: string) {
    const result = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    if (!result) throw new Error(`button not found: ${label}`)
    return result
  }

  it('exposes ordered list position, visible status and boundary controls', () => {
    render(initialItems)

    expect(document.querySelector('ol')?.getAttribute('aria-label')).toContain('上から')
    expect(document.querySelectorAll('ol > li')).toHaveLength(3)
    expect(container.textContent).toContain('写真 2／3')
    expect(container.textContent).toContain('入力した内容はそのままです')
    expect(button('写真1を上へ移動').disabled).toBe(true)
    expect(button('写真1を下へ移動').disabled).toBe(false)
    expect(button('写真3を下へ移動').disabled).toBe(true)
    expect(button('写真2をもういちど送る').textContent).toContain('もういちど送る')
    expect(document.querySelector('[role="alert"]')).toBeNull()
    expect(document.querySelectorAll('[role="status"][aria-live="polite"]')).toHaveLength(1)
  })

  it('uses callbacks without drag-only interaction and announces a move', () => {
    const onMove = vi.fn()
    const onAnnounce = vi.fn()
    function Harness() {
      const [announcement, setAnnouncement] = useState('')
      return createElement(RecordPhotoList, {
        items: initialItems,
        onMove,
        onRemove: vi.fn(),
        onRetry: vi.fn(),
        onAnnounce: (message) => {
          onAnnounce(message)
          setAnnouncement(message)
        },
        statusAnnouncement: announcement,
      })
    }
    act(() => root.render(createElement(Harness)))

    act(() => button('写真2を上へ移動').click())

    expect(onMove).toHaveBeenCalledWith('synthetic-b', 'up')
    expect(onAnnounce).toHaveBeenCalledWith('写真2を1番目に移動しました。')
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      '写真2を1番目に移動しました。',
    )
  })

  it('uses the same polite region for parent-provided upload announcements', () => {
    act(() => {
      root.render(
        createElement(RecordPhotoList, {
          items: initialItems,
          onMove: vi.fn(),
          onRemove: vi.fn(),
          onRetry: vi.fn(),
          statusAnnouncement: '写真3を送っています。',
        }),
      )
    })

    expect(document.querySelectorAll('[role="status"]')).toHaveLength(1)
    expect(document.querySelector('[role="status"]')?.textContent).toBe('写真3を送っています。')
  })

  it('keeps focus on the same photo after its parent applies a move', () => {
    function Harness() {
      const [items, setItems] = useState(initialItems)
      return createElement(RecordPhotoList, {
        items,
        onMove: () => setItems(([first, second, third]) => [second!, first!, third!]),
        onRemove: vi.fn(),
        onRetry: vi.fn(),
      })
    }
    act(() => root.render(createElement(Harness)))

    act(() => button('写真2を上へ移動').click())

    expect(document.activeElement?.getAttribute('aria-label')).toBe('写真1を下へ移動')
  })

  it('moves focus to the next photo after removal and retries only the failed photo', () => {
    const onRetry = vi.fn()
    let items = [...initialItems]
    const onRemove = (clientId: string) => {
      items = items.filter((item) => item.clientId !== clientId)
      render(items, { onRemove, onRetry })
    }
    render(items, { onRemove, onRetry })

    act(() => button('写真2をもういちど送る').click())
    expect(onRetry).toHaveBeenCalledWith('synthetic-b')

    act(() => button('写真2を削除').click())
    expect(document.activeElement?.getAttribute('aria-label')).toBe('写真2を削除')
  })

  it('returns focus to the supplied empty-state control after the last removal', () => {
    const emptyFocusRef = createRef<HTMLButtonElement>()
    const onlyItem = [initialItems[0]!]
    const onRemove = () => {
      act(() => {
        root.render(
          createElement(
            'div',
            null,
            createElement('button', { ref: emptyFocusRef }, '写真をえらぶ'),
            createElement(RecordPhotoList, {
              items: [],
              onMove: vi.fn(),
              onRemove,
              onRetry: vi.fn(),
              emptyFocusRef,
            }),
          ),
        )
      })
    }
    act(() => {
      root.render(
        createElement(
          'div',
          null,
          createElement('button', { ref: emptyFocusRef }, '写真をえらぶ'),
          createElement(RecordPhotoList, {
            items: onlyItem,
            onMove: vi.fn(),
            onRemove,
            onRetry: vi.fn(),
            emptyFocusRef,
          }),
        ),
      )
    })

    act(() => button('写真1を削除').click())

    expect(document.activeElement).toBe(emptyFocusRef.current)
  })
})
