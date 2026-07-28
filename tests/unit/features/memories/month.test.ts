import { describe, expect, it } from 'vitest'
import {
  albumMonthRange,
  currentAlbumMonth,
  formatAlbumMonth,
  normalizeAlbumMonth,
  shiftAlbumMonth,
} from '@/features/memories/month'

describe('album month helpers', () => {
  it('uses the Asia/Tokyo month at the UTC month boundary', () => {
    expect(currentAlbumMonth(new Date('2026-04-30T15:00:00.000Z'))).toBe('2026-05')
  })

  it('normalizes invalid and future months to the current month', () => {
    expect(normalizeAlbumMonth('2026-13', '2026-07')).toBe('2026-07')
    expect(normalizeAlbumMonth('2026-08', '2026-07')).toBe('2026-07')
    expect(normalizeAlbumMonth('2026-06', '2026-07')).toBe('2026-06')
  })

  it('builds inclusive-exclusive ranges across year boundaries', () => {
    expect(albumMonthRange('2026-12')).toEqual({
      recordedFrom: '2026-12-01',
      recordedBefore: '2027-01-01',
    })
  })

  it('moves and formats months without locale-dependent output', () => {
    expect(shiftAlbumMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftAlbumMonth('2026-12', 1)).toBe('2027-01')
    expect(formatAlbumMonth('2026-05')).toBe('2026年5月')
  })
})
