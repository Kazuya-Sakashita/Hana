import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import { isUuid, parseChildCreate, parseChildUpdate } from '@/features/children/server/parse'

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

describe('parseChildCreate', () => {
  it('returns trimmed name + parsed birthdate + null avatar_url', () => {
    const out = parseChildCreate({
      name: '  はると  ',
      birthdate: '2026-01-13',
      avatar_url: null,
    })
    expect(out.name).toBe('はると')
    expect(out.birthdate.toISOString().slice(0, 10)).toBe('2026-01-13')
    expect(out.avatarUrl).toBeNull()
  })

  it('rejects non-object body', () => {
    expectValidationError(() => parseChildCreate('not an object'), 'body')
  })

  it('rejects missing name', () => {
    expectValidationError(() => parseChildCreate({ birthdate: '2026-01-13' }), 'body.name')
  })

  it('rejects empty name (after trim)', () => {
    expectValidationError(
      () => parseChildCreate({ name: '   ', birthdate: '2026-01-13' }),
      'body.name',
    )
  })

  it('rejects name longer than 50 chars', () => {
    expectValidationError(
      () =>
        parseChildCreate({
          name: 'あ'.repeat(51),
          birthdate: '2026-01-13',
        }),
      'body.name',
    )
  })

  it('rejects missing birthdate', () => {
    expectValidationError(() => parseChildCreate({ name: 'はると' }), 'body.birthdate')
  })

  it('rejects invalid birthdate format', () => {
    expectValidationError(
      () => parseChildCreate({ name: 'はると', birthdate: '2026/01/13' }),
      'body.birthdate',
    )
  })

  it('rejects future birthdate', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    expectValidationError(
      () => parseChildCreate({ name: 'はると', birthdate: future }),
      'body.birthdate',
    )
  })
})

describe('parseChildUpdate', () => {
  it('returns empty patch when no fields supplied', () => {
    const out = parseChildUpdate({})
    expect(out).toEqual({})
  })

  it('returns only supplied fields', () => {
    const out = parseChildUpdate({ name: 'ゆいな' })
    expect(out).toEqual({ name: 'ゆいな' })
  })

  it('allows explicit null avatar_url', () => {
    const out = parseChildUpdate({ avatar_url: null })
    expect(out).toEqual({ avatarUrl: null })
  })

  it('rejects invalid name type', () => {
    expectValidationError(() => parseChildUpdate({ name: 123 }), 'body.name')
  })
})

describe('isUuid', () => {
  it('accepts canonical lowercase UUID v4', () => {
    expect(isUuid('4a2c89b6-1234-4d8e-9abc-fedcba987654')).toBe(true)
  })

  it('accepts uppercase UUID', () => {
    expect(isUuid('4A2C89B6-1234-4D8E-9ABC-FEDCBA987654')).toBe(true)
  })

  it('rejects non-UUID strings', () => {
    expect(isUuid('not-a-uuid')).toBe(false)
    expect(isUuid('12345')).toBe(false)
    expect(isUuid('')).toBe(false)
  })
})
