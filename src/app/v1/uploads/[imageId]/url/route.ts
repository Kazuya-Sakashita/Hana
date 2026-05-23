import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { problems } from '@/server/api/problems'
import { prisma } from '@/server/db/prisma'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { isUuid } from '@/features/memories/server/parse'

export const dynamic = 'force-dynamic'

const BUCKET = 'images'
const DOWNLOAD_TTL_SECONDS = 1800 // 30 分 (CLAUDE.md §7 / ADR-0009 §5)

type Params = { params: Promise<{ imageId: string }> }

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser()
    const { imageId } = await params

    if (!isUuid(imageId)) {
      throw problems.notFound('画像が見つかりません')
    }
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

    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(image.storageKey, DOWNLOAD_TTL_SECONDS)

    if (error || !data) {
      // 詳細はサーバログのみ、クライアントには 500 generic
      console.error('createSignedUrl failed', { reason: error?.message ?? 'no_data' })
      throw new Error('Storage signed URL failed')
    }

    const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_SECONDS * 1000).toISOString()
    return NextResponse.json({ url: data.signedUrl, expires_at: expiresAt })
  } catch (e) {
    return toProblemResponse(e)
  }
}
