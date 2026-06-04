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

export const dynamic = 'force-dynamic'

const RESPONSE_CACHE_MAX_AGE = 300 // 5 分 (ADR-0012)

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

    const image = await prisma.image.findFirst({
      where: { id: imageId, deletedAt: null },
      select: { id: true, userId: true, storageKey: true },
    })
    if (!image) {
      throw problems.notFound('画像が見つかりません')
    }
    if (image.userId !== user.id) {
      throw problems.forbidden()
    }

    const signedUrl = await generateSignedImageUrl(image.storageKey, size)
    if (!signedUrl) {
      throw new Error('Storage signed URL failed')
    }

    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString()
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
