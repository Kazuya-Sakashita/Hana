import { describe, expect, it } from 'vitest'
import { todayDateOnly } from '@/lib/date-only'

describe('todayDateOnly', () => {
  it('uses the Hana calendar day around the UTC boundary', () => {
    const jstAfterMidnight = new Date('2026-07-29T15:30:00.000Z')
    expect(todayDateOnly(jstAfterMidnight)).toBe('2026-07-30')
  })

  it('keeps the preceding Hana day before midnight', () => {
    const jstBeforeMidnight = new Date('2026-07-29T14:30:00.000Z')
    expect(todayDateOnly(jstBeforeMidnight)).toBe('2026-07-29')
  })
})
