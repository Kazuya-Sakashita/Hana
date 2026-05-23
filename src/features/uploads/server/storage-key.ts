import 'server-only'

import { createHash, randomUUID } from 'node:crypto'

// storage_key は CLAUDE.md §7 で定めた形式:
//   uploads/{userIdHash}/{yyyymm}/{uuid}.{ext}
// - userIdHash: user_id の SHA-256 (先頭 16 文字) — user_id 自体を URL に露出しない
// - yyyymm: アップロード時の UTC 年月 (lifecycle ジョブで月単位削除しやすい)
// - uuid: 推測不可能な UUID v4
// - ext: content_type から導出 (jpg / png / webp / heic のみ)

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

export const ALLOWED_MIMES: ReadonlyArray<string> = Object.keys(EXT_BY_MIME)

const STORAGE_KEY_PATTERN = /^uploads\/[0-9a-f]{16}\/\d{6}\/[0-9a-f-]{36}\.(jpg|png|webp|heic)$/

export function userIdHash(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 16)
}

export function extensionForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

export function mimeForExtension(ext: string): string | null {
  for (const [mime, e] of Object.entries(EXT_BY_MIME)) {
    if (e === ext) return mime
  }
  return null
}

export function yyyymm(date = new Date()): string {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}${m}`
}

export function generateStorageKey(userId: string, mime: string): string {
  const ext = extensionForMime(mime)
  if (!ext) {
    throw new Error(`Unsupported mime: ${mime}`)
  }
  return `uploads/${userIdHash(userId)}/${yyyymm()}/${randomUUID()}.${ext}`
}

export function isValidStorageKey(key: string): boolean {
  return STORAGE_KEY_PATTERN.test(key)
}

export function storageKeyPrefixForUser(userId: string): string {
  return `uploads/${userIdHash(userId)}/`
}

export function storageKeyBelongsToUser(key: string, userId: string): boolean {
  return key.startsWith(storageKeyPrefixForUser(userId))
}
