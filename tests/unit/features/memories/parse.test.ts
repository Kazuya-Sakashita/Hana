import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import {
  encodeCursor,
  isUuid,
  parseListMemoriesQuery,
  parseMemoryCreate,
  parseMemoryUpdate,
} from '@/features/memories/server/parse'

function expectValidationError(fn: () => unknown, expectedPath: string) {
  try {
    fn()
    throw new Error('Expected ApiProblemError to be thrown')
  } catch (e) {
    expect(e).toBeInstanceOf(ApiProblemError)
    if (e instanceof ApiProblemError) {
      expect(e.reason).toBe('validation_error')
      const paths = (e.problem.errors ?? []).map((x) => x.path)
      expect(paths).toContain(expectedPath)
    }
  }
}

const VALID_UUID = '4a2c89b6-1234-4d8e-9abc-fedcba987654'
const VALID_UUID_2 = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'

describe('parseMemoryCreate', () => {
  const base = {
    child_id: VALID_UUID,
    title: 'はじめての すなあそび',
    recorded_at: '2026-05-23',
    image_ids: [VALID_UUID_2],
    ai_generated: false,
  }

  it('parses a valid body', () => {
    const out = parseMemoryCreate(base)
    expect(out.childId).toBe(VALID_UUID)
    expect(out.title).toBe('はじめての すなあそび')
    expect(out.recordedAt.toISOString().slice(0, 10)).toBe('2026-05-23')
    expect(out.imageIds).toEqual([VALID_UUID_2])
    expect(out.aiGenerated).toBe(false)
    expect(out.body).toBeNull()
    expect(out.weather).toBeNull()
  })

  it('rejects missing child_id', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, child_id: undefined }),
      'body.child_id',
    )
  })

  it('rejects invalid UUID', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, child_id: 'not-uuid' }),
      'body.child_id',
    )
  })

  it('rejects empty title', () => {
    expectValidationError(() => parseMemoryCreate({ ...base, title: '' }), 'body.title')
  })

  it('rejects title > 100 chars', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, title: 'あ'.repeat(101) }),
      'body.title',
    )
  })

  it('rejects future recorded_at', () => {
    const tomorrow = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    expectValidationError(
      () => parseMemoryCreate({ ...base, recorded_at: tomorrow }),
      'body.recorded_at',
    )
  })

  it('rejects empty image_ids', () => {
    expectValidationError(() => parseMemoryCreate({ ...base, image_ids: [] }), 'body.image_ids')
  })

  it('rejects > 5 image_ids', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, image_ids: Array(6).fill(VALID_UUID_2) }),
      'body.image_ids',
    )
  })

  it('rejects duplicate image_ids', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, image_ids: [VALID_UUID_2, VALID_UUID_2] }),
      'body.image_ids',
    )
  })

  it('rejects invalid image_id format', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, image_ids: ['not-uuid'] }),
      'body.image_ids[0]',
    )
  })

  it('rejects body > 1000 chars', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, body: 'あ'.repeat(1001) }),
      'body.body',
    )
  })

  it('rejects missing ai_generated', () => {
    expectValidationError(
      () => parseMemoryCreate({ ...base, ai_generated: undefined }),
      'body.ai_generated',
    )
  })
})

describe('parseMemoryUpdate', () => {
  it('returns empty patch for empty body', () => {
    expect(parseMemoryUpdate({})).toEqual({})
  })

  it('passes through individual fields', () => {
    expect(parseMemoryUpdate({ title: 'なおした' })).toEqual({ title: 'なおした' })
    expect(parseMemoryUpdate({ is_favorite: true })).toEqual({ isFavorite: true })
    expect(parseMemoryUpdate({ body: null })).toEqual({ body: null })
  })

  it('rejects non-boolean is_favorite', () => {
    expectValidationError(() => parseMemoryUpdate({ is_favorite: 'yes' }), 'body.is_favorite')
  })

  it('rejects title > 100', () => {
    expectValidationError(() => parseMemoryUpdate({ title: 'あ'.repeat(101) }), 'body.title')
  })
})

describe('parseListMemoriesQuery', () => {
  it('returns default limit and null cursor when query is empty', () => {
    const url = new URL('http://localhost/v1/memories')
    expect(parseListMemoriesQuery(url)).toEqual({
      limit: 20,
      cursor: null,
      recordedFrom: null,
      recordedBefore: null,
    })
  })

  it('parses limit', () => {
    const url = new URL('http://localhost/v1/memories?limit=5')
    expect(parseListMemoriesQuery(url).limit).toBe(5)
  })

  it('rejects limit out of range', () => {
    const url = new URL('http://localhost/v1/memories?limit=999')
    expectValidationError(() => parseListMemoriesQuery(url), 'query.limit')
  })

  it('round-trips encodeCursor', () => {
    const cursor = encodeCursor(VALID_UUID)
    const url = new URL(`http://localhost/v1/memories?cursor=${cursor}`)
    expect(parseListMemoriesQuery(url).cursor).toEqual({ id: VALID_UUID })
  })

  it('rejects invalid cursor', () => {
    const url = new URL('http://localhost/v1/memories?cursor=garbage')
    expectValidationError(() => parseListMemoriesQuery(url), 'query.cursor')
  })

  it('parses an inclusive-exclusive recorded date range', () => {
    const url = new URL(
      'http://localhost/v1/memories?recorded_from=2026-05-01&recorded_before=2026-06-01',
    )
    const query = parseListMemoriesQuery(url)
    expect(query.recordedFrom?.toISOString()).toBe('2026-05-01T00:00:00.000Z')
    expect(query.recordedBefore?.toISOString()).toBe('2026-06-01T00:00:00.000Z')
  })

  it('requires both recorded range boundaries', () => {
    const url = new URL('http://localhost/v1/memories?recorded_from=2026-05-01')
    expectValidationError(() => parseListMemoriesQuery(url), 'query.recorded_before')
  })

  it('rejects an invalid or empty recorded range', () => {
    const invalidDate = new URL(
      'http://localhost/v1/memories?recorded_from=2026-02-30&recorded_before=2026-03-01',
    )
    expectValidationError(() => parseListMemoriesQuery(invalidDate), 'query.recorded_from')

    const emptyRange = new URL(
      'http://localhost/v1/memories?recorded_from=2026-05-01&recorded_before=2026-05-01',
    )
    expectValidationError(() => parseListMemoriesQuery(emptyRange), 'query.recorded_before')
  })
})

describe('isUuid', () => {
  it('accepts canonical UUID', () => {
    expect(isUuid(VALID_UUID)).toBe(true)
  })

  it('rejects non-UUID', () => {
    expect(isUuid('nope')).toBe(false)
  })
})
