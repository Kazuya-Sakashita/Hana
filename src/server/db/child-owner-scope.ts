import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ChildOwnerTransaction = Prisma.TransactionClient
export type ChildAccessStatus = 'owned' | 'foreign' | 'missing'

export async function withChildOwnerScope<T>(
  userId: string,
  operation: (transaction: ChildOwnerTransaction) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId)) throw new Error('invalid_child_owner_scope')

  return prisma.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe('SET LOCAL ROLE hana_child_owner')
    await transaction.$queryRaw`SELECT set_config('hana.current_user_id', ${userId}, true)`
    return operation(transaction)
  })
}

export async function childAccessStatus(
  transaction: ChildOwnerTransaction,
  childId: string,
): Promise<ChildAccessStatus> {
  const rows = await transaction.$queryRaw<Array<{ accessStatus: string }>>`
    SELECT public.hana_child_access_status(${childId}::uuid) AS "accessStatus"
  `
  const status = rows[0]?.accessStatus
  if (status === 'owned' || status === 'foreign' || status === 'missing') return status
  throw new Error('invalid_child_access_status')
}
