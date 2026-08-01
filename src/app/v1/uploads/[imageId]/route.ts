import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { isUuid } from '@/features/memories/server/parse'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { claimRemoveAndFinalizeUnlinkedImage } from '@/features/uploads/server/confirmed-unlinked-image-deletion'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'images'
const STORAGE_TIMEOUT_MS = 8_000

type Params = { params: Promise<{ imageId: string }> }

export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { imageId } = await params
    if (!isUuid(imageId)) throw problems.notFound('画像が見つかりません')

    const result = await claimRemoveAndFinalizeUnlinkedImage(
      prisma,
      {
        remove: async (keys) => {
          try {
            const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS)
            const removed = await createSupabaseAdminClient({ signal })
              .storage.from(BUCKET)
              .remove(keys)
            return !removed.error
          } catch {
            return false
          }
        },
      },
      imageId,
      async (transaction) => {
        const image = await transaction.image.findFirst({
          where: { id: imageId, userId: user.id },
          select: { id: true, storageKey: true, memoryId: true, deletedAt: true },
        })
        if (!image) throw problems.notFound('画像が見つかりません')
        if (image.memoryId !== null) throw problems.imageAlreadyLinked()
        if (!image.deletedAt) {
          const deleted = await transaction.image.updateMany({
            where: { id: image.id, userId: user.id, memoryId: null, deletedAt: null },
            data: { deletedAt: new Date() },
          })
          if (deleted.count !== 1) throw problems.imageAlreadyLinked()
        }
        return {
          kind: 'claimed',
          claim: { id: image.id, userId: user.id, storageKey: image.storageKey },
        }
      },
    )
    if (result.kind === 'storage_failed') throw problems.storageUnavailable()

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    return toProblemResponse(error)
  }
}
