'use client'

import { useState, type ReactElement } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AccessibleDialog } from '@/components/ui/dialog'
import {
  memoriesQueryKey,
  useDeleteMemoryMutation,
  useUpdateMemoryMutation,
} from '@/features/memories/client/use-memories'
import { isApiProblemError } from '@/lib/api/error'
import {
  optimisticRemoveMemoryFromLists,
  optimisticUpdateMemoryInLists,
} from '@/lib/perf/optimistic'
import { useToast } from '@/components/ui/toast'
import { deleteMemoryDescription, quietStateCopy } from '@/lib/ui/quiet-state-copy'

// ISSUE-057: Detail actions are a quiet operation band below the story.

interface Props {
  memoryId: string
  childName: string
  initialIsFavorite: boolean
}

type DialogState = { open: boolean; pending: boolean }

export function MemoryActions({ memoryId, childName, initialIsFavorite }: Props) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const updateMemoryMutation = useUpdateMemoryMutation()
  const deleteMemoryMutation = useDeleteMemoryMutation()
  const { showToast } = useToast()
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [deleteDialog, setDeleteDialog] = useState<DialogState>({ open: false, pending: false })

  async function toggleFavorite() {
    const previous = isFavorite
    const next = !isFavorite
    setIsFavorite(next)
    await queryClient.cancelQueries({ queryKey: memoriesQueryKey })
    const rollback = optimisticUpdateMemoryInLists(queryClient, memoryId, (memory) => ({
      ...memory,
      is_favorite: next,
      updated_at: new Date().toISOString(),
    }))

    try {
      const updated = await updateMemoryMutation.mutateAsync({
        memoryId,
        body: { is_favorite: next },
      })
      setIsFavorite(updated.is_favorite)
      router.refresh()
    } catch (e) {
      setIsFavorite(previous)
      rollback()
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
      if (isApiProblemError(e) && e.reason === 'unauthorized') {
        router.push('/sign-in')
        return
      }
      showToast({
        title: quietStateCopy.memoryDetail.favoriteFailedTitle,
        description: quietStateCopy.memoryDetail.favoriteFailedDescription,
      })
    }
  }

  async function confirmDelete() {
    setDeleteDialog({ open: false, pending: false })
    await queryClient.cancelQueries({ queryKey: memoriesQueryKey })
    const rollback = optimisticRemoveMemoryFromLists(queryClient, memoryId)
    router.push('/album')

    try {
      await deleteMemoryMutation.mutateAsync(memoryId)
      router.refresh()
    } catch (e) {
      rollback()
      void queryClient.invalidateQueries({ queryKey: memoriesQueryKey })
      if (isApiProblemError(e) && e.reason === 'unauthorized') {
        router.push('/sign-in')
        return
      }
      showToast({
        title: quietStateCopy.memoryDetail.deleteFailedTitle,
        description: quietStateCopy.memoryDetail.deleteFailedDescription,
      })
    }
  }

  return (
    <>
      <section aria-label="ページのしるしと操作" className="border-hairline mt-10 border-t pt-6">
        <div className="grid grid-cols-2 gap-2">
          <ActionGlyph
            label="しるし"
            filled={isFavorite}
            pressed={isFavorite}
            disabled={updateMemoryMutation.isPending}
            onClick={toggleFavorite}
            icon={<Heart className="size-5" fill={isFavorite ? 'currentColor' : 'none'} />}
          />
          <ActionGlyph
            label="けす"
            icon={<Trash2 className="size-5" />}
            onClick={() => setDeleteDialog({ open: true, pending: false })}
          />
        </div>

        <p id="memory-edit-note" className="text-ink-tertiary mt-3 text-center text-xs">
          この画面では、しるしと削除だけ操作できます。
        </p>
      </section>

      {deleteDialog.open ? (
        <DeleteConfirmDialog
          childName={childName}
          pending={deleteMemoryMutation.isPending || deleteDialog.pending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteDialog({ open: false, pending: false })}
        />
      ) : null}
    </>
  )
}

function ActionGlyph({
  label,
  icon,
  filled,
  pressed,
  disabled,
  onClick,
}: {
  label: string
  icon: ReactElement<{ className?: string }>
  filled?: boolean
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={typeof pressed === 'boolean' ? pressed : undefined}
      disabled={disabled}
      className="text-ink-secondary hover:bg-warm disabled:text-ink-tertiary tap-target ease-organic flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      <span
        className={`flex size-8 items-center justify-center ${filled ? 'text-sakura' : ''}`}
        aria-hidden="true"
      >
        {icon}
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
    <AccessibleDialog
      titleId="delete-confirm-title"
      descriptionId="delete-confirm-description"
      pending={pending}
      initialFocusId="delete-confirm-cancel"
      onClose={onCancel}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <CardTitle id="delete-confirm-title" className="font-serif text-xl">
            {quietStateCopy.memoryDetail.deleteConfirmTitle}
          </CardTitle>
          <CardDescription id="delete-confirm-description" className="leading-narrative mt-2">
            {deleteMemoryDescription(childName)}
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
            {pending
              ? quietStateCopy.memoryDetail.deletePending
              : quietStateCopy.memoryDetail.deleteConfirmAction}
          </Button>
          <Button
            id="delete-confirm-cancel"
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
    </AccessibleDialog>
  )
}
