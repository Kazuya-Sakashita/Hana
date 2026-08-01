import type { Prisma, PrismaClient } from '@prisma/client'
import { claimRemoveAndFinalizeUnlinkedImage } from '@/features/uploads/server/confirmed-unlinked-image-deletion'

export const CONFIRMED_UNLINKED_RETENTION_MS = 48 * 60 * 60 * 1000

export interface ConfirmedUnlinkedCleanupStorage {
  remove(keys: string[]): Promise<boolean>
}

export interface ConfirmedUnlinkedCleanupResult {
  mode: 'dry-run' | 'apply'
  scanned: number
  deleted: number
  protected: number
  failed: number
  pending: number
}

async function lockActiveProfile(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM profiles
    WHERE id = ${userId}::uuid
      AND access_blocked_at IS NULL
      AND deletion_requested_at IS NULL
    FOR UPDATE
  `
  return rows.length === 1
}

export async function runConfirmedUnlinkedCleanup(
  prisma: PrismaClient,
  storage: ConfirmedUnlinkedCleanupStorage,
  options: { apply: boolean; now?: Date; limit?: number },
): Promise<ConfirmedUnlinkedCleanupResult> {
  const now = options.now ?? new Date()
  const cutoff = new Date(now.getTime() - CONFIRMED_UNLINKED_RETENTION_MS)
  const candidateWhere: Prisma.ImageWhereInput = {
    memoryId: null,
    user: { accessBlockedAt: null, deletionRequestedAt: null },
    OR: [{ deletedAt: { not: null } }, { deletedAt: null, createdAt: { lte: cutoff } }],
  }
  const candidates = await prisma.image.findMany({
    where: candidateWhere,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(options.limit ?? 10, 1), 50),
  })
  const result: ConfirmedUnlinkedCleanupResult = {
    mode: options.apply ? 'apply' : 'dry-run',
    scanned: candidates.length,
    deleted: 0,
    protected: 0,
    failed: 0,
    pending: await prisma.image.count({ where: candidateWhere }),
  }
  if (!options.apply) return result

  for (const candidate of candidates) {
    try {
      const deletion = await claimRemoveAndFinalizeUnlinkedImage(
        prisma,
        storage,
        candidate.id,
        async (transaction) => {
          const image = await transaction.image.findUnique({ where: { id: candidate.id } })
          if (
            !image ||
            image.memoryId !== null ||
            (!image.deletedAt && image.createdAt > cutoff) ||
            !(await lockActiveProfile(transaction, image.userId))
          ) {
            return { kind: 'skipped', value: 'protected' as const }
          }

          if (!image.deletedAt) {
            const deleted = await transaction.image.updateMany({
              where: {
                id: image.id,
                userId: image.userId,
                memoryId: null,
                deletedAt: null,
                createdAt: { lte: cutoff },
              },
              data: { deletedAt: now },
            })
            if (deleted.count !== 1) {
              return { kind: 'skipped', value: 'protected' as const }
            }
          }
          return {
            kind: 'claimed',
            claim: { id: image.id, userId: image.userId, storageKey: image.storageKey },
          }
        },
      )
      if (deletion.kind === 'skipped') {
        result.protected += 1
        continue
      }
      if (deletion.kind === 'storage_failed') {
        result.failed += 1
        continue
      }
      result.deleted += 1
    } catch {
      result.failed += 1
    }
  }
  result.pending = await prisma.image.count({ where: candidateWhere })
  return result
}
