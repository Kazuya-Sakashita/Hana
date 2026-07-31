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
import {
  assertUploadedImageSize,
  readUploadedImageStream,
  sanitizeUploadedImage,
  type VerifiedUploadedImage,
  verifyUploadedImage,
} from '@/features/uploads/server/verify-uploaded-image'
import { isApiProblemError } from '@/lib/api/error'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  generateMissingVariants,
  type VariantGenerationResult,
} from '@/features/uploads/server/variant-generation'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const BUCKET = 'images'
const STORAGE_TIMEOUT_MS = 10_000
const activeUploadPreparations = new Map<string, Promise<PreparedUploadedImage>>()

interface PreparedUploadedImage extends VerifiedUploadedImage {
  variants: VariantGenerationResult
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

function throwStorageProblem(error: unknown): never {
  if (isStorageNotFound(error)) throw problems.notFound('画像が見つかりません')
  throw problems.storageUnavailable()
}

/**
 * ISSUE-031: 検証済みoriginalからthumbnail/previewを生成 → Storage に upload。
 * 失敗時はサーバログに残して **無視** (Image row は作成して 200 を返す。 ユーザーの
 * 「アップロード成功」 体験を壊さない。 variant が無いと一覧で 404 → ❀ placeholder)。
 */
async function prepareUploadedImage(
  storageKey: string,
  expectedContentType: string,
): Promise<PreparedUploadedImage> {
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

  const variants = await generateMissingVariants(storageKey, sanitized.buffer, undefined, {
    signal: storageSignal,
  })
  return { ...sanitized, variants }
}

async function prepareUploadedImageOnce(
  storageKey: string,
  expectedContentType: string,
): Promise<PreparedUploadedImage> {
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

    const existingImage = await prisma.image.findUnique({
      where: { storageKey: input.storageKey },
    })
    if (existingImage) {
      if (existingImage.userId !== user.id || existingImage.deletedAt) {
        throw problems.notFound('画像が見つかりません')
      }
      if (existingImage.metadataSanitizedAt === null) {
        const verified = await prepareUploadedImageOnce(input.storageKey, contentType)
        const repaired = await prisma.image.update({
          where: { id: existingImage.id },
          data: {
            contentType: verified.contentType,
            width: verified.width,
            height: verified.height,
            fileSize: verified.fileSize,
            metadataSanitizedAt: new Date(),
            originalVariantStatus: 'ready',
            thumbnailVariantStatus: verified.variants.thumbnail,
            previewVariantStatus: verified.variants.preview,
            variantRepairStatus:
              verified.variants.thumbnail === 'ready' && verified.variants.preview === 'ready'
                ? 'complete'
                : 'pending',
          },
        })
        return NextResponse.json(toImageResponse(repaired), { status: 200 })
      }
      return NextResponse.json(toImageResponse(existingImage), { status: 200 })
    }

    const verified = await prepareUploadedImageOnce(input.storageKey, contentType)

    try {
      const image = await prisma.image.create({
        data: {
          userId: user.id,
          storageKey: input.storageKey,
          contentType: verified.contentType,
          width: verified.width,
          height: verified.height,
          fileSize: verified.fileSize,
          metadataSanitizedAt: new Date(),
          originalVariantStatus: 'ready',
          thumbnailVariantStatus: verified.variants.thumbnail,
          previewVariantStatus: verified.variants.preview,
          variantRepairStatus:
            verified.variants.thumbnail === 'ready' && verified.variants.preview === 'ready'
              ? 'complete'
              : 'pending',
        },
      })
      return NextResponse.json(toImageResponse(image), { status: 201 })
    } catch (dbErr) {
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        const concurrentlyCreated = await prisma.image.findUnique({
          where: { storageKey: input.storageKey },
        })
        if (
          concurrentlyCreated &&
          concurrentlyCreated.userId === user.id &&
          !concurrentlyCreated.deletedAt
        ) {
          return NextResponse.json(toImageResponse(concurrentlyCreated), { status: 200 })
        }
      }
      throw dbErr
    }
  } catch (e) {
    return toProblemResponse(e)
  }
}
