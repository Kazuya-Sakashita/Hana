import type { Prisma, PrismaClient } from '@prisma/client'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'

export interface ConfirmedUnlinkedImageDeletionStorage {
  remove(keys: string[]): Promise<boolean>
}

export interface ConfirmedUnlinkedImageDeletionClaim {
  id: string
  userId: string
  storageKey: string
}

type ClaimResult<TSkipped> =
  | { kind: 'claimed'; claim: ConfirmedUnlinkedImageDeletionClaim }
  | { kind: 'skipped'; value: TSkipped }

export type ConfirmedUnlinkedImageDeletionResult<TSkipped> =
  | { kind: 'deleted' }
  | { kind: 'storage_failed' }
  | { kind: 'skipped'; value: TSkipped }

function storageKeys(storageKey: string): string[] {
  return [
    storageKey,
    deriveVariantKey(storageKey, 'thumbnail'),
    deriveVariantKey(storageKey, 'preview'),
  ]
}

export async function claimRemoveAndFinalizeUnlinkedImage<TSkipped>(
  prisma: PrismaClient,
  storage: ConfirmedUnlinkedImageDeletionStorage,
  imageId: string,
  claimLockedImage: (transaction: Prisma.TransactionClient) => Promise<ClaimResult<TSkipped>>,
): Promise<ConfirmedUnlinkedImageDeletionResult<TSkipped>> {
  const claimResult = await prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [imageId])
      return claimLockedImage(transaction)
    },
    { maxWait: 3_000, timeout: 5_000 },
  )
  if (claimResult.kind === 'skipped') return claimResult

  const { claim } = claimResult
  if (!(await storage.remove(storageKeys(claim.storageKey)))) {
    return { kind: 'storage_failed' }
  }

  await prisma.$transaction(
    async (transaction) => {
      await lockImageAccess(transaction, [claim.id])
      await transaction.image.deleteMany({
        where: {
          id: claim.id,
          userId: claim.userId,
          memoryId: null,
          deletedAt: { not: null },
        },
      })
    },
    { maxWait: 3_000, timeout: 5_000 },
  )

  return { kind: 'deleted' }
}
