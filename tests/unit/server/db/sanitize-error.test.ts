import { describe, expect, it } from 'vitest'
import { sanitizeDbError } from '@/server/db/sanitize-error'

describe('sanitizeDbError', () => {
  it('redacts password in postgres URL inside Error.message', () => {
    const err = new Error(
      'Connection failed: postgresql://postgres.abc:supersecret@db.example.com:5432/postgres',
    )
    expect(sanitizeDbError(err)).toBe(
      'Connection failed: postgresql://postgres.abc:***@db.example.com:5432/postgres',
    )
  })

  it('handles bare strings', () => {
    expect(sanitizeDbError('postgres://u:p@h:5432/d')).toBe('postgres://u:***@h:5432/d')
  })

  it('preserves messages with no credentials', () => {
    expect(sanitizeDbError('relation "users" does not exist')).toBe(
      'relation "users" does not exist',
    )
  })

  it('redacts multiple URLs in a single message', () => {
    const msg = 'fallback from postgres://a:1@h1/d to postgres://b:2@h2/d'
    expect(sanitizeDbError(msg)).toBe(
      'fallback from postgres://a:***@h1/d to postgres://b:***@h2/d',
    )
  })
})
