import 'server-only'

import { problems, type FieldError } from '@/server/api/problems'
import { ALLOWED_MIMES } from '@/features/uploads/server/storage-key'

// /v1/uploads/* の body 検証。zod は不採用、インラインで判定。
// 値の上限は OpenAPI と一致させる:
//   - file_size: 10 MiB (= 10485760)
//   - width/height: 10000 px
//   - content_type: image/jpeg | image/png | image/webp | image/heic

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_DIMENSION = 10000
const MAX_FILE_NAME = 255

export interface PresignedUploadInput {
  fileName: string
  contentType: string
}

export interface UploadConfirmInput {
  storageKey: string
  width: number
  height: number
  fileSize: number
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
      message: 'JPEG / PNG / WebP / HEIC のみ対応しています',
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

  const width = parseDimension(body.width, 'body.width', errors)
  const height = parseDimension(body.height, 'body.height', errors)
  const fileSize = parseFileSize(body.file_size, errors)

  if (errors.length) throw problems.validation(errors)
  return {
    storageKey,
    width: width as number,
    height: height as number,
    fileSize: fileSize as number,
  }
}

function parseDimension(value: unknown, path: string, errors: FieldError[]): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push({ path, reason: 'invalid_type', message: '整数で指定してください' })
    return null
  }
  if (value < 1) {
    errors.push({ path, reason: 'too_small', message: '1 px 以上で指定してください' })
    return null
  }
  if (value > MAX_DIMENSION) {
    errors.push({
      path,
      reason: 'too_large',
      message: `${MAX_DIMENSION} px 以下で指定してください`,
    })
    return null
  }
  return value
}

function parseFileSize(value: unknown, errors: FieldError[]): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    errors.push({
      path: 'body.file_size',
      reason: 'invalid_type',
      message: '整数で指定してください',
    })
    return null
  }
  if (value < 1) {
    errors.push({
      path: 'body.file_size',
      reason: 'too_small',
      message: '1 byte 以上で指定してください',
    })
    return null
  }
  if (value > MAX_FILE_SIZE) {
    errors.push({
      path: 'body.file_size',
      reason: 'too_large',
      message: '10 MiB を超えています',
    })
    return null
  }
  return value
}
