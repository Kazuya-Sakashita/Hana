'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Heart, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { QuietIconButton } from '@/components/product/icons'
import { Button } from '@/components/ui/button'
import { AccessibleDialog } from '@/components/ui/dialog'
import { StatePanel } from '@/components/product/surfaces'
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
      <section
        aria-labelledby="memory-actions-title"
        className="border-hairline mt-10 border-t pt-5"
        data-testid="memory-quiet-action-band"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 id="memory-actions-title" className="meta-label">
              ページの操作
            </h2>
            <p id="memory-edit-note" className="text-ink-tertiary mt-2 text-xs leading-narrative">
              この画面では、しるしと削除だけ操作できます。
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <QuietIconButton
              icon={Heart}
              tone="favorite"
              active={isFavorite}
              label={isFavorite ? 'しるしを はずす' : 'しるしを つける'}
              aria-pressed={isFavorite}
              aria-describedby="memory-edit-note"
              disabled={updateMemoryMutation.isPending}
              onClick={toggleFavorite}
            />
            <QuietIconButton
              icon={Trash2}
              tone="warning"
              label="このページを けす"
              aria-describedby="memory-edit-note"
              onClick={() => setDeleteDialog({ open: true, pending: false })}
            />
          </div>
        </div>
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
      <StatePanel className="w-full max-w-md">
        <div className="text-center">
          <h2 id="delete-confirm-title" className="font-serif text-xl">
            {quietStateCopy.memoryDetail.deleteConfirmTitle}
          </h2>
          <p
            id="delete-confirm-description"
            className="text-ink-secondary leading-narrative mt-3 text-sm"
          >
            {deleteMemoryDescription(childName)}
          </p>
        </div>
        <div className="mt-7 flex flex-col gap-3">
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
        </div>
      </StatePanel>
    </AccessibleDialog>
  )
}
