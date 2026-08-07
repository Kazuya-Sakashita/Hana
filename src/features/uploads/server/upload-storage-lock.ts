import type { Prisma } from '@prisma/client'

const UPLOAD_STORAGE_LOCK_PREFIX = 'hana:upload-storage:'

export async function acquireUploadStorageLock(
  transaction: Prisma.TransactionClient,
  storageKey: string,
): Promise<void> {
  await transaction.$queryRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`${UPLOAD_STORAGE_LOCK_PREFIX}${storageKey}`}, 0)
    )::text
  `
}

export async function tryAcquireUploadStorageLock(
  transaction: Prisma.TransactionClient,
  storageKey: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(
      hashtextextended(${`${UPLOAD_STORAGE_LOCK_PREFIX}${storageKey}`}, 0)
    ) AS locked
  `
  return rows[0]?.locked === true
}
