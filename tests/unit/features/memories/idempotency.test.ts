import { describe, expect, it } from 'vitest'
import { parseMemoryIdempotencyKey } from '@/features/memories/server/idempotency'

describe('parseMemoryIdempotencyKey', () => {
  it('accepts the shared bare UUID contract and canonicalizes it', () => {
    const request = new Request('http://localhost/v1/memories', {
      headers: { 'Idempotency-Key': 'ABCDEFAB-CDEF-9999-7000-ABCDEFABCDEF' },
    })

    expect(parseMemoryIdempotencyKey(request)).toBe('abcdefab-cdef-9999-7000-abcdefabcdef')
  })

  it('rejects a UUID URN because the OpenAPI contract is bare UUID only', () => {
    const request = new Request('http://localhost/v1/memories', {
      headers: { 'Idempotency-Key': 'urn:uuid:00000000-0000-0000-0000-000000000000' },
    })

    expect(() => parseMemoryIdempotencyKey(request)).toThrow()
  })
})
