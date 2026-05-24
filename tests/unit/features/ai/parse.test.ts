import { describe, expect, it } from 'vitest'
import { ApiProblemError } from '@/lib/api/error'
import { parseAiGenerateRequest } from '@/features/ai/server/parse'

function expectValidationError(fn: () => unknown, expectedPath: string) {
  try {
    fn()
    throw new Error('Expected ApiProblemError')
  } catch (e) {
    expect(e).toBeInstanceOf(ApiProblemError)
    if (e instanceof ApiProblemError) {
      expect(e.reason).toBe('validation_error')
      const paths = (e.problem.errors ?? []).map((x) => x.path)
      expect(paths).toContain(expectedPath)
    }
  }
}

const CHILD = '4a2c89b6-1234-4d8e-9abc-fedcba987654'
const IMAGE = 'a1b2c3d4-1234-4d8e-9abc-fedcba987654'

describe('parseAiGenerateRequest', () => {
  it('parses a minimal valid body', () => {
    const out = parseAiGenerateRequest({ child_id: CHILD, image_ids: [IMAGE] })
    expect(out.childId).toBe(CHILD)
    expect(out.imageIds).toEqual([IMAGE])
    expect(out.recordedAt).toBeNull()
    expect(out.weather).toBeNull()
    expect(out.parentNote).toBeNull()
  })

  it('parses all optional fields', () => {
    const out = parseAiGenerateRequest({
      child_id: CHILD,
      image_ids: [IMAGE],
      recorded_at: '2026-05-23',
      weather: 'はれ',
      parent_note: 'はじめての すなあそび',
    })
    expect(out.recordedAt?.toISOString().slice(0, 10)).toBe('2026-05-23')
    expect(out.weather).toBe('はれ')
    expect(out.parentNote).toBe('はじめての すなあそび')
  })

  it('rejects missing child_id', () => {
    expectValidationError(() => parseAiGenerateRequest({ image_ids: [IMAGE] }), 'body.child_id')
  })

  it('rejects malformed UUID child_id', () => {
    expectValidationError(
      () => parseAiGenerateRequest({ child_id: 'not-uuid', image_ids: [IMAGE] }),
      'body.child_id',
    )
  })

  it('rejects empty image_ids', () => {
    expectValidationError(
      () => parseAiGenerateRequest({ child_id: CHILD, image_ids: [] }),
      'body.image_ids',
    )
  })

  it('rejects > 5 image_ids', () => {
    expectValidationError(
      () => parseAiGenerateRequest({ child_id: CHILD, image_ids: Array(6).fill(IMAGE) }),
      'body.image_ids',
    )
  })

  it('rejects duplicate image_ids', () => {
    expectValidationError(
      () => parseAiGenerateRequest({ child_id: CHILD, image_ids: [IMAGE, IMAGE] }),
      'body.image_ids',
    )
  })

  it('rejects parent_note > 200', () => {
    expectValidationError(
      () =>
        parseAiGenerateRequest({
          child_id: CHILD,
          image_ids: [IMAGE],
          parent_note: 'あ'.repeat(201),
        }),
      'body.parent_note',
    )
  })

  it('rejects invalid recorded_at format', () => {
    expectValidationError(
      () =>
        parseAiGenerateRequest({
          child_id: CHILD,
          image_ids: [IMAGE],
          recorded_at: '2026/05/23',
        }),
      'body.recorded_at',
    )
  })

  it('accepts null for optional fields', () => {
    const out = parseAiGenerateRequest({
      child_id: CHILD,
      image_ids: [IMAGE],
      recorded_at: null,
      weather: null,
      parent_note: null,
    })
    expect(out.recordedAt).toBeNull()
    expect(out.weather).toBeNull()
    expect(out.parentNote).toBeNull()
  })
})
