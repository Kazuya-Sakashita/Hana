import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/features/memories/server/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'images'
const DOWNLOAD_TTL_SECONDS = 1800 // 30 分 (ADR-0009 §5)
const RESPONSE_CACHE_MAX_AGE = 300 // 5 分 (ADR-0012)

const SIZES = ['thumbnail', 'preview', 'original'] as const
type ImageSize = (typeof SIZES)[number]

// resize: 'contain' を明示する理由:
//   Supabase image transformation の既定 resize は 'cover' だが、 width だけ指定すると
//   非アスペクト保持の center crop を返す挙動 (ISSUE-019 検証で判明)。
//   'contain' を明示するとアスペクト比を保ったまま width に縮小する。
//   サーバ側ではクロップしないので、 各画面のコンテナ (4:5 / 80×80) に応じた crop は
//   ブラウザ側の object-cover に委ねる (= ISSUE-019 前と視覚的に一致)。
const TRANSFORMS: Record<
  Exclude<ImageSize, 'original'>,
  { width: number; resize: 'contain'; quality: number }
> = {
  thumbnail: { width: 320, resize: 'contain', quality: 70 },
  preview: { width: 1024, resize: 'contain', quality: 80 },
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

    // 認可は requireUser + image.userId 比較で済んでいるため、Storage は service_role で
    // (Storage Policy は Phase 2 で導入予定・ADR-0009 §3)
    const supabase = createSupabaseAdminClient()
    const options = size === 'original' ? undefined : { transform: TRANSFORMS[size] }
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(image.storageKey, DOWNLOAD_TTL_SECONDS, options)

    if (error || !data) {
      // 詳細はサーバログのみ、クライアントには 500 generic
      console.error('createSignedUrl failed', { reason: error?.message ?? 'no_data' })
      throw new Error('Storage signed URL failed')
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString()
    return NextResponse.json(
      { url: data.signedUrl, expires_at: expiresAt },
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
