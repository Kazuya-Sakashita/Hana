import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/server/db/prisma'
import {
  childAccessStatus as readRlsChildAccessStatus,
  withChildOwnerScope,
} from '@/server/db/child-owner-scope'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ChildOwnerScopeMode = 'route' | 'rls'
export type ChildAccessStatus = 'owned' | 'foreign' | 'missing'

export type ChildPersistenceScope = {
  transaction: Prisma.TransactionClient
  accessStatus: (childId: string) => Promise<ChildAccessStatus>
}

type ChildOwnerEnvironment = {
  [key: string]: string | undefined
  CHILD_DATABASE_URL?: string
  CHILD_OWNER_SCOPE_MODE?: string
}

export function resolveChildOwnerScopeMode(
  environment: ChildOwnerEnvironment = process.env,
): ChildOwnerScopeMode {
  const mode = environment.CHILD_OWNER_SCOPE_MODE
  if (mode === undefined || mode === '' || mode === 'route') return 'route'
  if (mode !== 'rls') throw new Error('invalid_child_owner_scope_mode')
  if (!environment.CHILD_DATABASE_URL) {
    throw new Error('child_database_url_required_for_rls')
  }
  return 'rls'
}

export async function withChildPersistence<T>(
  userId: string,
  operation: (scope: ChildPersistenceScope) => Promise<T>,
): Promise<T> {
  if (!UUID_PATTERN.test(userId)) throw new Error('invalid_child_owner_scope')

  if (resolveChildOwnerScopeMode() === 'rls') {
    return withChildOwnerScope(userId, (transaction) =>
      operation({
        transaction,
        accessStatus: (childId) => readRlsChildAccessStatus(transaction, childId),
      }),
    )
  }

  return prisma.$transaction((transaction) =>
    operation({
      transaction,
      accessStatus: async (childId) => {
        const child = await transaction.child.findFirst({
          where: { id: childId, deletedAt: null },
          select: { userId: true },
        })
        if (!child) return 'missing'
        return child.userId === userId ? 'owned' : 'foreign'
      },
    }),
  )
}
