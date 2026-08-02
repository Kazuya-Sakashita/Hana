import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/server/db/prisma'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  runUnconfirmedUploadCleanup,
  type ObjectTimestamp,
} from '@/features/uploads/server/unconfirmed-upload-cleanup'
import { discoverLegacyUnconfirmedUploads } from '@/features/uploads/server/legacy-upload-discovery'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'images'

function authorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || !supplied) return false
  const expectedBuffer = Buffer.from(expected)
  const suppliedBuffer = Buffer.from(supplied)
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  )
}

function timestamp(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function POST(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 404 })

  const apply = process.env.UNCONFIRMED_IMAGE_CLEANUP_APPLY === 'confirmed'
  const cleanupStorage = createSupabaseAdminClient({
    signal: AbortSignal.timeout(30_000),
  }).storage.from(BUCKET)
  const result = await runUnconfirmedUploadCleanup(
    prisma,
    {
      timestamp: async (key): Promise<ObjectTimestamp> => {
        const lastSlash = key.lastIndexOf('/')
        const directory = key.slice(0, lastSlash)
        const name = key.slice(lastSlash + 1)
        const listed = await cleanupStorage.list(directory, { limit: 100, search: name })
        if (listed.error) throw new Error('storage_list_failed')
        const object = listed.data.find((entry) => entry.name === name)
        if (!object) return 'missing'
        const createdAt = timestamp(object.created_at)
        const updatedAt = timestamp(object.updated_at)
        if (!createdAt || !updatedAt) return 'invalid'
        return createdAt > updatedAt ? createdAt : updatedAt
      },
      remove: async (keys) => {
        const removed = await cleanupStorage.remove(keys)
        return !removed.error
      },
    },
    {
      apply,
      limit: 50,
    },
  )
  const discoveryStorage = createSupabaseAdminClient({
    signal: AbortSignal.timeout(15_000),
  }).storage.from(BUCKET)
  let discovery = {
    legacyScanned: 0,
    legacyDiscovered: 0,
    legacyInvalid: 0,
    legacyListFailed: 0,
  }
  try {
    discovery = await discoverLegacyUnconfirmedUploads(
      prisma,
      {
        list: async (path, offset) => {
          const listed = await discoveryStorage.list(path, {
            limit: 100,
            offset,
            sortBy: { column: 'name', order: 'asc' },
          })
          if (listed.error) throw new Error('storage_list_failed')
          return listed.data.map((entry) => ({
            name: entry.name,
            createdAt: entry.created_at,
            updatedAt: entry.updated_at,
            isFolder: entry.id === null,
          }))
        },
      },
      undefined,
      apply,
    )
  } catch {
    discovery.legacyListFailed = 1
  }
  return NextResponse.json({ ...discovery, ...result })
}
