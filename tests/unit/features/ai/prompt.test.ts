import { describe, expect, it } from 'vitest'
import {
  buildUserPrompt,
  computeAge,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
} from '@/features/ai/server/prompt'

describe('SYSTEM_PROMPT', () => {
  it('includes banned phrases from PRD §9', () => {
    expect(SYSTEM_PROMPT).toContain('奇跡のような瞬間')
    expect(SYSTEM_PROMPT).toContain('天使のような笑顔')
    expect(SYSTEM_PROMPT).toContain('涙が溢れました')
  })

  it('instructs JSON-only output', () => {
    expect(SYSTEM_PROMPT).toMatch(/JSON のみを返してください/)
  })

  it('forbids AI self-reference', () => {
    expect(SYSTEM_PROMPT).toContain('AI である自分への言及')
  })

  it('has a stable PROMPT_VERSION', () => {
    expect(PROMPT_VERSION).toBe('v1')
  })
})

describe('buildUserPrompt', () => {
  it('includes child name + age + recorded_at', () => {
    const out = buildUserPrompt({
      childName: 'はると',
      ageMonths: 4,
      ageDays: 10,
      recordedAt: '2026-05-23',
      weather: null,
      parentNote: null,
    })
    expect(out).toContain('はると')
    expect(out).toContain('4 ヶ月')
    expect(out).toContain('10 日')
    expect(out).toContain('2026-05-23')
  })

  it('includes weather only when supplied', () => {
    const withWeather = buildUserPrompt({
      childName: 'はると',
      ageMonths: 4,
      ageDays: 10,
      recordedAt: '2026-05-23',
      weather: 'はれ',
      parentNote: null,
    })
    expect(withWeather).toContain('天気: はれ')

    const without = buildUserPrompt({
      childName: 'はると',
      ageMonths: 4,
      ageDays: 10,
      recordedAt: '2026-05-23',
      weather: null,
      parentNote: null,
    })
    expect(without).not.toContain('天気:')
  })

  it('includes parent_note only when supplied', () => {
    const withNote = buildUserPrompt({
      childName: 'はると',
      ageMonths: 4,
      ageDays: 10,
      recordedAt: '2026-05-23',
      weather: null,
      parentNote: 'はじめての すなあそび',
    })
    expect(withNote).toContain('親のひとこと: はじめての すなあそび')
  })

  it('does NOT include surname / email / birthdate (PII)', () => {
    const out = buildUserPrompt({
      childName: 'はると',
      ageMonths: 4,
      ageDays: 10,
      recordedAt: '2026-05-23',
      weather: 'はれ',
      parentNote: 'のーと',
    })
    expect(out).not.toContain('email')
    expect(out).not.toContain('birthdate')
    expect(out).not.toContain('@')
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}\s*生まれ/)
  })
})

describe('computeAge', () => {
  it('returns 0 months 0 days for the birth day', () => {
    const out = computeAge(new Date('2026-05-23T00:00:00Z'), new Date('2026-05-23T00:00:00Z'))
    expect(out).toEqual({ months: 0, days: 0 })
  })

  it('returns 4 months 7 days for typical case', () => {
    const out = computeAge(new Date('2026-01-13T00:00:00Z'), new Date('2026-05-20T00:00:00Z'))
    expect(out.months).toBe(4)
    expect(out.days).toBe(7)
  })

  it('handles month boundary correctly', () => {
    const out = computeAge(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-28T00:00:00Z'))
    // 2026-01-31 → 2026-02-28: 1ヶ月未満なので 0 months (Feb does not reach the 31st)
    expect(out.months).toBe(0)
  })

  it('clamps to 0 if recorded_at is before birthdate', () => {
    const out = computeAge(new Date('2026-05-23T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
    expect(out.months).toBe(0)
    expect(out.days).toBe(0)
  })

  it('handles year boundary', () => {
    const out = computeAge(new Date('2025-12-15T00:00:00Z'), new Date('2026-03-15T00:00:00Z'))
    expect(out.months).toBe(3)
    expect(out.days).toBe(0)
  })
})
