const ALBUM_MONTH_RE = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/
const TOKYO_TIME_ZONE = 'Asia/Tokyo'

export interface MemoryDateRange {
  recordedFrom: string
  recordedBefore: string
}

export function currentAlbumMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TOKYO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  if (!year || !month) throw new Error('Current album month could not be determined')
  return `${year}-${month}`
}

export function normalizeAlbumMonth(value: string | undefined, currentMonth: string): string {
  if (!value || !ALBUM_MONTH_RE.test(value) || value > currentMonth) return currentMonth
  return value
}

export function albumMonthRange(month: string): MemoryDateRange {
  const { year, monthNumber } = parseAlbumMonth(month)
  const nextYear = monthNumber === 12 ? year + 1 : year
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1
  return {
    recordedFrom: `${year}-${padMonth(monthNumber)}-01`,
    recordedBefore: `${nextYear}-${padMonth(nextMonth)}-01`,
  }
}

export function shiftAlbumMonth(month: string, offset: -1 | 1): string {
  const { year, monthNumber } = parseAlbumMonth(month)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
  return `${shifted.getUTCFullYear()}-${padMonth(shifted.getUTCMonth() + 1)}`
}

export function formatAlbumMonth(month: string): string {
  const { year, monthNumber } = parseAlbumMonth(month)
  return `${year}年${monthNumber}月`
}

function parseAlbumMonth(month: string): { year: number; monthNumber: number } {
  const match = ALBUM_MONTH_RE.exec(month)
  if (!match) throw new Error('Album month must use YYYY-MM format')
  return { year: Number(match[1]), monthNumber: Number(match[2]) }
}

function padMonth(month: number): string {
  return String(month).padStart(2, '0')
}
