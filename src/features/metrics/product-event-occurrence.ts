const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function productEventOccurrenceMinuteFromEventId(eventId: string): string | null {
  if (!UUID_V7_PATTERN.test(eventId)) return null
  const timestamp = Number.parseInt(eventId.replace(/-/g, '').slice(0, 12), 16)
  if (!Number.isSafeInteger(timestamp) || timestamp % 60_000 !== 0) return null
  try {
    return new Date(timestamp).toISOString().replace('.000Z', 'Z')
  } catch {
    return null
  }
}
