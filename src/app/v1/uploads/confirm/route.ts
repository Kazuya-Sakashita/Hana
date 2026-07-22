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
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const BUCKET = 'images'

/**
 * ISSUE-031: original を download → sharp で thumbnail/preview を生成 → Storage に upload。
 * 失敗時はサーバログに残して **無視** (Image row は作成して 200 を返す。 ユーザーの
 * 「アップロード成功」 体験を壊さない。 variant が無いと一覧で 404 → ❀ placeholder)。
 */
async function generateAndUploadVariants(storageKey: string): Promise<void> {
  const supabase = createSupabaseAdminClient()
  const { data: blob, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(storageKey)

  if (downloadError || !blob) {
    console.error('variant generation: original download failed', {
      reason: downloadError?.message ?? 'no_data',
    })
    return
  }

  const original = Buffer.from(await blob.arrayBuffer())
  const [thumb, preview] = await Promise.all([
    generateThumbnailVariant(original),
    generatePreviewVariant(original),
  ])

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
    console.error('variant upload (thumbnail) failed', { reason: thumbRes.error.message })
  }
  if (previewRes.error) {
    console.error('variant upload (preview) failed', { reason: previewRes.error.message })
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

    // variant 生成 + upload (失敗してもユーザー体験を壊さないので sequential 待機)
    try {
      await generateAndUploadVariants(input.storageKey)
    } catch (variantErr) {
      console.error('variant generation crashed', {
        reason: variantErr instanceof Error ? variantErr.message : 'unknown',
      })
      // 続行: Image row は作成する
    }

    try {
      const image = await prisma.image.create({
        data: {
          userId: user.id,
          storageKey: input.storageKey,
          contentType,
          width: input.width,
          height: input.height,
          fileSize: input.fileSize,
        },
      })
      return NextResponse.json(toImageResponse(image), { status: 201 })
    } catch (dbErr) {
      if (dbErr instanceof Prisma.PrismaClientKnownRequestError && dbErr.code === 'P2002') {
        // storage_key の unique 制約違反 → 同じ key を 2 回 confirm
        throw problems.validation([
          {
            path: 'body.storage_key',
            reason: 'already_confirmed',
            message: 'この画像は既に登録済みです',
          },
        ])
      }
      throw dbErr
    }
  } catch (e) {
    return toProblemResponse(e)
  }
}
