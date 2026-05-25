import { describe, expect, it } from 'vitest'
import { computeAge, formatAgeLabel } from '@/lib/age'

describe('computeAge', () => {
  it('returns 0/0 for the birth day', () => {
    const out = computeAge(new Date('2026-05-23T00:00:00Z'), new Date('2026-05-23T00:00:00Z'))
    expect(out).toEqual({ months: 0, days: 0 })
  })

  it('returns 4 months 7 days for typical case', () => {
    const out = computeAge(new Date('2026-01-13T00:00:00Z'), new Date('2026-05-20T00:00:00Z'))
    expect(out.months).toBe(4)
    expect(out.days).toBe(7)
  })

  it('handles month boundary', () => {
    const out = computeAge(new Date('2026-01-31T00:00:00Z'), new Date('2026-02-28T00:00:00Z'))
    expect(out.months).toBe(0)
  })

  it('clamps to 0/0 if recorded_at is before birthdate', () => {
    const out = computeAge(new Date('2026-05-23T00:00:00Z'), new Date('2026-01-01T00:00:00Z'))
    expect(out).toEqual({ months: 0, days: 0 })
  })

  it('handles year boundary', () => {
    const out = computeAge(new Date('2025-12-15T00:00:00Z'), new Date('2026-03-15T00:00:00Z'))
    expect(out.months).toBe(3)
    expect(out.days).toBe(0)
  })
})

describe('formatAgeLabel', () => {
  it('formats early days without months', () => {
    expect(formatAgeLabel({ months: 0, days: 14 })).toBe('生後 14日')
  })

  it('formats exact-month anniversary without days', () => {
    expect(formatAgeLabel({ months: 4, days: 0 })).toBe('生後 4ヶ月')
  })

  it('formats months + days (PRD §13 preferred form)', () => {
    expect(formatAgeLabel({ months: 4, days: 7 })).toBe('生後 4ヶ月と 7日')
  })

  it('handles 0/0 (the birth day)', () => {
    expect(formatAgeLabel({ months: 0, days: 0 })).toBe('生後 0日')
  })
})
