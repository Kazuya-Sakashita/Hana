import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import {
  isValidStorageKey,
  mimeForExtension,
  storageKeyBelongsToUser,
} from '@/features/uploads/server/storage-key'
import { parseUploadConfirmRequest, readJsonBody } from '@/features/uploads/server/parse'
import { toImageResponse } from '@/features/uploads/view-models/image'
import { deriveVariantKey } from '@/features/uploads/server/signed-url'
import {
  generatePreviewVariant,
  generateThumbnailVariant,
} from '@/features/uploads/server/variants'
import {
  assertUploadedImageSize,
  readUploadedImageStream,
  sanitizeUploadedImage,
  type VerifiedUploadedImage,
  verifyUploadedImage,
} from '@/features/uploads/server/verify-uploaded-image'
import { isApiProblemError } from '@/lib/api/error'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { logStorageError } from '@/features/uploads/server/storage-error-log'
import { acquireUploadStorageLock } from '@/features/uploads/server/upload-storage-lock'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'images'
const STORAGE_TIMEOUT_MS = 10_000
const activeUploadPreparations = new Map<string, Promise<VerifiedUploadedImage>>()

function isStorageNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { status?: unknown; statusCode?: unknown }
  return (
    candidate.status === 404 ||
    candidate.statusCode === '404' ||
    candidate.statusCode === 'not_found'
  )
}

function throwStorageProblem(error: unknown): never {
  if (isStorageNotFound(error)) throw problems.notFound('画像が見つかりません')
  throw problems.storageUnavailable()
}

/**
 * ISSUE-031: 検証済みoriginalからthumbnail/previewを生成 → Storage に upload。
 * 失敗時はサーバログに残して **無視** (Image row は作成して 200 を返す。 ユーザーの
 * 「アップロード成功」 体験を壊さない。 variant が無いと一覧で 404 → ❀ placeholder)。
 */
async function generateAndUploadVariants(storageKey: string, original: Buffer): Promise<void> {
  const supabase = createSupabaseAdminClient({
    signal: AbortSignal.timeout(STORAGE_TIMEOUT_MS),
  })
  const thumb = await generateThumbnailVariant(original)
  const preview = await generatePreviewVariant(original)

  const thumbKey = deriveVariantKey(storageKey, 'thumbnail')
  const previewKey = deriveVariantKey(storageKey, 'preview')

  const [thumbRes, previewRes] = await Promise.all([
    supabase.storage.from(BUCKET).upload(thumbKey, thumb.buffer, {
      contentType: thumb.contentType,
      upsert: true,
    }),
    supabase.storage.from(BUCKET).upload(previewKey, preview.buffer, {
      contentType: preview.contentType,
      upsert: true,
    }),
  ])

  if (thumbRes.error) {
    logStorageError('variant_thumbnail_upload_failed')
  }
  if (previewRes.error) {
    logStorageError('variant_preview_upload_failed')
  }
}

async function prepareUploadedImage(
  storageKey: string,
  expectedContentType: string,
): Promise<VerifiedUploadedImage> {
  const storageSignal = AbortSignal.timeout(STORAGE_TIMEOUT_MS)
  const supabase = createSupabaseAdminClient({ signal: storageSignal })
  const storage = supabase.storage.from(BUCKET)
  let infoResult: Awaited<ReturnType<typeof storage.info>>
  try {
    infoResult = await storage.info(storageKey)
  } catch {
    throw problems.storageUnavailable()
  }
  const { data: storageInfo, error: infoError } = infoResult
  if (infoError) throwStorageProblem(infoError)
  if (!storageInfo) throw problems.notFound('画像が見つかりません')
  assertUploadedImageSize(storageInfo.size)

  const downloadOriginal = () =>
    storage.download(storageKey, {}, { signal: storageSignal }).asStream()
  let downloadResult: Awaited<ReturnType<typeof downloadOriginal>>
  try {
    downloadResult = await downloadOriginal()
  } catch {
    throw problems.storageUnavailable()
  }
  const { data: originalStream, error: downloadError } = downloadResult
  if (downloadError) throwStorageProblem(downloadError)
  if (!originalStream) throw problems.notFound('画像が見つかりません')

  let original: Buffer
  try {
    original = await readUploadedImageStream(originalStream, storageInfo.size)
  } catch (error) {
    if (isApiProblemError(error)) throw error
    throw problems.storageUnavailable()
  }
  const verified = await verifyUploadedImage(
    original,
    storageInfo.contentType ?? '',
    expectedContentType,
  )
  const sanitized = await sanitizeUploadedImage(verified)
  let replaceResult: Awaited<ReturnType<typeof storage.update>>
  try {
    replaceResult = await storage.update(storageKey, sanitized.buffer, {
      contentType: sanitized.contentType,
      cacheControl: '300',
      upsert: true,
    })
  } catch {
    throw problems.storageUnavailable()
  }
  if (replaceResult.error) throwStorageProblem(replaceResult.error)

  try {
    await generateAndUploadVariants(storageKey, sanitized.buffer)
  } catch {
    logStorageError('variant_generation_failed')
  }

  return sanitized
}

async function prepareUploadedImageOnce(
  storageKey: string,
  expectedContentType: string,
): Promise<VerifiedUploadedImage> {
  const active = activeUploadPreparations.get(storageKey)
  if (active) return active

  const preparation = prepareUploadedImage(storageKey, expectedContentType)
  activeUploadPreparations.set(storageKey, preparation)
  try {
    return await preparation
  } finally {
    if (activeUploadPreparations.get(storageKey) === preparation) {
      activeUploadPreparations.delete(storageKey)
    }
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw = await readJsonBody(request)
    const input = parseUploadConfirmRequest(raw)

    if (!isValidStorageKey(input.storageKey)) {
      throw problems.validation([
        {
          path: 'body.storage_key',
          reason: 'invalid_format',
          message: 'storage_key の形式が不正です',
        },
      ])
    }
    if (!storageKeyBelongsToUser(input.storageKey, user.id)) {
      // 他ユーザーの prefix を指定 → 認可違反
      throw problems.forbidden()
    }

    const ext = input.storageKey.slice(input.storageKey.lastIndexOf('.') + 1)
    const contentType = mimeForExtension(ext)
    if (!contentType) {
      // isValidStorageKey で弾かれているはずだが念のため
      throw problems.validation([
        {
          path: 'body.storage_key',
          reason: 'invalid_format',
          message: '拡張子が不正です',
        },
      ])
    }

    return await prisma.$transaction(
      async (transaction) => {
        await acquireUploadStorageLock(transaction, input.storageKey)

        const reservation = await transaction.uploadReservation.findUnique({
          where: { storageKey: input.storageKey },
        })
        if (reservation && reservation.userId !== user.id) {
          throw problems.notFound('画像が見つかりません')
        }

        const existingImage = await transaction.image.findUnique({
          where: { storageKey: input.storageKey },
        })
        if (existingImage) {
          if (existingImage.userId !== user.id || existingImage.deletedAt) {
            throw problems.notFound('画像が見つかりません')
          }
          if (existingImage.metadataSanitizedAt === null) {
            const verified = await prepareUploadedImageOnce(input.storageKey, contentType)
            const repaired = await transaction.image.update({
              where: { id: existingImage.id },
              data: {
                contentType: verified.contentType,
                width: verified.width,
                height: verified.height,
                fileSize: verified.fileSize,
                metadataSanitizedAt: new Date(),
              },
            })
            await transaction.uploadReservation.deleteMany({
              where: { storageKey: input.storageKey },
            })
            return NextResponse.json(toImageResponse(repaired), { status: 200 })
          }
          await transaction.uploadReservation.deleteMany({
            where: { storageKey: input.storageKey },
          })
          return NextResponse.json(toImageResponse(existingImage), { status: 200 })
        }

        const verified = await prepareUploadedImageOnce(input.storageKey, contentType)
        let image
        try {
          image = await transaction.image.create({
            data: {
              userId: user.id,
              storageKey: input.storageKey,
              contentType: verified.contentType,
              width: verified.width,
              height: verified.height,
              fileSize: verified.fileSize,
              metadataSanitizedAt: new Date(),
            },
          })
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            const concurrent = await transaction.image.findUnique({
              where: { storageKey: input.storageKey },
            })
            if (concurrent && concurrent.userId === user.id && !concurrent.deletedAt) {
              await transaction.uploadReservation.deleteMany({
                where: { storageKey: input.storageKey },
              })
              return NextResponse.json(toImageResponse(concurrent), { status: 200 })
            }
          }
          throw error
        }
        await transaction.uploadReservation.deleteMany({
          where: { storageKey: input.storageKey },
        })
        return NextResponse.json(toImageResponse(image), { status: 201 })
      },
      { maxWait: 5_000, timeout: 50_000 },
    )
  } catch (e) {
    return toProblemResponse(e)
  }
}
