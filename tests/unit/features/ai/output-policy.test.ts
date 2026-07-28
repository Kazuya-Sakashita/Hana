import { describe, expect, it } from 'vitest'
import { evaluateAiOutputPolicy } from '@/features/ai/server/output-policy'

const SAFE_OUTPUT = {
  title: 'きろく',
  body: 'あ'.repeat(80),
}

describe('evaluateAiOutputPolicy', () => {
  it('accepts output inside the explicit policy boundary', () => {
    expect(evaluateAiOutputPolicy(SAFE_OUTPUT)).toEqual({ ok: true })
  })

  it.each([
    ['title_length_out_of_range', { ...SAFE_OUTPUT, title: 'あ'.repeat(11) }],
    ['body_length_out_of_range', { ...SAFE_OUTPUT, body: 'あ'.repeat(151) }],
    ['placeholder_detected', { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} ○○ちゃん` }],
    ['ai_self_reference', { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} Claudeが書きました` }],
    ['social_media_expression', { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} SNS映えする一枚です` }],
    [
      'medical_development_claim',
      { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} 運動能力が優れています` },
    ],
    [
      'emotion_assertion',
      { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} この瞬間、胸が熱くなりました` },
    ],
    [
      'exaggerated_expression',
      { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} 奇跡のような瞬間でした` },
    ],
    ['location_assertion', { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} 中央公園で遊びました` }],
  ])('returns only the stable category ID for %s', (categoryId, output) => {
    expect(evaluateAiOutputPolicy(output)).toEqual({
      ok: false,
      categoryIds: [categoryId],
    })
  })

  it('returns category IDs in deterministic order without rejected text', () => {
    const result = evaluateAiOutputPolicy({
      title: 'あ'.repeat(11),
      body: `${'あ'.repeat(151)} AIが生成しました`,
    })

    expect(result).toEqual({
      ok: false,
      categoryIds: ['title_length_out_of_range', 'body_length_out_of_range', 'ai_self_reference'],
    })
    expect(JSON.stringify(result)).not.toContain('AIが生成しました')
  })

  it('allows a location that the parent explicitly provided', () => {
    expect(
      evaluateAiOutputPolicy(
        { ...SAFE_OUTPUT, body: `${'あ'.repeat(80)}今日は中央公園で遊びました` },
        { userProvidedText: ['今日は中央公園で遊んだ'] },
      ),
    ).toEqual({ ok: true })
  })

  it.each([
    [79, false],
    [80, true],
    [150, true],
    [151, false],
  ])('applies the body length boundary at %s code points', (length, accepted) => {
    expect(evaluateAiOutputPolicy({ ...SAFE_OUTPUT, body: 'あ'.repeat(length) }).ok).toBe(accepted)
  })

  it.each([
    'キラキラした笑顔でした',
    '映える一枚になりました',
    'ChatGPTが作成しました',
    '私はAIです',
    'AIの下書きです',
    '発達は順調です',
    '東京都で遊びました',
  ])('rejects an explicit PRD example or close variant: %s', (phrase) => {
    expect(
      evaluateAiOutputPolicy({ ...SAFE_OUTPUT, body: `${'あ'.repeat(80)} ${phrase}` }).ok,
    ).toBe(false)
  })
})
