import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

declare global {
  var __childOwnerPrisma: PrismaClient | undefined
}

function createChildOwnerPrisma(): PrismaClient {
  const connectionString = process.env.CHILD_DATABASE_URL
  if (!connectionString) {
    throw new Error('CHILD_DATABASE_URL is not set. See docs/api-driven-development/db-setup.md')
  }
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
}

export function getChildOwnerPrisma(): PrismaClient {
  globalThis.__childOwnerPrisma ??= createChildOwnerPrisma()
  return globalThis.__childOwnerPrisma
}

export async function disconnectChildOwnerPrisma(): Promise<void> {
  const client = globalThis.__childOwnerPrisma
  globalThis.__childOwnerPrisma = undefined
  await client?.$disconnect()
}
