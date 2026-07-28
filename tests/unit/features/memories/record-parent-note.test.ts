import { describe, expect, it } from 'vitest'
import {
  PARENT_NOTE_MAX_LENGTH,
  toAiParentNote,
} from '@/features/memories/client/record-parent-note'

describe('toAiParentNote', () => {
  it('omits an empty optional note', () => {
    expect(toAiParentNote('')).toBeNull()
    expect(toAiParentNote('   ')).toBeNull()
  })

  it('trims only surrounding whitespace from a parent note', () => {
    expect(toAiParentNote('  はじめて名前を呼んでくれました  ')).toBe(
      'はじめて名前を呼んでくれました',
    )
  })

  it('keeps the UI limit aligned with the API contract', () => {
    expect(PARENT_NOTE_MAX_LENGTH).toBe(200)
  })
})
