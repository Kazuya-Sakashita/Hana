import 'server-only'

import sharp from 'sharp'
import {
  MAX_UPLOAD_DIMENSION,
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_PIXELS,
} from '@/features/uploads/server/image-limits'
import { isApiProblemError } from '@/lib/api/error'
import { problems } from '@/server/api/problems'

type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'

export interface VerifiedUploadedImage {
  buffer: Buffer
  contentType: SupportedImageMime
  width: number
  height: number
  fileSize: number
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs'])
const AVIF_BRANDS = new Set(['avif', 'avis'])

const SHARP_FORMAT_BY_MIME: Record<SupportedImageMime, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heif',
}

function validationProblem(reason: string, message: string) {
  return problems.validation([
    {
      path: 'body.storage_key',
      reason,
      message,
    },
  ])
}

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return signature.every((byte, index) => buffer[index] === byte)
}

function isHeic(buffer: Buffer): boolean {
  if (buffer.length < 16 || buffer.subarray(4, 8).toString('ascii') !== 'ftyp') return false

  const boxSize = buffer.readUInt32BE(0)
  if (boxSize < 16 || boxSize > buffer.length || boxSize % 4 !== 0) return false

  const brands = [buffer.subarray(8, 12).toString('ascii')]
  for (let offset = 16; offset + 4 <= boxSize; offset += 4) {
    brands.push(buffer.subarray(offset, offset + 4).toString('ascii'))
  }

  return (
    !brands.some((brand) => AVIF_BRANDS.has(brand)) &&
    brands.some((brand) => HEIC_BRANDS.has(brand))
  )
}

function containsPngChunk(buffer: Buffer, targetType: string): boolean {
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const dataLength = buffer.readUInt32BE(offset)
    if (dataLength > buffer.length - offset - 12) return false

    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    if (type === targetType) return true
    if (type === 'IEND') return false
    offset += dataLength + 12
  }
  return false
}

export function detectImageMime(buffer: Buffer): SupportedImageMime | null {
  if (buffer.length >= 3 && startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (buffer.length >= 8 && startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png'
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp'
  }
  if (isHeic(buffer)) return 'image/heic'
  return null
}

export function assertUploadedImageSize(declaredSize?: number): void {
  if (declaredSize !== undefined && declaredSize > MAX_UPLOAD_FILE_SIZE) {
    throw validationProblem('file_too_large', '画像は10 MiB以下にしてください')
  }
}

export async function readUploadedImageStream(
  stream: ReadableStream<Uint8Array>,
  declaredSize?: number,
): Promise<Buffer> {
  try {
    assertUploadedImageSize(declaredSize)
  } catch (error) {
    await stream.cancel().catch(() => undefined)
    throw error
  }

  const reader = stream.getReader()
  const chunks: Buffer[] = []
  let size = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_UPLOAD_FILE_SIZE) {
        await reader.cancel().catch(() => undefined)
        throw validationProblem('file_too_large', '画像は10 MiB以下にしてください')
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength))
    }
  } finally {
    reader.releaseLock()
  }

  return Buffer.concat(chunks, size)
}

export async function verifyUploadedImage(
  buffer: Buffer,
  storageContentType: string,
  expectedContentType: string,
): Promise<VerifiedUploadedImage> {
  if (buffer.length === 0) {
    throw validationProblem('invalid_image_content', '画像データを読み取れません')
  }
  if (buffer.length > MAX_UPLOAD_FILE_SIZE) {
    throw validationProblem('file_too_large', '画像は10 MiB以下にしてください')
  }

  const detectedContentType = detectImageMime(buffer)
  if (!detectedContentType) {
    throw validationProblem('invalid_image_content', '対応する画像データではありません')
  }
  if (detectedContentType === 'image/heic') {
    throw validationProblem(
      'unsupported_media_type',
      'HEICはJPEGへ再エンコードしてアップロードしてください',
    )
  }
  if (detectedContentType === 'image/png' && containsPngChunk(buffer, 'acTL')) {
    throw validationProblem(
      'animated_image_not_supported',
      '動画・animated画像には対応していません',
    )
  }

  const normalizedStorageContentType = storageContentType.toLowerCase().split(';', 1)[0]
  if (
    detectedContentType !== expectedContentType ||
    normalizedStorageContentType !== detectedContentType
  ) {
    throw validationProblem('content_type_mismatch', '画像形式とアップロード時の形式が一致しません')
  }

  try {
    const image = sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_UPLOAD_DIMENSION * MAX_UPLOAD_DIMENSION,
    })
    const metadata = await image.metadata()
    if (
      metadata.format !== SHARP_FORMAT_BY_MIME[detectedContentType] ||
      !metadata.autoOrient?.width ||
      !metadata.autoOrient?.height
    ) {
      throw new Error('invalid_image_metadata')
    }
    if ((metadata.pages ?? 1) > 1) {
      throw validationProblem(
        'animated_image_not_supported',
        '動画・animated画像には対応していません',
      )
    }

    const width = metadata.autoOrient.width
    const height = metadata.autoOrient.height
    if (
      width > MAX_UPLOAD_DIMENSION ||
      height > MAX_UPLOAD_DIMENSION ||
      width * height > MAX_UPLOAD_PIXELS
    ) {
      throw validationProblem(
        'image_dimensions_too_large',
        '画像は各辺10000 pxかつ25 MP以下にしてください',
      )
    }

    await sharp(buffer, {
      failOn: 'warning',
      limitInputPixels: MAX_UPLOAD_PIXELS,
    }).stats()

    return {
      buffer,
      contentType: detectedContentType,
      width,
      height,
      fileSize: buffer.length,
    }
  } catch (error) {
    if (isApiProblemError(error)) throw error
    if (error instanceof Error && error.message.toLowerCase().includes('pixel limit')) {
      throw validationProblem(
        'image_dimensions_too_large',
        '画像は各辺10000 pxかつ25 MP以下にしてください',
      )
    }
    throw validationProblem('invalid_image_content', '画像データを読み取れません')
  }
}
