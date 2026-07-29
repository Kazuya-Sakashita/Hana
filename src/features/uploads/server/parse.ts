import 'server-only'

import { problems, type FieldError } from '@/server/api/problems'
import { MAX_UPLOAD_DIMENSION, MAX_UPLOAD_FILE_SIZE } from '@/features/uploads/server/image-limits'
import { ALLOWED_MIMES } from '@/features/uploads/server/storage-key'

// /v1/uploads/* の body 検証。zod は不採用、インラインで判定。
// 値の上限は OpenAPI と一致させる。
// confirmのwidth / height / file_sizeは旧クライアント互換で受理するが使用しない。
// 実体値の上限検証はverify-uploaded-image.tsで行う。

const MAX_FILE_NAME = 255

export interface PresignedUploadInput {
  fileName: string
  contentType: string
}

export interface UploadConfirmInput {
  storageKey: string
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    throw problems.validation([
      { path: 'body', reason: 'invalid_json', message: 'JSON が不正です' },
    ])
  }
}

export function parsePresignedUploadRequest(raw: unknown): PresignedUploadInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []

  let fileName = ''
  if (typeof body.file_name !== 'string') {
    errors.push({ path: 'body.file_name', reason: 'required', message: '必須項目です' })
  } else if (body.file_name.length === 0) {
    errors.push({
      path: 'body.file_name',
      reason: 'too_short',
      message: 'ファイル名を指定してください',
    })
  } else if (body.file_name.length > MAX_FILE_NAME) {
    errors.push({
      path: 'body.file_name',
      reason: 'too_long',
      message: `${MAX_FILE_NAME} 文字以下で指定してください`,
    })
  } else {
    fileName = body.file_name
  }

  let contentType = ''
  if (typeof body.content_type !== 'string') {
    errors.push({ path: 'body.content_type', reason: 'required', message: '必須項目です' })
  } else if (!ALLOWED_MIMES.includes(body.content_type)) {
    errors.push({
      path: 'body.content_type',
      reason: 'unsupported_media_type',
      message: 'JPEG / PNG / WebP のみ対応しています',
    })
  } else {
    contentType = body.content_type
  }

  if (errors.length) throw problems.validation(errors)
  return { fileName, contentType }
}

export function parseUploadConfirmRequest(raw: unknown): UploadConfirmInput {
  if (typeof raw !== 'object' || raw === null) {
    throw problems.validation([
      { path: 'body', reason: 'invalid_type', message: 'リクエストボディが不正です' },
    ])
  }
  const body = raw as Record<string, unknown>
  const errors: FieldError[] = []

  let storageKey = ''
  if (typeof body.storage_key !== 'string') {
    errors.push({ path: 'body.storage_key', reason: 'required', message: '必須項目です' })
  } else if (body.storage_key.length === 0) {
    errors.push({ path: 'body.storage_key', reason: 'too_short', message: 'storage_key が空です' })
  } else {
    storageKey = body.storage_key
  }

  if (body.width !== undefined) {
    parseLegacyInteger(body.width, 'body.width', MAX_UPLOAD_DIMENSION, errors)
  }
  if (body.height !== undefined) {
    parseLegacyInteger(body.height, 'body.height', MAX_UPLOAD_DIMENSION, errors)
  }
  if (body.file_size !== undefined) {
    parseLegacyInteger(body.file_size, 'body.file_size', MAX_UPLOAD_FILE_SIZE, errors)
  }

  if (errors.length) throw problems.validation(errors)
  return { storageKey }
}

function parseLegacyInteger(
  value: unknown,
  path: string,
  maximum: number,
  errors: FieldError[],
): void {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push({ path, reason: 'invalid_type', message: '整数で指定してください' })
    return
  }
  if (value < 1) {
    errors.push({ path, reason: 'too_small', message: '1以上で指定してください' })
    return
  }
  if (value > maximum) {
    errors.push({ path, reason: 'too_large', message: `${maximum}以下で指定してください` })
  }
}
