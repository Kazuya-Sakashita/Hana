import { crc32 } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { MAX_UPLOAD_FILE_SIZE, MAX_UPLOAD_PIXELS } from '@/features/uploads/server/image-limits'
import { ApiProblemError } from '@/lib/api/error'
import {
  assertUploadedImageSize,
  detectImageMime,
  readUploadedImageStream,
  sanitizeUploadedImage,
  sanitizedImagePolicy,
  verifyUploadedImage,
} from '@/features/uploads/server/verify-uploaded-image'

const SYNTHETIC_HEIC = Buffer.from(
  'AAAAGGZ0eXBoZWljAAAAAG1pZjFoZWljAAABfW1ldGEAAAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAADnBpdG0AAAAAAAEAAAAiaWxvYwAAAABEQAABAAEAAAAAAZ0AAQAAAAAAAAAvAAAAI2lpbmYAAAAAAAEAAAAVaW5mZQIAAAAAAQAAaHZjMQAAAAD9aXBycAAAAN1pcGNvAAAAdmh2Y0MBA3AAAAAAAAAAAAAe8AD8/fj4AAAPAyAAAQAYQAEMAf//A3AAAAMAkAAAAwAAAwAeugJAIQABACpCAQEDcAAAAwCQAAADAAADAB6gIIEFluqumubgIaDAgAAAAwCAAAADAIQiAAEABkQBwXPBiQAAABRpc3BlAAAAAAAAAEAAAABAAAAAKGNsYXAAAAAEAAAAAQAAAAMAAAAB////xAAAAAL////DAAAAAgAAABNjb2xybmNseAABAA0ABoAAAAAQcGl4aQAAAAADCAgIAAAAGGlwbWEAAAAAAAAAAQABBYECgwQFAAAAN21kYXQAAAArKAGvBPITXaByNU6ej/IHLbOTnSc+gFLChSd9LdaAZMExftSSICcE8XAd/A==',
  'base64',
)
const SYNTHETIC_ANIMATED_WEBP = Buffer.from(
  'UklGRsAAAABXRUJQVlA4WAoAAAACAAAAAwAAAgAAQU5JTQYAAAD/////AABBTk1GSAAAAAAAAAAAAAMAAAIAAGQAAAJWUDggMAAAANABAJ0BKgQAAwACADQloAJ0ugH4AAOwAP7wxAv/ILlhdcjX/yA/5Af8gP/48gAAAEFOTUZEAAAAAAAAAAAAAwAAAgAAZAAAAFZQOCAsAAAAlAEAnQEqBAADAAAANCWgAnS6AAOYAP75k2//kB//kB//kB//ID/iF3sgMAA=',
  'base64',
)

async function expectValidationReason(
  operation: Promise<unknown>,
  expectedReason: string,
): Promise<void> {
  try {
    await operation
    throw new Error('Expected ApiProblemError')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiProblemError)
    if (error instanceof ApiProblemError) {
      expect(error.reason).toBe('validation_error')
      expect(error.problem.errors?.[0]?.reason).toBe(expectedReason)
    }
  }
}

async function syntheticImage(
  format: 'jpeg' | 'png' | 'webp',
  width = 4,
  height = 3,
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 120, g: 140, b: 160 },
    },
  })
    [format]()
    .toBuffer()
}

function streamFrom(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk)
      controller.close()
    },
  })
}

function insertPngChunk(png: Buffer, type: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length, 0)
  chunk.write(type, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length)
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)])
}

describe('detectImageMime', () => {
  it('detects supported magic bytes', async () => {
    expect(detectImageMime(await syntheticImage('jpeg'))).toBe('image/jpeg')
    expect(detectImageMime(await syntheticImage('png'))).toBe('image/png')
    expect(detectImageMime(await syntheticImage('webp'))).toBe('image/webp')
    expect(detectImageMime(SYNTHETIC_HEIC)).toBe('image/heic')
  })

  it('does not infer a format from arbitrary bytes', () => {
    expect(detectImageMime(Buffer.from('not-an-image'))).toBeNull()
  })

  it('rejects generic HEIF and AVIF brands as HEIC', async () => {
    const genericHeif = Buffer.alloc(16)
    genericHeif.writeUInt32BE(16)
    genericHeif.write('ftyp', 4)
    genericHeif.write('mif1', 8)

    const avif = await sharp({
      create: {
        width: 4,
        height: 3,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .avif()
      .toBuffer()
    avif.write('mif1', 8)

    expect(detectImageMime(genericHeif)).toBeNull()
    expect(detectImageMime(avif)).toBeNull()
  })
})

describe('readUploadedImageStream', () => {
  it('reads chunks without exceeding the limit', async () => {
    const result = await readUploadedImageStream(
      streamFrom(Uint8Array.from([1, 2]), Uint8Array.from([3, 4])),
      4,
    )
    expect(result).toEqual(Buffer.from([1, 2, 3, 4]))
  })

  it('rejects an oversized declared size before reading', async () => {
    const getReader = vi.fn()
    const cancel = vi.fn().mockResolvedValue(undefined)
    const stream = { cancel, getReader } as unknown as ReadableStream<Uint8Array>

    await expectValidationReason(
      readUploadedImageStream(stream, MAX_UPLOAD_FILE_SIZE + 1),
      'file_too_large',
    )
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(getReader).not.toHaveBeenCalled()
  })

  it('cancels when streamed bytes exceed the limit', async () => {
    await expectValidationReason(
      readUploadedImageStream(
        streamFrom(new Uint8Array(MAX_UPLOAD_FILE_SIZE), Uint8Array.from([1])),
      ),
      'file_too_large',
    )
  })
})

describe('verifyUploadedImage', () => {
  it('rejects an oversized declared size without a stream', () => {
    expect(() => assertUploadedImageSize(MAX_UPLOAD_FILE_SIZE + 1)).toThrow(ApiProblemError)
  })

  it('returns decoded dimensions and byte size from the Storage object', async () => {
    const buffer = await syntheticImage('png', 7, 5)
    const verified = await verifyUploadedImage(buffer, 'image/png', 'image/png')

    expect(verified).toMatchObject({
      contentType: 'image/png',
      width: 7,
      height: 5,
      fileSize: buffer.length,
    })
    expect(verified.buffer).toEqual(buffer)
  })

  it('uses dimensions after applying EXIF orientation', async () => {
    const buffer = await sharp({
      create: {
        width: 6,
        height: 4,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()

    const verified = await verifyUploadedImage(buffer, 'image/jpeg', 'image/jpeg')

    expect(verified.width).toBe(4)
    expect(verified.height).toBe(6)
  })

  it('rejects a magic-byte mismatch with a stable reason', async () => {
    const png = await syntheticImage('png')
    await expectValidationReason(
      verifyUploadedImage(png, 'image/png', 'image/jpeg'),
      'content_type_mismatch',
    )
  })

  it('rejects a Storage MIME mismatch with a stable reason', async () => {
    const jpeg = await syntheticImage('jpeg')
    await expectValidationReason(
      verifyUploadedImage(jpeg, 'image/png', 'image/jpeg'),
      'content_type_mismatch',
    )
  })

  it('rejects corrupt image content with a stable reason', async () => {
    const truncatedJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00])
    await expectValidationReason(
      verifyUploadedImage(truncatedJpeg, 'image/jpeg', 'image/jpeg'),
      'invalid_image_content',
    )
  })

  it('rejects an object over 10 MiB before decoding', async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_FILE_SIZE + 1)
    await expectValidationReason(
      verifyUploadedImage(oversized, 'image/jpeg', 'image/jpeg'),
      'file_too_large',
    )
  })

  it('rejects decoded dimensions over 10000 px', async () => {
    const oversizedDimension = await syntheticImage('png', 10_001, 1)
    await expectValidationReason(
      verifyUploadedImage(oversizedDimension, 'image/png', 'image/png'),
      'image_dimensions_too_large',
    )
  })

  it('normalizes the Sharp metadata pixel limit to a stable dimension reason', async () => {
    const extremeDimensions = await syntheticImage('png', 1, 1)
    extremeDimensions.writeUInt32BE(10_001, 16)
    extremeDimensions.writeUInt32BE(10_001, 20)
    extremeDimensions.writeUInt32BE(crc32(extremeDimensions.subarray(12, 29)), 29)

    await expectValidationReason(
      verifyUploadedImage(extremeDimensions, 'image/png', 'image/png'),
      'image_dimensions_too_large',
    )
  })

  it('rejects images over the total pixel limit before full decode', async () => {
    const width = 5_001
    const height = Math.floor(MAX_UPLOAD_PIXELS / 5_000)
    const oversizedPixels = await syntheticImage('png', width, height)
    await expectValidationReason(
      verifyUploadedImage(oversizedPixels, 'image/png', 'image/png'),
      'image_dimensions_too_large',
    )
  })

  it('rejects direct HEIC upload with a stable reason', async () => {
    await expectValidationReason(
      verifyUploadedImage(SYNTHETIC_HEIC, 'image/heic', 'image/heic'),
      'unsupported_media_type',
    )
  })

  it('rejects animated WebP with a stable reason', async () => {
    await expectValidationReason(
      verifyUploadedImage(SYNTHETIC_ANIMATED_WEBP, 'image/webp', 'image/webp'),
      'animated_image_not_supported',
    )
  })

  it('rejects PNG containing an APNG animation-control chunk', async () => {
    const png = await syntheticImage('png')
    const animationControl = Buffer.alloc(8)
    animationControl.writeUInt32BE(2, 0)
    const apng = insertPngChunk(png, 'acTL', animationControl)

    await expectValidationReason(
      verifyUploadedImage(apng, 'image/png', 'image/png'),
      'animated_image_not_supported',
    )
  })
})

describe('sanitizeUploadedImage', () => {
  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)('re-encodes %s without embedded metadata', async (format, contentType) => {
    const source = await sharp({
      create: {
        width: 6,
        height: 4,
        channels: 3,
        background: { r: 120, g: 140, b: 160 },
      },
    })
      [format]()
      .withMetadata({
        orientation: 6,
        exif: {
          IFD0: { Make: 'synthetic-camera' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '1/1 2/1 3/1' },
        },
      })
      .toBuffer()
    const sourceMetadata = await sharp(source).metadata()
    expect(sourceMetadata.exif).toBeDefined()
    const verified = await verifyUploadedImage(source, contentType, contentType)

    const sanitized = await sanitizeUploadedImage(verified)
    const metadata = await sharp(sanitized.buffer).metadata()

    expect(sanitized.contentType).toBe(contentType)
    expect(sanitized.width).toBe(4)
    expect(sanitized.height).toBe(6)
    expect(sanitized.fileSize).toBe(sanitized.buffer.length)
    expect(metadata.width).toBe(4)
    expect(metadata.height).toBe(6)
    expect(metadata.orientation).toBeUndefined()
    expect(metadata.exif).toBeUndefined()
    expect(metadata.xmp).toBeUndefined()
    expect(metadata.iptc).toBeUndefined()
  })

  it('documents the original re-encoding quality and compression limits', () => {
    expect(sanitizedImagePolicy).toEqual({
      jpegQuality: 90,
      webpQuality: 90,
      pngCompressionLevel: 9,
    })
  })

  it('rejects a sanitized buffer over the upload size limit', async () => {
    const verified = {
      buffer: await syntheticImage('png'),
      contentType: 'image/png' as const,
      width: 4,
      height: 3,
      fileSize: 100,
    }
    const sharpToBuffer = vi.spyOn(sharp.prototype, 'toBuffer')
    sharpToBuffer.mockResolvedValueOnce(Buffer.alloc(MAX_UPLOAD_FILE_SIZE + 1))

    await expectValidationReason(sanitizeUploadedImage(verified), 'file_too_large')
    sharpToBuffer.mockRestore()
  })
})
