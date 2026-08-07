import type { Prisma } from '@prisma/client'

const IMAGE_LOCK_PREFIX = 'hana:image:'

export async function lockImageAccess(
  transaction: Prisma.TransactionClient,
  imageIds: string[],
): Promise<void> {
  const sortedImageIds = [...new Set(imageIds)].sort()
  for (const imageId of sortedImageIds) {
    await transaction.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${`${IMAGE_LOCK_PREFIX}${imageId}`}, 0))
    `
  }
}

export async function tryLockImageAccess(
  transaction: Prisma.TransactionClient,
  imageId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(
      hashtextextended(${`${IMAGE_LOCK_PREFIX}${imageId}`}, 0)
    ) AS locked
  `
  return rows[0]?.locked === true
}
