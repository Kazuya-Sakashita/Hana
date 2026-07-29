import { describe, expect, it } from 'vitest'
import { activeImageAccessWhere } from '@/features/uploads/server/active-image-access'

const USER_ID = '8f7e6d5c-4b3a-4291-8765-0123456789ab'

describe('activeImageAccessWhere', () => {
  it('allows only unlinked images or images whose parent memory is active', () => {
    expect(activeImageAccessWhere()).toEqual({
      deletedAt: null,
      OR: [{ memoryId: null }, { memory: { is: { deletedAt: null } } }],
    })
  })

  it('applies the same owner boundary to the image and its parent memory', () => {
    expect(activeImageAccessWhere(USER_ID)).toEqual({
      userId: USER_ID,
      deletedAt: null,
      OR: [{ memoryId: null }, { memory: { is: { userId: USER_ID, deletedAt: null } } }],
    })
  })
})
