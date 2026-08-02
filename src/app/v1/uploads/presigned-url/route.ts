import { NextResponse } from 'next/server'
import { requireUser } from '@/server/auth/current-user'
import { toProblemResponse } from '@/server/api/problem-response'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { generateStorageKey } from '@/features/uploads/server/storage-key'
import { parsePresignedUploadRequest, readJsonBody } from '@/features/uploads/server/parse'
import { logStorageError } from '@/features/uploads/server/storage-error-log'
import { prisma } from '@/server/db/prisma'
import { uploadReservationTimes } from '@/features/uploads/server/upload-reservation-policy'

export const dynamic = 'force-dynamic'

const BUCKET = 'images'
export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const raw = await readJsonBody(request)
    const input = parsePresignedUploadRequest(raw)

    const storageKey = generateStorageKey(user.id, input.contentType)
    const reservationTimes = uploadReservationTimes()
    await prisma.uploadReservation.create({
      data: {
        userId: user.id,
        storageKey,
        ...reservationTimes,
      },
    })
    // 認可は requireUser() で済んでいるため、Storage への発行は service_role で行う
    // (Storage Policy は Phase 2 で導入予定・ADR-0009 §3)
    const supabase = createSupabaseAdminClient()
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storageKey)

    if (error || !data) {
      logStorageError('signed_upload_failed')
      throw new Error('Storage signed upload URL failed')
    }

    return NextResponse.json({
      presigned_url: data.signedUrl,
      storage_key: storageKey,
      expires_at: reservationTimes.signedUrlExpiresAt.toISOString(),
    })
  } catch (e) {
    return toProblemResponse(e)
  }
}
