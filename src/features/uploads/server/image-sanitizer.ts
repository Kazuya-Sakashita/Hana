import sharp from 'sharp'
import {
  MAX_UPLOAD_DIMENSION,
  MAX_UPLOAD_FILE_SIZE,
  MAX_UPLOAD_PIXELS,
} from '@/features/uploads/server/image-limits'

export type SanitizableImageMime = 'image/jpeg' | 'image/png' | 'image/webp'

const JPEG_QUALITY = 90
const WEBP_QUALITY = 90
const PNG_COMPRESSION_LEVEL = 9
const SAFE_PNG_CHUNKS = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'cHRM',
  'gAMA',
  'sRGB',
  'pHYs',
])
const SAFE_WEBP_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF'])

function hasNonRenderingJpegSegment(buffer: Buffer): boolean {
  let offset = 2
  while (offset + 1 < buffer.length) {
    if (buffer[offset] !== 0xff) return true
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === undefined) return true
    if (marker === 0xda || marker === 0xd9) return false
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 2 > buffer.length) return true
    const length = buffer.readUInt16BE(offset)
    if (length < 2 || offset + length > buffer.length) return true
    if (marker === 0xfe || (marker >= 0xe0 && marker <= 0xef)) return true
    offset += length
  }
  return true
}

function hasNonRenderingPngChunk(buffer: Buffer): boolean {
  let offset = 8
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset)
    if (length > buffer.length - offset - 12) return true
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    if (!SAFE_PNG_CHUNKS.has(type)) return true
    offset += length + 12
    if (type === 'IEND') return false
  }
  return true
}

function hasNonRenderingWebpChunk(buffer: Buffer): boolean {
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii')
    const length = buffer.readUInt32LE(offset + 4)
    const paddedLength = length + (length % 2)
    if (paddedLength > buffer.length - offset - 8 || !SAFE_WEBP_CHUNKS.has(type)) return true
    offset += 8 + paddedLength
  }
  return offset !== buffer.length
}

function hasNonRenderingContainerMetadata(
  buffer: Buffer,
  contentType: SanitizableImageMime,
): boolean {
  if (contentType === 'image/jpeg') return hasNonRenderingJpegSegment(buffer)
  if (contentType === 'image/png') return hasNonRenderingPngChunk(buffer)
  return hasNonRenderingWebpChunk(buffer)
}

export async function sanitizeImageBuffer(
  buffer: Buffer,
  contentType: SanitizableImageMime,
): Promise<Buffer> {
  const pipeline = sharp(buffer, {
    failOn: 'warning',
    limitInputPixels: MAX_UPLOAD_PIXELS,
  }).rotate()

  if (contentType === 'image/jpeg') {
    return pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer()
  }
  if (contentType === 'image/png') {
    return pipeline.png({ compressionLevel: PNG_COMPRESSION_LEVEL }).toBuffer()
  }
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
}

export async function sanitizeExistingImageBuffer(
  buffer: Buffer,
  expectedContentType: SanitizableImageMime,
): Promise<{
  buffer: Buffer
  contentType: SanitizableImageMime
  width: number
  height: number
  reencoded: boolean
}> {
  if (buffer.length === 0 || buffer.length > MAX_UPLOAD_FILE_SIZE) {
    throw new Error('invalid_image_size')
  }
  const image = sharp(buffer, {
    failOn: 'warning',
    limitInputPixels: MAX_UPLOAD_DIMENSION * MAX_UPLOAD_DIMENSION,
  })
  const metadata = await image.metadata()
  const formatMatches =
    (expectedContentType === 'image/jpeg' && metadata.format === 'jpeg') ||
    (expectedContentType === 'image/png' && metadata.format === 'png') ||
    (expectedContentType === 'image/webp' && metadata.format === 'webp')
  const width = metadata.autoOrient?.width
  const height = metadata.autoOrient?.height
  if (
    !formatMatches ||
    !width ||
    !height ||
    width > MAX_UPLOAD_DIMENSION ||
    height > MAX_UPLOAD_DIMENSION ||
    width * height > MAX_UPLOAD_PIXELS ||
    (metadata.pages ?? 1) > 1
  ) {
    throw new Error('invalid_image_contract')
  }
  await image.stats()

  const metadataFree =
    metadata.orientation === undefined &&
    metadata.exif === undefined &&
    metadata.xmp === undefined &&
    metadata.iptc === undefined &&
    metadata.icc === undefined &&
    metadata.hasProfile !== true &&
    metadata.tifftagPhotoshop === undefined &&
    metadata.comments === undefined &&
    !hasNonRenderingContainerMetadata(buffer, expectedContentType)
  if (metadataFree) {
    return { buffer, contentType: expectedContentType, width, height, reencoded: false }
  }

  const sanitized = await sanitizeImageBuffer(buffer, expectedContentType)
  if (sanitized.length > MAX_UPLOAD_FILE_SIZE) throw new Error('sanitized_image_too_large')
  const sanitizedMetadata = await sharp(sanitized).metadata()
  if (!sanitizedMetadata.width || !sanitizedMetadata.height) {
    throw new Error('invalid_sanitized_image')
  }
  return {
    buffer: sanitized,
    contentType: expectedContentType,
    width: sanitizedMetadata.width,
    height: sanitizedMetadata.height,
    reencoded: true,
  }
}

export const sanitizedImagePolicy = {
  jpegQuality: JPEG_QUALITY,
  webpQuality: WEBP_QUALITY,
  pngCompressionLevel: PNG_COMPRESSION_LEVEL,
} as const
