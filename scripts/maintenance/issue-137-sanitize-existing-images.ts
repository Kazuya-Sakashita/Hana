import { pathToFileURL } from 'node:url'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '@prisma/client'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import {
  runExistingImageBackfill,
  type ExistingImageCandidate,
} from '../../src/features/uploads/server/existing-image-backfill'
import {
  sanitizeExistingImageBuffer,
  type SanitizableImageMime,
} from '../../src/features/uploads/server/image-sanitizer'
import { MAX_UPLOAD_FILE_SIZE } from '../../src/features/uploads/server/image-limits'
import { acquireUploadStorageLock } from '../../src/features/uploads/server/upload-storage-lock'
import { lockImageAccess } from '../../src/features/uploads/server/image-access-lock'

const BATCH_SIZE = 25
const BUCKET = 'images'
const DOWNLOAD_TTL_SECONDS = 60
const SUPPORTED_TYPES = new Set<SanitizableImageMime>(['image/jpeg', 'image/png', 'image/webp'])

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`missing_required_environment:${name}`)
  return value
}

export async function readResponseWithLimit(response: Response): Promise<Buffer> {
  if (!response.ok || !response.body) throw new Error('storage_download_failed')
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_FILE_SIZE) {
    await response.body.cancel().catch(() => undefined)
    throw new Error('source_too_large')
  }

  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_UPLOAD_FILE_SIZE) {
        await reader.cancel().catch(() => undefined)
        throw new Error('source_too_large')
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks, size)
}

export async function executeBackfill(apply: boolean) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requiredEnvironment('DATABASE_URL') }),
  })
  const storage = createClient(
    requiredEnvironment('NEXT_PUBLIC_SUPABASE_URL'),
    requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  ).storage.from(BUCKET)

  try {
    return await runExistingImageBackfill(apply, {
      listBatch: (cursor) =>
        prisma.image.findMany({
          where: { metadataSanitizedAt: null, deletedAt: null },
          select: { id: true, storageKey: true, contentType: true },
          orderBy: { id: 'asc' },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        }),
      sanitizeAndMark: async (image: ExistingImageCandidate) =>
        prisma.$transaction(
          async (transaction) => {
            await acquireUploadStorageLock(transaction, image.storageKey)
            await lockImageAccess(transaction, [image.id])
            const current = await transaction.image.findUnique({ where: { id: image.id } })
            if (
              !current ||
              current.storageKey !== image.storageKey ||
              current.metadataSanitizedAt !== null ||
              current.deletedAt !== null
            ) {
              return false
            }
            if (!SUPPORTED_TYPES.has(current.contentType as SanitizableImageMime)) {
              throw new Error('unsupported_content_type')
            }
            const signed = await storage.createSignedUrl(current.storageKey, DOWNLOAD_TTL_SECONDS)
            if (signed.error || !signed.data?.signedUrl) throw new Error('signed_url_failed')
            const source = await readResponseWithLimit(
              await fetch(signed.data.signedUrl, { signal: AbortSignal.timeout(15_000) }),
            )
            const sanitized = await sanitizeExistingImageBuffer(
              source,
              current.contentType as SanitizableImageMime,
            )
            if (sanitized.reencoded) {
              const replacement = await storage.update(current.storageKey, sanitized.buffer, {
                contentType: sanitized.contentType,
                cacheControl: '300',
                upsert: true,
              })
              if (replacement.error) throw new Error('storage_update_failed')
            }
            const updated = await transaction.image.updateMany({
              where: { id: current.id, metadataSanitizedAt: null, deletedAt: null },
              data: {
                contentType: sanitized.contentType,
                width: sanitized.width,
                height: sanitized.height,
                fileSize: sanitized.buffer.length,
                metadataSanitizedAt: new Date(),
              },
            })
            return updated.count === 1
          },
          { maxWait: 3_000, timeout: 60_000 },
        ),
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  const result = await executeBackfill(process.argv.slice(2).includes('--apply'))
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (result.failed > 0) process.exitCode = 1
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((error: unknown) => {
    const reason =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2022'
        ? 'database migration is not deployed'
        : 'preflight failed'
    process.stderr.write(`image sanitization backfill ${reason}\n`)
    process.exitCode = 1
  })
}
