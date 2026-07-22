import { describe, expect, it } from 'vitest'
import { childrenQueryKey } from '@/features/children/client/use-children'
import { currentUserQueryKey } from '@/features/me/client/use-current-user'
import { memoriesQueryKey, memoryListQueryKey } from '@/features/memories/client/use-memories'
import { shouldClearQueryCacheOnAuthChange } from '@/lib/query/client'

describe('client query keys', () => {
  it('keeps /me and /children keys stable across pages', () => {
    expect(currentUserQueryKey).toEqual(['me'])
    expect(childrenQueryKey).toEqual(['children'])
  })

  it('normalizes optional memory cursor values', () => {
    expect(memoriesQueryKey).toEqual(['memories'])
    expect(memoryListQueryKey(20)).toEqual(['memories', { limit: 20, cursor: null }])
    expect(memoryListQueryKey(20, 'cursor_1')).toEqual([
      'memories',
      { limit: 20, cursor: 'cursor_1' },
    ])
  })

  it('clears cached private data on auth session changes', () => {
    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'SIGNED_OUT',
        previousUserId: 'user-a',
        currentUserId: null,
      }),
    ).toBe(true)
    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'SIGNED_IN',
        previousUserId: 'user-a',
        currentUserId: 'user-b',
      }),
    ).toBe(true)
    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'TOKEN_REFRESHED',
        previousUserId: 'user-a',
        currentUserId: 'user-b',
      }),
    ).toBe(true)

    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'INITIAL_SESSION',
        previousUserId: null,
        currentUserId: 'user-a',
      }),
    ).toBe(false)
    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'SIGNED_IN',
        previousUserId: 'user-a',
        currentUserId: 'user-a',
      }),
    ).toBe(false)
    expect(
      shouldClearQueryCacheOnAuthChange({
        event: 'TOKEN_REFRESHED',
        previousUserId: 'user-a',
        currentUserId: 'user-a',
      }),
    ).toBe(false)
  })
})
