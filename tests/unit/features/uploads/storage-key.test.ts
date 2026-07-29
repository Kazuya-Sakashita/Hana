import { describe, expect, it } from 'vitest'
import {
  ALLOWED_MIMES,
  extensionForMime,
  generateStorageKey,
  isValidStorageKey,
  mimeForExtension,
  storageKeyBelongsToUser,
  storageKeyPrefixForUser,
  userIdHash,
  yyyymm,
} from '@/features/uploads/server/storage-key'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'
const OTHER_USER_ID = '11111111-2222-4333-8444-555555555555'

describe('userIdHash', () => {
  it('returns a 16-char hex string', () => {
    const h = userIdHash(USER_ID)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is deterministic for the same user', () => {
    expect(userIdHash(USER_ID)).toBe(userIdHash(USER_ID))
  })

  it('produces different hashes for different users', () => {
    expect(userIdHash(USER_ID)).not.toBe(userIdHash(OTHER_USER_ID))
  })

  it('never includes the raw user id', () => {
    expect(userIdHash(USER_ID)).not.toContain(USER_ID)
  })
})

describe('extensionForMime / mimeForExtension', () => {
  it('maps the 3 direct-upload mimes', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg')
    expect(extensionForMime('image/png')).toBe('png')
    expect(extensionForMime('image/webp')).toBe('webp')
    expect(extensionForMime('image/heic')).toBeNull()
  })

  it('returns null for unknown mime', () => {
    expect(extensionForMime('image/gif')).toBeNull()
    expect(extensionForMime('application/pdf')).toBeNull()
  })

  it('reverses extension to mime', () => {
    expect(mimeForExtension('jpg')).toBe('image/jpeg')
    expect(mimeForExtension('heic')).toBe('image/heic')
    expect(mimeForExtension('exe')).toBeNull()
  })

  it('ALLOWED_MIMES has 3 entries', () => {
    expect(ALLOWED_MIMES).toHaveLength(3)
  })
})

describe('yyyymm', () => {
  it('formats UTC year+month with zero-padding', () => {
    expect(yyyymm(new Date('2026-01-13T00:00:00Z'))).toBe('202601')
    expect(yyyymm(new Date('2026-12-31T23:59:59Z'))).toBe('202612')
  })
})

describe('generateStorageKey', () => {
  it('produces a key matching the documented pattern', () => {
    const key = generateStorageKey(USER_ID, 'image/jpeg')
    expect(isValidStorageKey(key)).toBe(true)
  })

  it('embeds the userIdHash (not raw user_id)', () => {
    const key = generateStorageKey(USER_ID, 'image/jpeg')
    expect(key).toContain(userIdHash(USER_ID))
    expect(key).not.toContain(USER_ID)
  })

  it('uses extension matching the mime', () => {
    expect(generateStorageKey(USER_ID, 'image/png').endsWith('.png')).toBe(true)
  })

  it('throws on unsupported mime', () => {
    expect(() => generateStorageKey(USER_ID, 'image/gif')).toThrow()
    expect(() => generateStorageKey(USER_ID, 'image/heic')).toThrow()
  })

  it('generates a different uuid on each call', () => {
    const a = generateStorageKey(USER_ID, 'image/jpeg')
    const b = generateStorageKey(USER_ID, 'image/jpeg')
    expect(a).not.toBe(b)
  })
})

describe('isValidStorageKey', () => {
  it('accepts valid keys', () => {
    expect(
      isValidStorageKey('uploads/abcdef0123456789/202605/a1b2c3d4-1234-4d8e-9abc-fedcba987654.jpg'),
    ).toBe(true)
  })

  it('rejects keys with wrong prefix', () => {
    expect(
      isValidStorageKey('foo/abcdef0123456789/202605/a1b2c3d4-1234-4d8e-9abc-fedcba987654.jpg'),
    ).toBe(false)
  })

  it('rejects keys with wrong ext', () => {
    expect(
      isValidStorageKey('uploads/abcdef0123456789/202605/a1b2c3d4-1234-4d8e-9abc-fedcba987654.gif'),
    ).toBe(false)
  })

  it('rejects directory traversal attempts', () => {
    expect(
      isValidStorageKey(
        'uploads/abcdef0123456789/../other/a1b2c3d4-1234-4d8e-9abc-fedcba987654.jpg',
      ),
    ).toBe(false)
  })
})

describe('storageKeyBelongsToUser', () => {
  it('returns true for own prefix', () => {
    const key = generateStorageKey(USER_ID, 'image/jpeg')
    expect(storageKeyBelongsToUser(key, USER_ID)).toBe(true)
  })

  it('returns false for another user', () => {
    const key = generateStorageKey(USER_ID, 'image/jpeg')
    expect(storageKeyBelongsToUser(key, OTHER_USER_ID)).toBe(false)
  })

  it('storageKeyPrefixForUser is the start of generated keys', () => {
    const prefix = storageKeyPrefixForUser(USER_ID)
    const key = generateStorageKey(USER_ID, 'image/jpeg')
    expect(key.startsWith(prefix)).toBe(true)
  })
})
