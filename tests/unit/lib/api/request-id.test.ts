import { describe, expect, it } from 'vitest'
import { REQUEST_ID_PATTERN, generateRequestId, isRequestId } from '@/lib/api/request-id'

describe('generateRequestId', () => {
  it('matches the req_<uuid> pattern', () => {
    const id = generateRequestId()
    expect(id).toMatch(REQUEST_ID_PATTERN)
  })

  it('produces unique values across calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateRequestId()))
    expect(ids.size).toBe(50)
  })
})

describe('isRequestId', () => {
  it('accepts a freshly generated id', () => {
    expect(isRequestId(generateRequestId())).toBe(true)
  })

  it('rejects non-string and malformed values', () => {
    expect(isRequestId('req_invalid')).toBe(false)
    expect(isRequestId('01HXYZ')).toBe(false)
    expect(isRequestId(undefined)).toBe(false)
    expect(isRequestId(123)).toBe(false)
    expect(isRequestId(null)).toBe(false)
  })
})
