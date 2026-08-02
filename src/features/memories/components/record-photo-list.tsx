'use client'

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { ArrowDown, ArrowUp, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type RecordPhotoStatus =
  | 'idle'
  | 'preparing'
  | 'uploading'
  | 'confirming'
  | 'done'
  | 'failed'

export interface RecordPhotoListItem {
  clientId: string
  status: RecordPhotoStatus
  preview?: ReactNode
  statusText?: string
  retryLabel?: string
  removeDisabled?: boolean
}

interface PendingFocus {
  clientId: string
  action: 'up' | 'down' | 'remove' | 'retry'
}

export interface RecordPhotoListProps {
  items: readonly RecordPhotoListItem[]
  onMove: (clientId: string, direction: 'up' | 'down') => void
  onRemove: (clientId: string) => void
  onRetry: (clientId: string) => void
  onAnnounce?: (message: string) => void
  statusAnnouncement?: string
  emptyFocusRef?: RefObject<HTMLElement | null>
  disabled?: boolean
}

const statusCopy: Record<RecordPhotoStatus, string> = {
  idle: '送信を待っています',
  preparing: '写真を準備しています',
  uploading: '写真を送っています',
  confirming: '保存を確認しています',
  done: '追加できました',
  failed: 'この写真を送れませんでした。入力した内容はそのままです。',
}

function controlKey(clientId: string, action: PendingFocus['action']) {
  return `${clientId}:${action}`
}

export function RecordPhotoList({
  items,
  onMove,
  onRemove,
  onRetry,
  onAnnounce,
  statusAnnouncement,
  emptyFocusRef,
  disabled = false,
}: RecordPhotoListProps) {
  const controlsRef = useRef(new Map<string, HTMLButtonElement>())
  const pendingFocusRef = useRef<PendingFocus | 'empty' | null>(null)

  useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    pendingFocusRef.current = null
    if (pending === 'empty') {
      emptyFocusRef?.current?.focus()
      return
    }
    controlsRef.current.get(controlKey(pending.clientId, pending.action))?.focus()
  }, [emptyFocusRef, items])

  function announce(message: string) {
    onAnnounce?.(message)
  }

  function rememberControl(
    clientId: string,
    action: PendingFocus['action'],
    element: HTMLButtonElement | null,
  ) {
    const key = controlKey(clientId, action)
    if (element) controlsRef.current.set(key, element)
    else controlsRef.current.delete(key)
  }

  function move(item: RecordPhotoListItem, index: number, direction: 'up' | 'down') {
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    const focusAction = nextIndex === 0 ? 'down' : nextIndex === items.length - 1 ? 'up' : direction
    pendingFocusRef.current = { clientId: item.clientId, action: focusAction }
    onMove(item.clientId, direction)
    const nextPosition = direction === 'up' ? index : index + 2
    announce(`写真${index + 1}を${nextPosition}番目に移動しました。`)
  }

  function remove(item: RecordPhotoListItem, index: number) {
    const nextItem = items[index + 1] ?? items[index - 1]
    pendingFocusRef.current = nextItem ? { clientId: nextItem.clientId, action: 'remove' } : 'empty'
    onRemove(item.clientId)
  }

  return (
    <div>
      <ol aria-label="選んだ写真。上から記録に並ぶ順番" className="space-y-3">
        {items.map((item, index) => {
          const position = index + 1
          const titleId = `ordered-photo-${item.clientId}-title`
          const statusId = `ordered-photo-${item.clientId}-status`
          return (
            <li
              key={item.clientId}
              aria-labelledby={titleId}
              aria-describedby={statusId}
              className="border-hairline bg-paper-slip rounded-2xl border p-3 shadow-soft"
            >
              <div className="flex min-w-0 items-start gap-3">
                {item.preview ? (
                  <div
                    aria-hidden="true"
                    className="bg-photo-mat size-20 shrink-0 overflow-hidden rounded-xl"
                  >
                    {item.preview}
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <p id={titleId} className="font-serif text-sm text-ink">
                    写真 {position}／{items.length}
                    {index === 0 ? (
                      <span className="bg-warm text-ink-secondary ml-2 rounded-full px-2 py-0.5 font-sans text-[10px]">
                        表紙
                      </span>
                    ) : null}
                  </p>
                  <p
                    id={statusId}
                    className={
                      item.status === 'failed'
                        ? 'mt-1 text-xs text-amber'
                        : 'mt-1 text-xs text-ink-secondary'
                    }
                  >
                    {item.statusText ?? statusCopy[item.status]}
                  </p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button
                  ref={(element) => rememberControl(item.clientId, 'up', element)}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || index === 0}
                  aria-label={`写真${position}を上へ移動`}
                  onClick={() => move(item, index, 'up')}
                >
                  <ArrowUp aria-hidden="true" />
                  上へ
                </Button>
                <Button
                  ref={(element) => rememberControl(item.clientId, 'down', element)}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disabled || index === items.length - 1}
                  aria-label={`写真${position}を下へ移動`}
                  onClick={() => move(item, index, 'down')}
                >
                  <ArrowDown aria-hidden="true" />
                  下へ
                </Button>
                {item.status === 'failed' ? (
                  <Button
                    ref={(element) => rememberControl(item.clientId, 'retry', element)}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    aria-label={`写真${position}を${item.retryLabel ?? 'もういちど送る'}`}
                    onClick={() => onRetry(item.clientId)}
                  >
                    <RotateCcw aria-hidden="true" />
                    {item.retryLabel ?? 'もういちど送る'}
                  </Button>
                ) : null}
                <Button
                  ref={(element) => rememberControl(item.clientId, 'remove', element)}
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={disabled || item.removeDisabled}
                  aria-label={`写真${position}を削除`}
                  onClick={() => remove(item, index)}
                >
                  <Trash2 aria-hidden="true" />
                  削除
                </Button>
              </div>
            </li>
          )
        })}
      </ol>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
    </div>
  )
}
