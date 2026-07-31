import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { isUuid } from '@/features/memories/server/parse'
import {
  SIGNED_URL_TTL_SECONDS,
  SIZES,
  generateSignedImageUrl,
  type ImageSize,
} from '@/features/uploads/server/signed-url'
import { activeImageAccessWhere } from '@/features/uploads/server/active-image-access'
import { lockImageAccess } from '@/features/uploads/server/image-access-lock'

export const dynamic = 'force-dynamic'

const RESPONSE_CACHE_MAX_AGE = 300 // 5 分 (ADR-0012)
const SIGNED_URL_OPERATION_DEADLINE_MS = 8_000
const IMAGE_ACCESS_TRANSACTION_TIMEOUT_MS = 10_000

async function generateSignedImageUrlBeforeDeadline(
  storageKey: string,
  size: ImageSize,
  allowOriginalFallback: boolean,
): Promise<string | null> {
  const abort = new AbortController()
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      generateSignedImageUrl(storageKey, size, {
        signal: abort.signal,
        allowOriginalFallback,
      }),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => {
          abort.abort()
          reject(new Error('Signed URL operation deadline exceeded'))
        }, SIGNED_URL_OPERATION_DEADLINE_MS)
      }),
    ])
  } finally {
    if (deadline) clearTimeout(deadline)
  }
}

function parseSize(value: string | null): ImageSize {
  if (value === null || value === '') return 'original'
  if ((SIZES as readonly string[]).includes(value)) return value as ImageSize
  throw problems.validation([
    { path: 'query.size', reason: 'invalid', message: '無効なサイズ指定です' },
  ])
}

type Params = { params: Promise<{ imageId: string }> }

export async function GET(request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { imageId } = await params

    if (!isUuid(imageId)) {
      throw problems.notFound('画像が見つかりません')
    }

    const size = parseSize(new URL(request.url).searchParams.get('size'))

    const { signedUrl, expiresAt } = await prisma.$transaction(
      async (transaction) => {
        await lockImageAccess(transaction, [imageId])
        const image = await transaction.image.findFirst({
          where: { id: imageId, ...activeImageAccessWhere(user.id) },
          select: { id: true, userId: true, storageKey: true, metadataSanitizedAt: true },
        })
        if (!image) {
          throw problems.notFound('画像が見つかりません')
        }
        if (image.userId !== user.id) {
          throw problems.forbidden()
        }
        if (size === 'original' && image.metadataSanitizedAt === null) {
          throw problems.imageSanitizationPending()
        }

        const url = await generateSignedImageUrlBeforeDeadline(
          image.storageKey,
          size,
          image.metadataSanitizedAt !== null,
        )
        if (!url) {
          throw new Error('Storage signed URL failed')
        }

        return {
          signedUrl: url,
          expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
        }
      },
      {
        maxWait: 3_000,
        timeout: IMAGE_ACCESS_TRANSACTION_TIMEOUT_MS,
      },
    )

    return NextResponse.json(
      { url: signedUrl, expires_at: expiresAt },
      {
        headers: {
          'Cache-Control': `private, max-age=${RESPONSE_CACHE_MAX_AGE}`,
        },
      },
    )
  } catch (e) {
    return toProblemResponse(e)
  }
}
