import type { Prisma } from '@prisma/client'

export function activeImageAccessWhere(userId?: string): Prisma.ImageWhereInput {
  const owner = userId ? { userId } : {}

  return {
    ...owner,
    deletedAt: null,
    OR: [
      { memoryId: null },
      {
        memory: {
          is: {
            ...owner,
            deletedAt: null,
          },
        },
      },
    ],
  }
}
