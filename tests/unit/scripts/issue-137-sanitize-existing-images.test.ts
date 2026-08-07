import { describe, expect, it } from 'vitest'
import { MAX_UPLOAD_FILE_SIZE } from '@/features/uploads/server/image-limits'
import {
  readResponseWithLimit,
  STORAGE_FENCE_TIMEOUT_MS,
  storageReplacementOptions,
  TRANSACTION_TIMEOUT_MS,
} from '../../../scripts/maintenance/issue-137-sanitize-existing-images'

describe('ISSUE-137 existing image maintenance script', () => {
  it('reads a bounded response', async () => {
    const response = new Response(Uint8Array.from([1, 2, 3]), {
      headers: { 'content-length': '3' },
    })

    await expect(readResponseWithLimit(response)).resolves.toEqual(Buffer.from([1, 2, 3]))
  })

  it('rejects an oversized declared length before reading the body', async () => {
    const response = new Response(Uint8Array.from([1]), {
      headers: { 'content-length': String(MAX_UPLOAD_FILE_SIZE + 1) },
    })

    await expect(readResponseWithLimit(response)).rejects.toThrow('source_too_large')
  })

  it('stops an untrusted stream when bytes exceed the limit', async () => {
    const chunk = new Uint8Array(MAX_UPLOAD_FILE_SIZE)
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(chunk)
          controller.enqueue(Uint8Array.from([1]))
          controller.close()
        },
      }),
    )

    await expect(readResponseWithLimit(response)).rejects.toThrow('source_too_large')
  })

  it('bounds Storage work inside the transaction fence and never recreates a deleted object', () => {
    expect(STORAGE_FENCE_TIMEOUT_MS).toBeLessThan(TRANSACTION_TIMEOUT_MS)
    expect(storageReplacementOptions('image/jpeg')).toEqual({
      contentType: 'image/jpeg',
      cacheControl: '300',
      upsert: false,
    })
  })
})
