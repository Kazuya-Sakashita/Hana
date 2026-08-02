import { timingSafeEqual } from 'node:crypto'
import type { Image } from '@prisma/client'
import { NextResponse } from 'next/server'
import {
  runImageVariantRepairs,
  VariantRepairError,
  type ImageVariantRepairStorage,
} from '@/features/uploads/server/image-variant-repair'
import {
  generateMissingVariants,
  VariantGenerationError,
} from '@/features/uploads/server/variant-generation'
import {
  assertUploadedImageSize,
  readUploadedImageStream,
  verifyUploadedImage,
} from '@/features/uploads/server/verify-uploaded-image'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isApiProblemError } from '@/lib/api/error'
import { prisma } from '@/server/db/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'images'
const STORAGE_TIMEOUT_MS = 5_000
const WORK_TRANSACTION_TIMEOUT_MS = 30_000

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  if (!secret || !authorization?.startsWith('Bearer ')) return false
  const expected = Buffer.from(secret)
  const received = Buffer.from(authorization.slice('Bearer '.length))
  return expected.length === received.length && timingSafeEqual(expected, received)
}

function isStorageNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { status?: unknown; statusCode?: unknown }
  return (
    candidate.status === 404 ||
    candidate.statusCode === '404' ||
    candidate.statusCode === 'not_found'
  )
}

async function storageInfo(key: string) {
  try {
    const storage = createSupabaseAdminClient({
      signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
    }).storage.from(BUCKET)
    const result = await storage.info(key)
    if (result.error) {
      if (isStorageNotFound(result.error)) return null
      throw new VariantRepairError('storage_unavailable')
    }
    return result.data ?? null
  } catch (error) {
    if (error instanceof VariantRepairError) throw error
    throw new VariantRepairError('storage_unavailable')
  }
}

async function loadOriginal(image: Image): Promise<Buffer> {
  const info = await storageInfo(image.storageKey)
  if (!info) throw new VariantRepairError('original_missing')

  try {
    assertUploadedImageSize(info.size)
    const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS)
    const storage = createSupabaseAdminClient({ signal }).storage.from(BUCKET)
    const result = await storage.download(image.storageKey, {}, { signal }).asStream()
    if (result.error) {
      if (isStorageNotFound(result.error)) throw new VariantRepairError('original_missing')
      throw new VariantRepairError('storage_unavailable')
    }
    if (!result.data) throw new VariantRepairError('original_missing')
    const buffer = await readUploadedImageStream(result.data, info.size)
    const verified = await verifyUploadedImage(buffer, info.contentType ?? '', image.contentType)
    return verified.buffer
  } catch (error) {
    if (error instanceof VariantRepairError) throw error
    if (isApiProblemError(error)) throw new VariantRepairError('original_invalid')
    throw new VariantRepairError('storage_unavailable')
  }
}

const storage: ImageVariantRepairStorage = {
  exists: async (key) => (await storageInfo(key)) !== null,
  loadOriginal,
  generate: async (storageKey, original, requested) => {
    try {
      return await generateMissingVariants(storageKey, original, requested, {
        signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
        failOnError: true,
      })
    } catch (error) {
      if (error instanceof VariantGenerationError) {
        throw new VariantRepairError(error.reason)
      }
      throw new VariantRepairError('storage_unavailable')
    }
  },
}

export async function POST(request: Request) {
  if (!authorized(request)) return new NextResponse(null, { status: 404 })

  const result = await runImageVariantRepairs(prisma, storage, {
    apply: process.env.IMAGE_VARIANT_REPAIR_APPLY === 'confirmed',
    limit: 1,
    workTimeoutMs: WORK_TRANSACTION_TIMEOUT_MS,
  })
  return NextResponse.json(result)
}
