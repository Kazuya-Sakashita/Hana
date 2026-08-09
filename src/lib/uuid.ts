export const BARE_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function canonicalizeBareUuid(value: string): string | null {
  return BARE_UUID_PATTERN.test(value) ? value.toLowerCase() : null
}
