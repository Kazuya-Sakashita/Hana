import { describe, expect, it } from 'vitest'
import { isMediaTypeSupportedByClaude, parseJsonResponse } from '@/features/ai/server/generate'

describe('isMediaTypeSupportedByClaude', () => {
  it('accepts the 4 Claude-supported MIME types', () => {
    expect(isMediaTypeSupportedByClaude('image/jpeg')).toBe(true)
    expect(isMediaTypeSupportedByClaude('image/png')).toBe(true)
    expect(isMediaTypeSupportedByClaude('image/webp')).toBe(true)
    expect(isMediaTypeSupportedByClaude('image/gif')).toBe(true)
  })

  it('rejects HEIC (not supported by Claude API natively)', () => {
    expect(isMediaTypeSupportedByClaude('image/heic')).toBe(false)
  })

  it('rejects video / pdf / etc', () => {
    expect(isMediaTypeSupportedByClaude('video/mp4')).toBe(false)
    expect(isMediaTypeSupportedByClaude('application/pdf')).toBe(false)
  })
})

describe('parseJsonResponse', () => {
  it('parses plain JSON', () => {
    const out = parseJsonResponse('{"title":"はじめて","body":"きょうは...","tags":["はじめて"]}')
    expect(out).toEqual({ title: 'はじめて', body: 'きょうは...', tags: ['はじめて'] })
  })

  it('strips ```json fence', () => {
    const text = '```json\n{"title":"a","body":"b","tags":[]}\n```'
    expect(parseJsonResponse(text)).toEqual({ title: 'a', body: 'b', tags: [] })
  })

  it('strips ``` fence without language', () => {
    const text = '```\n{"title":"a","body":"b","tags":[]}\n```'
    expect(parseJsonResponse(text)).toEqual({ title: 'a', body: 'b', tags: [] })
  })

  it('extracts JSON from surrounding text', () => {
    const text = 'はい、おまかせください。\n\n{"title":"x","body":"y","tags":[]}\n\nどうぞ。'
    expect(parseJsonResponse(text)).toEqual({ title: 'x', body: 'y', tags: [] })
  })

  it('limits tags to 5 strings', () => {
    const out = parseJsonResponse('{"title":"a","body":"b","tags":["1","2","3","4","5","6","7"]}')
    expect(out.tags).toEqual(['1', '2', '3', '4', '5'])
  })

  it('drops tags > 30 chars', () => {
    const out = parseJsonResponse(
      `{"title":"a","body":"b","tags":["ok","${'x'.repeat(31)}","ok2"]}`,
    )
    expect(out.tags).toEqual(['ok', 'ok2'])
  })

  it('drops non-string tags', () => {
    const out = parseJsonResponse('{"title":"a","body":"b","tags":["ok",123,null,"yes"]}')
    expect(out.tags).toEqual(['ok', 'yes'])
  })

  it('throws if title is missing', () => {
    expect(() => parseJsonResponse('{"body":"b","tags":[]}')).toThrow()
  })

  it('throws if body is missing', () => {
    expect(() => parseJsonResponse('{"title":"a","tags":[]}')).toThrow()
  })

  it('throws on invalid JSON', () => {
    expect(() => parseJsonResponse('not json at all')).toThrow()
  })

  it('throws on empty title', () => {
    expect(() => parseJsonResponse('{"title":"","body":"b","tags":[]}')).toThrow()
  })
})
