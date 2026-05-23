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

export const dynamic = 'force-dynamic'

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
