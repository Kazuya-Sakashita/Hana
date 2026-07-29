import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import {
  parsePresignedUploadRequest,
  parseUploadConfirmRequest,
} from '@/features/uploads/server/parse'

function expectValidationError(fn: () => void, expectedPath: string) {
  try {
    fn()
    throw new Error('Expected ApiProblemError to be thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(ApiProblemError)
    if (e instanceof ApiProblemError) {
      expect(e.reason).toBe('validation_error')
      expect(e.status).toBe(422)
      const paths = (e.problem.errors ?? []).map((x) => x.path)
      expect(paths).toContain(expectedPath)
    }
  }
}

describe('parsePresignedUploadRequest', () => {
  it('returns fileName + contentType for a valid body', () => {
    expect(parsePresignedUploadRequest({ file_name: 'a.jpg', content_type: 'image/jpeg' })).toEqual(
      { fileName: 'a.jpg', contentType: 'image/jpeg' },
    )
  })

  it('rejects missing fields', () => {
    expectValidationError(() => parsePresignedUploadRequest({}), 'body.file_name')
  })

  it('rejects unsupported content_type', () => {
    expectValidationError(
      () => parsePresignedUploadRequest({ file_name: 'a.gif', content_type: 'image/gif' }),
      'body.content_type',
    )
  })

  it('rejects file_name longer than 255', () => {
    expectValidationError(
      () =>
        parsePresignedUploadRequest({
          file_name: 'a'.repeat(256),
          content_type: 'image/jpeg',
        }),
      'body.file_name',
    )
  })

  it('rejects non-object body', () => {
    expectValidationError(() => parsePresignedUploadRequest('nope'), 'body')
  })
})

describe('parseUploadConfirmRequest', () => {
  const valid = {
    storage_key: 'uploads/abcdef0123456789/202605/a1b2c3d4-1234-4d8e-9abc-fedcba987654.jpg',
    width: 1920,
    height: 1080,
    file_size: 524288,
  }

  it('parses a valid body', () => {
    expect(parseUploadConfirmRequest(valid)).toEqual({
      storageKey: valid.storage_key,
    })
  })

  it('rejects missing storage_key', () => {
    expectValidationError(
      () => parseUploadConfirmRequest({ ...valid, storage_key: undefined }),
      'body.storage_key',
    )
  })

  it('accepts omitted legacy measurement hints', () => {
    expect(parseUploadConfirmRequest({ storage_key: valid.storage_key })).toEqual({
      storageKey: valid.storage_key,
    })
  })

  it('validates legacy hints when present without returning them', () => {
    expectValidationError(
      () => parseUploadConfirmRequest({ ...valid, width: 'untrusted' }),
      'body.width',
    )
    expectValidationError(() => parseUploadConfirmRequest({ ...valid, height: -1 }), 'body.height')
    expectValidationError(
      () => parseUploadConfirmRequest({ ...valid, file_size: Number.MAX_SAFE_INTEGER }),
      'body.file_size',
    )
  })
})
