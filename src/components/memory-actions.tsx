'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getBrowserApiClient } from '@/lib/api/browser-client'
import { isApiProblemError } from '@/lib/api/error'

// ISSUE-027: memory 詳細ページの interactive 部分のみ Client Component に切り出す。
// (favorite トグル / 削除確認ダイアログ / 削除完了オーバーレイ)

interface Props {
  memoryId: string
  childName: string
  initialIsFavorite: boolean
}

type DialogState = { open: boolean; pending: boolean }

export function MemoryActions({ memoryId, childName, initialIsFavorite }: Props) {
  const router = useRouter()
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [favPending, setFavPending] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<DialogState>({ open: false, pending: false })
  const [deleted, setDeleted] = useState(false)

  async function toggleFavorite() {
    setFavPending(true)
    const next = !isFavorite
    const client = getBrowserApiClient()
    try {
      const res = await client.PUT('/memories/{memoryId}', {
        params: { path: { memoryId } },
        body: { is_favorite: next },
      })
      if (res.data) setIsFavorite(next)
    } catch {
      // 失敗時はサイレント (UX を壊さない)。次の操作で再試行可能
    } finally {
      setFavPending(false)
    }
  }

  async function confirmDelete() {
    setDeleteDialog({ open: true, pending: true })
    const client = getBrowserApiClient()
    try {
      await client.DELETE('/memories/{memoryId}', {
        params: { path: { memoryId } },
      })
      setDeleted(true)
      setTimeout(() => router.push('/album'), 1500)
    } catch (e) {
      setDeleteDialog({ open: true, pending: false })
      if (isApiProblemError(e) && e.reason === 'unauthorized') {
        router.push('/sign-in')
      }
    }
  }

  return (
    <>
      <div className="mt-12 flex items-center justify-around">
        <ActionGlyph
          label="おきにいり"
          filled={isFavorite}
          disabled={favPending}
          onClick={toggleFavorite}
          glyph="❀"
        />
        <ActionGlyph label="ことばを なおす" glyph="✎" disabled onClick={() => undefined} />
        <ActionGlyph
          label="けす"
          glyph="⋯"
          onClick={() => setDeleteDialog({ open: true, pending: false })}
        />
      </div>

      <p className="text-ink-tertiary mt-2 text-center text-xs">
        「ことばを なおす」は ちかぢか たいおう します。
      </p>

      {deleteDialog.open && !deleted ? (
        <DeleteConfirmDialog
          childName={childName}
          pending={deleteDialog.pending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteDialog({ open: false, pending: false })}
        />
      ) : null}

      {deleted ? <DeletedOverlay /> : null}
    </>
  )
}

function ActionGlyph({
  label,
  glyph,
  filled,
  disabled,
  onClick,
}: {
  label: string
  glyph: string
  filled?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-ink-secondary disabled:text-ink-tertiary flex flex-col items-center gap-1.5 px-3 py-2 disabled:cursor-not-allowed"
    >
      <span className={`text-2xl ${filled ? 'text-sakura' : ''}`} aria-hidden="true">
        {glyph}
      </span>
      <span className="text-xs">{label}</span>
    </button>
  )
}

function DeleteConfirmDialog({
  childName,
  pending,
  onConfirm,
  onCancel,
}: {
  childName: string
  pending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 py-6 sm:items-center"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-xl">このページを、けしますか</CardTitle>
          <CardDescription className="leading-narrative mt-2">
            {childName ? `${childName} ちゃんの こ` : 'こ'}のページは、けしてから 7にちは
            もどせます。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onConfirm}
            disabled={pending}
            className="text-amber w-full"
          >
            {pending ? 'けしています…' : 'けす'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={onCancel}
            disabled={pending}
            className="w-full"
          >
            やめる
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function DeletedOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="bg-canvas/95 fixed inset-0 z-50 flex items-center justify-center px-6 py-12 backdrop-blur-sm"
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle className="font-serif text-xl">このページを、けしました</CardTitle>
          <CardDescription className="mt-2">アルバムへ いどう しています…</CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
