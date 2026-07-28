export const PARENT_NOTE_MAX_LENGTH = 200

export function toAiParentNote(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}
